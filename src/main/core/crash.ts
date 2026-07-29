







import { app, dialog } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

let reported = false
let started = false





export function markReady(): void {
  started = true
}

function crashLogPath(): string {
  const root = join(app.getPath('appData'), 'OrbitLauncher', 'logs')
  mkdirSync(root, { recursive: true })
  return join(root, 'startup-crash.log')
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function report(kind: string, error: unknown, fatal: boolean): void {
  const detail = describe(error)
  const entry = `\n=== ${kind} @ ${new Date().toISOString()} ===\n${detail}\n`


  console.error(entry)

  try {
    appendFileSync(crashLogPath(), entry, 'utf8')
  } catch {

  }



  if (!reported && fatal) {
    reported = true
    try {
      dialog.showErrorBox(
        'Orbit Launcher could not start',
        `${detail.slice(0, 1_500)}\n\nA full report was written to:\n${crashLogPath()}`
      )
    } catch {

    }
  }
}

export function installCrashHandler(): void {
  process.on('uncaughtException', (error) => {


    report('Uncaught exception', error, !started)
    if (!started) app.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    report('Unhandled rejection', reason, !started)
  })
}

installCrashHandler()
