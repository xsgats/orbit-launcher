import { randomUUID } from 'node:crypto'
import type { TaskInfo, TaskStatus } from '../../shared/types'
import { emit } from '../core/events'
import { log } from '../core/logger'

export class TaskCancelledError extends Error {
  constructor(message = 'Cancelled') {
    super(message)
    this.name = 'TaskCancelledError'
  }
}

export interface TaskHandle {
  readonly id: string
  readonly signal: AbortSignal
  setTitle(title: string): void
  setDetail(detail: string): void

  setProgress(progress: number, bytesDone?: number, bytesTotal?: number): void
  addBytes(delta: number): void
  succeed(detail?: string): void
  fail(error: unknown): void
  cancel(): void
  throwIfCancelled(): void

  slice(from: number, to: number): TaskHandle
}

interface TaskRecord {
  info: TaskInfo
  controller: AbortController

  lastSampleBytes: number
  lastSampleAt: number
}

class TaskManager {
  private tasks = new Map<string, TaskRecord>()
  private flushTimer: NodeJS.Timeout | null = null

  create(options: {
    title: string
    detail?: string
    kind?: TaskInfo['kind']
    instanceId?: string | null
    cancellable?: boolean
  }): TaskHandle {
    const id = randomUUID()
    const now = Date.now()
    const record: TaskRecord = {
      info: {
        id,
        title: options.title,
        detail: options.detail ?? '',
        status: 'running',
        progress: -1,
        bytesDone: 0,
        bytesTotal: 0,
        speed: 0,
        startedAt: now,
        endedAt: null,
        error: null,
        instanceId: options.instanceId ?? null,
        cancellable: options.cancellable ?? true,
        kind: options.kind ?? 'other'
      },
      controller: new AbortController(),
      lastSampleBytes: 0,
      lastSampleAt: now
    }
    this.tasks.set(id, record)
    this.schedulePush()
    return this.makeHandle(record, 0, 1)
  }

  private makeHandle(record: TaskRecord, from: number, to: number): TaskHandle {
    const span = to - from
    const self = this

    const handle: TaskHandle = {
      id: record.info.id,
      get signal() {
        return record.controller.signal
      },
      setTitle(title) {
        record.info.title = title
        self.schedulePush()
      },
      setDetail(detail) {
        record.info.detail = detail
        self.schedulePush()
      },
      setProgress(progress, bytesDone, bytesTotal) {
        record.info.progress = progress < 0 ? -1 : from + Math.max(0, Math.min(1, progress)) * span
        if (bytesDone !== undefined) self.sampleSpeed(record, bytesDone)
        if (bytesTotal !== undefined) record.info.bytesTotal = bytesTotal
        self.schedulePush()
      },
      addBytes(delta) {
        self.sampleSpeed(record, record.info.bytesDone + delta)
        self.schedulePush()
      },
      succeed(detail) {
        if (record.info.status !== 'running') return
        record.info.status = 'success'
        record.info.progress = 1
        record.info.endedAt = Date.now()
        record.info.speed = 0
        if (detail) record.info.detail = detail
        self.schedulePush(true)
        self.scheduleReap(record.info.id)
      },
      fail(error) {
        if (record.info.status !== 'running') return
        const cancelled = error instanceof TaskCancelledError || record.controller.signal.aborted
        record.info.status = cancelled ? 'cancelled' : 'error'
        record.info.error = cancelled ? null : error instanceof Error ? error.message : String(error)
        record.info.endedAt = Date.now()
        record.info.speed = 0
        if (!cancelled) log.error('task', `${record.info.title} failed`, error)
        self.schedulePush(true)
        self.scheduleReap(record.info.id, cancelled ? 8_000 : 60_000)
      },
      cancel() {
        record.controller.abort(new TaskCancelledError())
      },
      throwIfCancelled() {
        if (record.controller.signal.aborted) throw new TaskCancelledError()
      },
      slice(sliceFrom, sliceTo) {
        return self.makeHandle(record, from + sliceFrom * span, from + sliceTo * span)
      }
    }

    return handle
  }

  private sampleSpeed(record: TaskRecord, bytesDone: number): void {
    record.info.bytesDone = bytesDone
    const now = Date.now()
    const elapsed = now - record.lastSampleAt
    if (elapsed >= 500) {
      const delta = bytesDone - record.lastSampleBytes
      const instant = (delta / elapsed) * 1000

      record.info.speed = record.info.speed ? record.info.speed * 0.6 + instant * 0.4 : instant
      record.lastSampleBytes = bytesDone
      record.lastSampleAt = now
    }
  }

  cancel(id: string): void {
    const record = this.tasks.get(id)
    if (!record) return
    record.controller.abort(new TaskCancelledError())
    if (record.info.status === 'running' || record.info.status === 'queued') {
      record.info.status = 'cancelled'
      record.info.endedAt = Date.now()
      this.schedulePush(true)
      this.scheduleReap(id, 6_000)
    }
  }

  cancelAllForInstance(instanceId: string): void {
    for (const [id, record] of this.tasks) {
      if (record.info.instanceId === instanceId && record.info.status === 'running') this.cancel(id)
    }
  }

  list(): TaskInfo[] {
    return [...this.tasks.values()].map((r) => ({ ...r.info })).sort((a, b) => b.startedAt - a.startedAt)
  }

  clearFinished(): TaskInfo[] {
    for (const [id, record] of this.tasks) {
      if (record.info.status !== 'running' && record.info.status !== 'queued') this.tasks.delete(id)
    }
    this.push()
    return this.list()
  }

  hasActive(): boolean {
    return [...this.tasks.values()].some((r) => r.info.status === 'running' || r.info.status === 'queued')
  }

  private scheduleReap(id: string, delay = 15_000): void {
    setTimeout(() => {
      const record = this.tasks.get(id)
      if (record && record.info.status === 'success') {
        this.tasks.delete(id)
        this.push()
      }
    }, delay).unref?.()
  }

  private schedulePush(immediate = false): void {
    if (immediate) {
      this.push()
      return
    }
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.push()
    }, 180)
  }

  private push(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    emit('tasks:changed', this.list())
  }


  async run<T>(
    options: Parameters<TaskManager['create']>[0],
    fn: (task: TaskHandle) => Promise<T>
  ): Promise<T> {
    const task = this.create(options)
    try {
      const result = await fn(task)
      task.succeed()
      return result
    } catch (err) {
      task.fail(err)
      throw err
    }
  }
}

export const tasks = new TaskManager()

export function statusIsFinished(status: TaskStatus): boolean {
  return status === 'success' || status === 'error' || status === 'cancelled'
}
