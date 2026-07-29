import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CrashReport, LogLevel, LogLine } from '../../shared/types'
import { emit } from '../core/events'
import { exists, removePath } from '../core/fsx'

const MAX_LINES = 6_000
const FLUSH_MS = 120

function normalizeLevel(raw: string): LogLevel {
  const level = raw.toLowerCase()
  if (level === 'warning') return 'warn'
  if (level === 'severe' || level === 'fatal') return 'fatal'
  if (['trace', 'debug', 'info', 'warn', 'error'].includes(level)) return level as LogLevel
  return 'info'
}





class LogParser {
  private buffer = ''
  private seq = 0

  push(chunk: string, fallbackLevel: LogLevel): LogLine[] {
    this.buffer += chunk
    const lines: LogLine[] = []

    while (true) {
      const start = this.buffer.indexOf('<log4j:Event')
      if (start === -1) break


      if (start > 0) {
        lines.push(...this.emitPlain(this.buffer.slice(0, start), fallbackLevel))
        this.buffer = this.buffer.slice(start)
        continue
      }

      const end = this.buffer.indexOf('</log4j:Event>')
      if (end === -1) break

      const block = this.buffer.slice(0, end + '</log4j:Event>'.length)
      this.buffer = this.buffer.slice(end + '</log4j:Event>'.length)
      const parsed = this.parseEvent(block)
      if (parsed) lines.push(parsed)
    }


    if (!this.buffer.includes('<log4j:Event')) {
      const lastNewline = this.buffer.lastIndexOf('\n')
      if (lastNewline !== -1) {
        lines.push(...this.emitPlain(this.buffer.slice(0, lastNewline + 1), fallbackLevel))
        this.buffer = this.buffer.slice(lastNewline + 1)
      }
    }

    if (this.buffer.length > 512 * 1024) this.buffer = this.buffer.slice(-64 * 1024)
    return lines
  }

  private emitPlain(text: string, level: LogLevel): LogLine[] {
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => ({
        seq: this.seq++,
        time: Date.now(),
        level,
        thread: null,
        logger: null,
        message: line
      }))
  }

  private parseEvent(block: string): LogLine | null {
    const attributes = /<log4j:Event([^>]*)>/.exec(block)?.[1] ?? ''
    const attr = (name: string): string => new RegExp(`${name}="([^"]*)"`).exec(attributes)?.[1] ?? ''

    const message = extractCdata(block, 'log4j:Message')
    const throwable = extractCdata(block, 'log4j:Throwable')
    if (message === null && throwable === null) return null

    const combined = [message, throwable].filter((part): part is string => Boolean(part)).join('\n')

    return {
      seq: this.seq++,
      time: Number(attr('timestamp')) || Date.now(),
      level: normalizeLevel(attr('level') || 'info'),
      thread: attr('thread') || null,
      logger: attr('logger') || null,
      message: decodeXmlEntities(combined)
    }
  }

  reset(): void {
    this.buffer = ''
  }
}

