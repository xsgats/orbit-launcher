import { app } from 'electron'
import type { UpdateState } from '../../shared/types'
import { emit } from '../core/events'
import { log } from '../core/logger'
import { settings } from '../core/settings'
import { notifications } from './notifications'

type ElectronUpdater = typeof import('electron-updater')

const RELEASE_PAGE = 'https://github.com/xsgats/orbit-launcher/releases/tag'

let state: UpdateState = {
  status: 'idle',
  version: null,
  notes: null,
  progress: 0,
  error: null,
  currentVersion: app.getVersion(),
  releaseUrl: null
}

/** electron-builder tags GitHub releases as v${version}. */
function releaseUrlFor(version: string | undefined): string | null {
  return version ? `${RELEASE_PAGE}/v${version}` : null
}

let autoUpdater: ElectronUpdater['autoUpdater'] | null = null
let checkTimer: NodeJS.Timeout | null = null

function publish(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  emit('updater:state', state)
}

function notesFrom(info: { releaseNotes?: string | { note: string | null }[] | null }): string | null {
  if (!info.releaseNotes) return null
  if (typeof info.releaseNotes === 'string') {
    return info.releaseNotes.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 2_000)
  }
  return info.releaseNotes
    .map((entry) => entry.note ?? '')
    .filter(Boolean)
    .join('\n')
    .slice(0, 2_000)
}

export async function initUpdater(): Promise<void> {
  if (!app.isPackaged) {
    publish({ status: 'idle' })
    return
  }

  try {


    const imported = (await import('electron-updater')) as ElectronUpdater & { default?: ElectronUpdater }
    autoUpdater = imported.autoUpdater ?? imported.default?.autoUpdater ?? null
  } catch (err) {
    log.warn('updater', 'electron-updater is unavailable', err)
    return
  }

  if (!autoUpdater) {
    log.warn('updater', 'electron-updater did not expose an autoUpdater instance')
    return
  }

  const config = settings.get()
  autoUpdater.autoDownload = config.autoDownloadUpdates
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = config.updateChannel === 'beta'
  autoUpdater.logger = {
    info: (message: unknown) => log.info('updater', String(message)),
    warn: (message: unknown) => log.warn('updater', String(message)),
    error: (message: unknown) => log.error('updater', String(message)),
    debug: (message: unknown) => log.debug('updater', String(message))
  }

  autoUpdater.on('checking-for-update', () => publish({ status: 'checking', error: null }))

  autoUpdater.on('update-available', (info) => {
    publish({
      status: 'available',
      version: info.version,
      notes: notesFrom(info),
      releaseUrl: releaseUrlFor(info.version)
    })
    notifications.push({
      title: `Orbit ${info.version} is available`,
      body: settings.get().autoDownloadUpdates
        ? 'Downloading in the background — you can keep playing.'
        : 'Open Settings → Updates to download it.',
      level: 'info',
      action: { label: 'Updates', route: '/settings/updates' }
    })
  })

  autoUpdater.on('update-not-available', () => publish({ status: 'up-to-date', progress: 0 }))

  autoUpdater.on('download-progress', (progress) => {
    publish({ status: 'downloading', progress: (progress.percent ?? 0) / 100 })
  })

  autoUpdater.on('update-downloaded', (info) => {
    publish({
      status: 'ready',
      version: info.version,
      progress: 1,
      releaseUrl: releaseUrlFor(info.version)
    })
    notifications.push({
      title: `Orbit ${info.version} is ready to install`,
      body: 'Restart Orbit to finish updating.',
      level: 'success',
      action: { label: 'Updates', route: '/settings/updates' }
    })
  })

  autoUpdater.on('error', (err) => {
    publish({ status: 'error', error: err?.message ?? String(err) })
  })

  if (config.autoCheckUpdates) {
    setTimeout(() => void check(), 8_000)

    checkTimer = setInterval(() => void check(), 6 * 60 * 60 * 1000)
    checkTimer.unref?.()
  }
}

export async function check(): Promise<UpdateState> {
  if (!autoUpdater) {
    publish({ status: app.isPackaged ? 'error' : 'idle', error: app.isPackaged ? 'Updater unavailable' : null })
    return state
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    publish({ status: 'error', error: err instanceof Error ? err.message : String(err) })
  }
  return state
}

export async function download(): Promise<void> {
  if (!autoUpdater) return
  publish({ status: 'downloading', progress: 0 })
  await autoUpdater.downloadUpdate().catch((err) => {
    publish({ status: 'error', error: err instanceof Error ? err.message : String(err) })
  })
}

export function installNow(): void {
  if (!autoUpdater) return
  setImmediate(() => autoUpdater!.quitAndInstall(false, true))
}

export function getState(): UpdateState {
  return state
}
