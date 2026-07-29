/**
 * Installed before anything else in the main process so that a failure during
 * module evaluation still produces a readable report instead of Electron's
 * bare "A JavaScript error occurred" dialog.
 *
 * This module must not import any other Orbit module — it has to be safe to
 * evaluate first.
 */
import { app, dialog } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

let reported = false
let started = false

/**
 * Called once the window is up. After this point a stray rejection is logged
 * but must not throw a modal dialog in front of a working app.
 */
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

  // Console first: it is the only channel available in a terminal launch.
  console.error(entry)

  try {
    appendFileSync(crashLogPath(), entry, 'utf8')
  } catch {
    /* nothing more we can do */
  }

  // One dialog per session, so a repeated fault cannot spam the user, and only
  // when the failure actually prevented the app from starting.
  if (!reported && fatal) {
    reported = true
    try {
      dialog.showErrorBox(
        'Orbit Launcher could not start',
        `${detail.slice(0, 1_500)}\n\nA full report was written to:\n${crashLogPath()}`
      )
    } catch {
      /* the dialog module may be unusable this early */
    }
  }
}

export function installCrashHandler(): void {
  process.on('uncaughtException', (error) => {
    // Before the window exists there is nothing to fall back to; afterwards the
    // app stays usable and the failure is recorded instead.
    report('Uncaught exception', error, !started)
    if (!started) app.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    report('Unhandled rejection', reason, !started)
  })
}

installCrashHandler()
