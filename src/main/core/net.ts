import { join } from 'node:path'
import { app } from 'electron'
import { ensureDir, readJson, writeJson } from './fsx'
import { paths } from './paths'
import { log } from './logger'

export const USER_AGENT = `OrbitLauncher/${app.getVersion?.() ?? '1.0.0'} (+https://orbitlauncher.app)`

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly body?: string
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number
  retries?: number

  noRetryStatuses?: number[]
}

const DEFAULT_TIMEOUT = 30_000

export async function request(url: string, options: RequestOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT, retries = 3, noRetryStatuses = [], ...init } = options
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const externalSignal = init.signal
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort(externalSignal.reason)
      else externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true })
    }
    const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...(init.headers as Record<string, string> | undefined)
        }
      })

      if (response.ok) return response

      const retryable = response.status >= 500 || response.status === 429
      if (!retryable || noRetryStatuses.includes(response.status) || attempt === retries) {
        const body = await response.text().catch(() => '')
        throw new HttpError(`${response.status} ${response.statusText} for ${url}`, response.status, url, body)
      }
      lastError = new HttpError(`${response.status} ${response.statusText}`, response.status, url)
    } catch (err) {
      if (externalSignal?.aborted) throw err
      lastError = err
      if (err instanceof HttpError && !(err.status >= 500 || err.status === 429)) throw err
      if (attempt === retries) break
    } finally {
      clearTimeout(timer)
    }

    const backoff = Math.min(500 * 2 ** attempt, 6_000) + Math.random() * 250
    await new Promise((resolve) => setTimeout(resolve, backoff))
  }

  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`)
}

export async function getJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(url, options)
  return (await response.json()) as T
}

export async function postJson<T>(url: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  const response = await request(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> | undefined) }
  })
  return (await response.json()) as T
}

export async function getBuffer(url: string, options: RequestOptions = {}): Promise<Buffer> {
  const response = await request(url, {
    ...options,
    headers: { Accept: '*/*', ...((options.headers ?? {}) as Record<string, string>) }
  })
  return Buffer.from(await response.arrayBuffer())
}





interface CacheEnvelope<T> {
  fetchedAt: number
  value: T
}

const memoryCache = new Map<string, CacheEnvelope<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

function cacheFile(key: string): string {
  const safe = key.replace(/[^a-z0-9._-]/gi, '_').slice(0, 180)
  return join(paths.metaCacheDir, `${safe}.json`)
}





export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now()

  const mem = memoryCache.get(key) as CacheEnvelope<T> | undefined
  if (mem && now - mem.fetchedAt < ttlMs) return mem.value

  const pending = inflight.get(key) as Promise<T> | undefined
  if (pending) return pending

  const task = (async (): Promise<T> => {
    const file = cacheFile(key)
    let disk: CacheEnvelope<T> | null = null
    if (!mem) {
      disk = await readJson<CacheEnvelope<T>>(file)
      if (disk && now - disk.fetchedAt < ttlMs) {
        memoryCache.set(key, disk)
        return disk.value
      }
    }

    try {
      const value = await loader()
      const envelope: CacheEnvelope<T> = { fetchedAt: Date.now(), value }
      memoryCache.set(key, envelope)
      await ensureDir(paths.metaCacheDir)
      await writeJson(file, envelope).catch(() => undefined)
      return value
    } catch (err) {
      const stale = mem ?? disk
      if (stale) {
        log.warn('net', `Using stale cache for "${key}" after fetch failure`, err)
        return stale.value
      }
      throw err
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, task)
  return task
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    memoryCache.clear()
    return
  }
  for (const key of [...memoryCache.keys()]) {
    if (key.startsWith(prefix)) memoryCache.delete(key)
  }
}


export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const limit = Math.max(1, Math.min(concurrency, items.length))

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const index = cursor++
        if (index >= items.length) return
        results[index] = await worker(items[index], index)
      }
    })
  )

  return results
}
