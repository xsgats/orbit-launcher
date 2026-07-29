import { createWriteStream, mkdirSync, renameSync, statSync, WriteStream } from 'node:fs'
import { paths } from './paths'

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MAX_LOG_BYTES = 4 * 1024 * 1024

class Logger {
  private stream: WriteStream | null = null
  private minLevel: Level = process.env.NODE_ENV === 'development' ? 'debug' : 'info'

  init(): void {
    try {
      mkdirSync(paths.logsDir, { recursive: true })
      const file = paths.launcherLogFile
      try {
        if (statSync(file).size > MAX_LOG_BYTES) renameSync(file, `${file}.1`)
      } catch {

      }
      this.stream = createWriteStream(file, { flags: 'a' })
      this.info('orbit', `--- Orbit Launcher session started ${new Date().toISOString()} ---`)
    } catch (err) {
      console.error('Failed to open launcher log', err)
    }
  }

  private write(level: Level, scope: string, message: string, extra?: unknown): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.minLevel]) return
    const time = new Date().toISOString()
    let line = `${time} [${level.toUpperCase().padEnd(5)}] [${scope}] ${message}`
    if (extra !== undefined) {
      const detail = extra instanceof Error ? (extra.stack ?? extra.message) : safeStringify(extra)
      line += `\n    ${detail}`
    }
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
    this.stream?.write(`${line}\n`)
  }

  debug(scope: string, message: string, extra?: unknown): void {
    this.write('debug', scope, message, extra)
  }
  info(scope: string, message: string, extra?: unknown): void {
    this.write('info', scope, message, extra)
  }
  warn(scope: string, message: string, extra?: unknown): void {
    this.write('warn', scope, message, extra)
  }
  error(scope: string, message: string, extra?: unknown): void {
    this.write('error', scope, message, extra)
  }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const log = new Logger()
