import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { settings } from '../core/settings'
import { ensureDir, exists, hashFile } from '../core/fsx'
import { log } from '../core/logger'
import { request, mapConcurrent } from '../core/net'
import { TaskCancelledError, type TaskHandle } from './tasks'

export interface DownloadSpec {
  url: string

  target: string
  sha1?: string | null
  sha256?: string | null
  sha512?: string | null
  size?: number | null

  mirrors?: string[]
}


function pickDigest(spec: DownloadSpec): { algorithm: 'sha1' | 'sha256' | 'sha512'; expected: string } | null {
  if (spec.sha512) return { algorithm: 'sha512', expected: spec.sha512.toLowerCase() }
  if (spec.sha256) return { algorithm: 'sha256', expected: spec.sha256.toLowerCase() }
  if (spec.sha1) return { algorithm: 'sha1', expected: spec.sha1.toLowerCase() }
  return null
}

export interface DownloadOptions {
  concurrency?: number
  signal?: AbortSignal
  task?: TaskHandle

  onProgress?: (bytesDone: number, bytesTotal: number, filesDone: number, filesTotal: number) => void

  verify?: boolean
}


async function isUpToDate(spec: DownloadSpec, verify: boolean): Promise<boolean> {
  if (!(await exists(spec.target))) return false
  try {
    const info = await stat(spec.target)
    if (info.size === 0) return false
    const digest = pickDigest(spec)
    if (digest && verify) return (await hashFile(spec.target, digest.algorithm)) === digest.expected
    if (spec.size != null) return info.size === spec.size
    return true
  } catch {
    return false
  }
}

async function downloadOne(
  spec: DownloadSpec,
  signal: AbortSignal | undefined,
  verify: boolean,
  onChunk?: (delta: number) => void
): Promise<number> {
  const urls = [spec.url, ...(spec.mirrors ?? [])].filter(Boolean)
  let lastError: unknown = new Error(`No URL provided for ${spec.target}`)

  for (const url of urls) {
    if (signal?.aborted) throw new TaskCancelledError()
    const temp = `${spec.target}.part`
    try {
      await ensureDir(dirname(spec.target))
      const response = await request(url, { signal, timeoutMs: 120_000, headers: { Accept: '*/*' } })
      if (!response.body) throw new Error(`Empty response body from ${url}`)

      const digest = pickDigest(spec)
      const hasher = digest ? createHash(digest.algorithm) : null
      let written = 0

      const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
      source.on('data', (chunk: Buffer) => {
        written += chunk.length
        hasher?.update(chunk)
        onChunk?.(chunk.length)
      })

      await pipeline(source, createWriteStream(temp), { signal })

      if (verify && hasher && digest) {
        const actual = hasher.digest('hex')
        if (actual !== digest.expected) {
          await rm(temp, { force: true })
          throw new Error(`Checksum mismatch for ${spec.target} (expected ${digest.expected}, got ${actual})`)
        }
      }

      await rm(spec.target, { force: true }).catch(() => undefined)
      await rename(temp, spec.target)
      return written
    } catch (err) {
      await rm(temp, { force: true }).catch(() => undefined)
      if (err instanceof TaskCancelledError || signal?.aborted) throw new TaskCancelledError()
      lastError = err
      log.warn('download', `Failed ${url}`, err instanceof Error ? err.message : err)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}





export async function downloadAll(specs: DownloadSpec[], options: DownloadOptions = {}): Promise<void> {
  if (!specs.length) return

  const config = settings.get()
  const concurrency = options.concurrency ?? config.maxConcurrentDownloads
  const verify = options.verify ?? config.verifyDownloads
  const signal = options.signal ?? options.task?.signal


  const needed: DownloadSpec[] = []
  await mapConcurrent(specs, 24, async (spec) => {
    if (!(await isUpToDate(spec, verify))) needed.push(spec)
  })

  if (!needed.length) {
    options.task?.setProgress(1)
    return
  }

  const bytesTotal = needed.reduce((sum, spec) => sum + (spec.size ?? 0), 0)
  let bytesDone = 0
  let filesDone = 0
  const filesTotal = needed.length

  const report = (): void => {
    const progress = bytesTotal > 0 ? Math.min(bytesDone / bytesTotal, 1) : filesDone / filesTotal
    options.task?.setProgress(progress, bytesDone, bytesTotal)
    options.onProgress?.(bytesDone, bytesTotal, filesDone, filesTotal)
  }

  options.task?.setProgress(0, 0, bytesTotal)

  await mapConcurrent(needed, concurrency, async (spec) => {
    if (signal?.aborted) throw new TaskCancelledError()
    await downloadOne(spec, signal, verify, (delta) => {
      bytesDone += delta
      report()
    })
    filesDone += 1
    options.task?.setDetail(`${filesDone} / ${filesTotal} files`)
    report()
  })

  options.task?.setProgress(1, bytesDone, bytesTotal)
}


export async function downloadFile(spec: DownloadSpec, options: DownloadOptions = {}): Promise<void> {
  const config = settings.get()
  const verify = options.verify ?? config.verifyDownloads
  const signal = options.signal ?? options.task?.signal

  if (await isUpToDate(spec, verify)) {
    options.task?.setProgress(1)
    return
  }

  let bytesDone = 0
  const total = spec.size ?? 0
  await downloadOne(spec, signal, verify, (delta) => {
    bytesDone += delta
    options.task?.setProgress(total > 0 ? Math.min(bytesDone / total, 1) : -1, bytesDone, total)
    options.onProgress?.(bytesDone, total, 0, 1)
  })
  options.task?.setProgress(1, bytesDone, total || bytesDone)
}
