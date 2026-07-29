// Must stay first: it installs the crash reporter before anything else can throw.
import { markReady } from './core/crash'

import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { emit } from './core/events'
import { log } from './core/logger'
import { MEDIA_SCHEME, registerMediaProtocol, registerMediaProtocolPrivileges } from './core/media'
import { paths } from './core/paths'
import { settings } from './core/settings'
import { accounts } from './services/accounts'
import { instances } from './services/instances'
import { java } from './services/java'
import { killAll, runningCount } from './services/launcher'
import { notifications } from './services/notifications'
import { tasks } from './services/tasks'
import { initUpdater } from './services/updater'

// Keep every install under a single, predictable folder name.
app.setPath('userData', join(app.getPath('appData'), 'OrbitLauncher'))
app.setAppUserModelId('app.orbitlauncher.desktop')

registerMediaProtocolPrivileges()

// Keep painting while capturing, even if another window covers Orbit.
if (!app.isPackaged && process.env.ORBIT_CAPTURE) {
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-background-timer-throttling')
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function resourcePath(...parts: string[]): string {
  return app.isPackaged
    ? join(process.resourcesPath, ...parts)
    : join(app.getAppPath(), 'resources', ...parts)
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1040,
    minHeight: 660,
    show: false,
    frame: false,
    backgroundColor: '#0A0B14',
    title: 'Orbit Launcher',
    icon: resourcePath('icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
      // The renderer only ever loads local assets plus remote images.
      webSecurity: true
    }
  })

  window.once('ready-to-show', () => {
    window.show()
    if (settings.get().startMaximized) window.maximize()
  })

  window.on('maximize', () => window.webContents.send('window:maximized', true))
  window.on('unmaximize', () => window.webContents.send('window:maximized', false))

  window.on('close', (event) => {
    if (quitting) return

    if (settings.get().minimizeToTray) {
      event.preventDefault()
      window.hide()
      return
    }

    const running = runningCount()
    const busy = tasks.hasActive()
    if (running > 0 || busy) {
      event.preventDefault()
      const choice = dialog.showMessageBoxSync(window, {
        type: 'question',
        buttons: ['Quit anyway', 'Keep Orbit open'],
        defaultId: 1,
        cancelId: 1,
        title: 'Orbit Launcher',
        message: running > 0 ? 'Minecraft is still running' : 'Downloads are still in progress',
        detail:
          running > 0
            ? 'Quitting Orbit will leave the game running without launcher features like playtime tracking.'
            : 'Quitting now will cancel the tasks that have not finished.'
      })
      if (choice === 0) {
        quitting = true
        window.destroy()
      }
    }
  })

  // Never let the app navigate away from its own UI.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const isDev = process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)
    if (!isDev && !url.startsWith('file://')) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (!app.isPackaged && process.env.ORBIT_CAPTURE) {
    captureRoutes(window, process.env.ORBIT_CAPTURE).catch((err) => {
      log.error('capture', 'Capture run failed', err)
      if (process.env.ORBIT_CAPTURE_EXIT) app.exit(1)
    })
  }

  return window
}

/**
 * Development-only helper: walks the main routes and writes a PNG of each one,
 * so UI changes can be reviewed without driving the app by hand.
 * Enabled by setting ORBIT_CAPTURE to an output directory.
 */
async function captureRoutes(window: BrowserWindow, outDir: string): Promise<void> {
  window.webContents.on('console-message', (_event, level, message, line, source) => {
    log.info('renderer', `[${level}] ${message} (${source}:${line})`)
  })
  window.webContents.on('did-fail-load', (_event, code, description) => {
    log.error('renderer', `Load failed ${code}: ${description}`)
  })

  const routes: [string, string][] = process.env.ORBIT_CAPTURE_ROUTES
    ? (JSON.parse(process.env.ORBIT_CAPTURE_ROUTES) as [string, string][])
    : [
        ['/', 'home'],
        ['/instances', 'instances'],
        ['/discover', 'discover'],
        ['/downloads', 'downloads'],
        ['/accounts', 'accounts'],
        ['/java', 'java'],
        ['/news', 'news'],
        ['/settings', 'settings']
      ]

  const { mkdir, writeFile } = await import('node:fs/promises')
  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  await new Promise<void>((resolve) => window.webContents.once('did-finish-load', () => resolve()))
  window.show()
  window.moveTop()
  window.focus()
  await wait(3_000)
  await mkdir(outDir, { recursive: true })

  const domReport = await window.webContents.executeJavaScript(
    `JSON.stringify({ children: document.getElementById('root')?.childElementCount ?? -1, html: document.body.innerHTML.length, bg: getComputedStyle(document.body).backgroundColor })`
  )
  log.info('capture', `DOM: ${domReport}`)

  for (const entry of routes) {
    const [route, name] = entry
    try {
      await window.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(route)}`)
      await wait(1_600)
      const image = await window.webContents.capturePage()
      await writeFile(join(outDir, `${name}.png`), image.toPNG())
      log.info('capture', `Wrote ${name}.png (${image.getSize().width}x${image.getSize().height})`)
    } catch (err) {
      log.error('capture', `Failed on ${route}`, err)
    }
  }

  if (process.env.ORBIT_CAPTURE_EXIT) app.exit(0)
}

function createTray(): void {
  if (tray) return
  try {
    const icon = nativeImage.createFromPath(resourcePath('icons', 'orbit-32.png'))
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
    tray.setToolTip('Orbit Launcher')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Open Orbit',
          click: () => {
            mainWindow?.show()
            mainWindow?.focus()
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ])
    )
    tray.on('double-click', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
  } catch (err) {
    log.warn('tray', 'Could not create the tray icon', err)
  }
}

async function bootstrap(): Promise<void> {
  log.init()
  paths.ensure()

  await settings.load()
  paths.ensure()

  registerMediaProtocol()
  registerIpc()

  await Promise.all([accounts.load(), notifications.load(), instances.load(), java.load()])

  mainWindow = createWindow()
  if (settings.get().minimizeToTray) createTray()

  // Warm caches without blocking first paint. None of these may take the app
  // down if they fail — they are all best-effort.
  setTimeout(() => {
    void accounts.refreshExpiringInBackground().catch((err) =>
      log.warn('orbit', 'Background account refresh failed', err)
    )
    void java.scan().catch((err) => log.warn('orbit', 'Java scan failed', err))
    void initUpdater().catch((err) => log.warn('orbit', 'Updater init failed', err))
  }, 2_500)

  markReady()

  log.info('orbit', `Ready — data root ${paths.dataRoot}`)
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(bootstrap).catch((err) => {
    log.error('orbit', 'Startup failed', err)
    dialog.showErrorBox('Orbit Launcher could not start', err instanceof Error ? err.message : String(err))
    app.exit(1)
  })

  app.on('window-all-closed', () => {
    if (!settings.get().minimizeToTray) app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })

  app.on('before-quit', () => {
    quitting = true
    void settings.save()
  })

  app.on('will-quit', () => {
    tray?.destroy()
  })
}

export { MEDIA_SCHEME, emit, killAll }