function extractCdata(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`).exec(block)
  return match ? match[1] : null
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}





interface Session {
  lines: LogLine[]
  parser: LogParser
  pending: LogLine[]
  timer: NodeJS.Timeout | null

  noteSeq: number
}

class LogStore {
  private sessions = new Map<string, Session>()

  private session(instanceId: string): Session {
    let session = this.sessions.get(instanceId)
    if (!session) {
      session = { lines: [], parser: new LogParser(), pending: [], timer: null, noteSeq: -1 }
      this.sessions.set(instanceId, session)
    }
    return session
  }


  begin(instanceId: string): void {
    const session = this.session(instanceId)
    session.lines = []
    session.pending = []
    session.parser.reset()
    this.note(instanceId, '─── Session started ───')
  }

  ingest(instanceId: string, chunk: string, stream: 'stdout' | 'stderr'): void {
    const session = this.session(instanceId)
    const parsed = session.parser.push(chunk, stream === 'stderr' ? 'error' : 'stdout')
    if (parsed.length) this.append(instanceId, parsed)
  }


  note(instanceId: string, message: string, level: LogLevel = 'launcher'): void {
    const session = this.session(instanceId)
    this.append(instanceId, [
      { seq: session.noteSeq--, time: Date.now(), level, thread: null, logger: 'Orbit', message }
    ])
  }

  private append(instanceId: string, lines: LogLine[]): void {
    const session = this.session(instanceId)
    session.lines.push(...lines)
    if (session.lines.length > MAX_LINES) session.lines.splice(0, session.lines.length - MAX_LINES)

    session.pending.push(...lines)
    if (!session.timer) {
      session.timer = setTimeout(() => {
        session.timer = null
        const batch = session.pending
        session.pending = []
        if (batch.length) emit('instance:log', { instanceId, lines: batch })
      }, FLUSH_MS)
    }
  }

  get(instanceId: string): LogLine[] {
    return [...(this.sessions.get(instanceId)?.lines ?? [])]
  }

  clear(instanceId: string): void {
    const session = this.sessions.get(instanceId)
    if (!session) return
    session.lines = []
    session.pending = []
    emit('instance:log', { instanceId, lines: [] })
  }

  async export(instanceId: string, targetPath: string): Promise<string> {
    const lines = this.get(instanceId)
    const text = lines
      .map((line) => {
        const time = new Date(line.time).toISOString()
        const thread = line.thread ? ` [${line.thread}]` : ''
        const logger = line.logger ? ` [${line.logger}]` : ''
        return `${time} [${line.level.toUpperCase()}]${thread}${logger} ${line.message}`
      })
      .join('\r\n')
    await writeFile(targetPath, text, 'utf8')
    return targetPath
  }
}

export const logStore = new LogStore()





function summarizeCrash(text: string): string {
  const description = /Description:\s*(.+)/.exec(text)?.[1]?.trim()
  const exception = /^(?:\t)?(java\.\w[\w.$]*(?:Exception|Error)[^\n]*)/m.exec(text)?.[1]?.trim()
  const stitched = [description, exception].filter(Boolean).join(' — ')
  return stitched || text.split('\n').slice(0, 3).join(' ').trim().slice(0, 200) || 'Unknown crash'
}

export async function listCrashReports(instanceId: string, gameDir: string): Promise<CrashReport[]> {
  const dir = join(gameDir, 'crash-reports')
  const entries = await readdir(dir).catch(() => [] as string[])

  const reports: CrashReport[] = []
  for (const fileName of entries) {
    if (!fileName.endsWith('.txt')) continue
    const full = join(dir, fileName)
    const info = await stat(full).catch(() => null)
    if (!info) continue

    let summary = 'Crash report'
    try {
      const head = (await readFile(full, 'utf8')).slice(0, 8_000)
      summary = summarizeCrash(head)
    } catch {

    }

    reports.push({
      id: fileName,
      instanceId,
      path: full,
      fileName,
      createdAt: info.mtimeMs,
      sizeBytes: info.size,
      summary,
      exitCode: null
    })
  }

  return reports.sort((a, b) => b.createdAt - a.createdAt)
}


export async function findCrashReportSince(gameDir: string, since: number): Promise<string | null> {
  const dir = join(gameDir, 'crash-reports')
  if (!(await exists(dir))) return null

  const entries = await readdir(dir).catch(() => [] as string[])
  let newest: { path: string; time: number } | null = null

  for (const fileName of entries) {
    if (!fileName.endsWith('.txt')) continue
    const full = join(dir, fileName)
    const info = await stat(full).catch(() => null)
    if (!info || info.mtimeMs < since - 2_000) continue
    if (!newest || info.mtimeMs > newest.time) newest = { path: full, time: info.mtimeMs }
  }

  return newest?.path ?? null
}

export async function readCrashReport(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

export async function deleteCrashReport(path: string): Promise<void> {
  await removePath(path)
}
