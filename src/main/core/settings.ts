import { app } from 'electron'
import { cpus, totalmem } from 'node:os'
import type { AppSettings } from '../../shared/types'
import { emit } from './events'
import { readJson, writeJson } from './fsx'
import { log } from './logger'
import { paths } from './paths'

function defaultMaxMemory(): number {
  const totalMb = Math.floor(totalmem() / (1024 * 1024))
  // Leave the OS room to breathe; cap the default so modpacks still get plenty.
  if (totalMb >= 32_000) return 8192
  if (totalMb >= 16_000) return 6144
  if (totalMb >= 12_000) return 4096
  if (totalMb >= 8_000) return 3072
  return 2048
}

/**
 * Injected by the bundler from build-time environment variables. Empty in a
 * plain `npm run build`, which leaves Orbit in bring-your-own-credentials mode.
 */
declare const __ORBIT_MSA_CLIENT_ID__: string
declare const __ORBIT_CURSEFORGE_API_KEY__: string

/**
 * Orbit's own Azure application registration.
 *
 * This is a public identifier, not a secret: the OAuth flow is a public client
 * secured by PKCE, and Microsoft expects desktop apps to ship their client id
 * in the binary. There is deliberately no client secret anywhere in Orbit.
 */
const ORBIT_MSA_CLIENT_ID = 'abb4f9d6-d842-462b-b755-e0f69fa2c81d'

const BUILT_IN_MSA_CLIENT_ID =
  (typeof __ORBIT_MSA_CLIENT_ID__ === 'string' ? __ORBIT_MSA_CLIENT_ID__ : '') || ORBIT_MSA_CLIENT_ID

/** No key is shipped: CurseForge keys are secrets and must not be redistributed. */
const BUILT_IN_CURSEFORGE_KEY =
  typeof __ORBIT_CURSEFORGE_API_KEY__ === 'string' ? __ORBIT_CURSEFORGE_API_KEY__ : ''

export const DEFAULT_JAVA_ARGS =
  '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 ' +
  '-XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M -XX:+DisableExplicitGC -XX:+AlwaysPreTouch'

function createDefaults(): AppSettings {
  return {
    theme: 'dark',
    accentColor: '#6C7BFF',
    reduceMotion: false,
    uiScale: 1,
    instanceCardSize: 'regular',
    showInstanceBackgrounds: true,

    memoryMinMb: 1024,
    memoryMaxMb: defaultMaxMemory(),
    javaArgs: DEFAULT_JAVA_ARGS,
    defaultJavaRuntimeId: null,
    autoDownloadJava: true,

    closeLauncherOnLaunch: false,
    openLogsOnLaunch: false,
    windowWidth: 1280,
    windowHeight: 720,
    startMaximized: false,
    fullscreen: false,
    allowParallelInstances: true,
    confirmBeforeLaunchingSnapshots: false,

    maxConcurrentDownloads: Math.max(6, Math.min(16, cpus().length * 2)),
    maxConcurrentTasks: 2,
    verifyDownloads: true,

    dataRoot: paths.dataRoot,
    instancesDir: paths.instancesDir,
    javaDir: paths.javaDir,
    sharedDir: paths.sharedDir,

    // Runtime environment wins over the baked-in value, so a single build can
    // still be pointed at a different registration for testing.
    curseforgeApiKey: process.env.ORBIT_CURSEFORGE_API_KEY || BUILT_IN_CURSEFORGE_KEY,
    enableModrinth: true,
    enableCurseForge: true,
    msaClientId: process.env.ORBIT_MSA_CLIENT_ID || BUILT_IN_MSA_CLIENT_ID,

    autoCheckUpdates: true,
    autoDownloadUpdates: true,
    updateChannel: 'stable',

    minimizeToTray: false,
    launchOnStartup: false,
    showNewsOnHome: true,
    checkModUpdatesOnOpen: true,
    notifyOnGameCrash: true,
    notifyOnDownloadComplete: true,
    language: 'en',
    analyticsEnabled: false
  }
}

class SettingsStore {
  private current: AppSettings = createDefaults()
  private saveTimer: NodeJS.Timeout | null = null

  async load(): Promise<AppSettings> {
    const stored = await readJson<Partial<AppSettings>>(paths.settingsFile)
    const defaults = createDefaults()
    this.current = { ...defaults, ...(stored ?? {}) }

    // A blank value saved by an older build must not shadow a newer built-in
    // default — otherwise upgrading would never pick up a shipped client id.
    if (!this.current.msaClientId.trim()) this.current.msaClientId = defaults.msaClientId

    // A user-relocated library root wins over the default layout, unless an
    // explicit ORBIT_DATA_ROOT is pinning the location.
    if (!process.env.ORBIT_DATA_ROOT && stored?.dataRoot && stored.dataRoot !== defaults.dataRoot) {
      paths.setRoot(stored.dataRoot)
      this.current.instancesDir = paths.instancesDir
      this.current.javaDir = paths.javaDir
      this.current.sharedDir = paths.sharedDir
    }
    this.current.dataRoot = paths.dataRoot
    paths.ensure()

    this.applySystemSideEffects()
    return this.current
  }

  get(): AppSettings {
    return this.current
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const previousRoot = this.current.dataRoot
    this.current = { ...this.current, ...patch }

    if (patch.dataRoot && patch.dataRoot !== previousRoot) {
      paths.setRoot(patch.dataRoot)
      this.current.instancesDir = paths.instancesDir
      this.current.javaDir = paths.javaDir
      this.current.sharedDir = paths.sharedDir
      log.info('settings', `Library root moved to ${patch.dataRoot}`)
    }

    this.applySystemSideEffects()
    this.scheduleSave()
    emit('settings:changed', this.current)
    return this.current
  }

  async reset(): Promise<AppSettings> {
    const preserved = {
      curseforgeApiKey: this.current.curseforgeApiKey,
      msaClientId: this.current.msaClientId,
      dataRoot: this.current.dataRoot
    }
    this.current = { ...createDefaults(), ...preserved }
    await this.save()
    emit('settings:changed', this.current)
    return this.current
  }

  private applySystemSideEffects(): void {
    try {
      if (app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: this.current.launchOnStartup, args: ['--startup'] })
      }
    } catch (err) {
      log.warn('settings', 'Could not update the startup entry', err)
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.save(), 400)
  }

  async save(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    try {
      await writeJson(paths.settingsFile, this.current)
    } catch (err) {
      log.error('settings', 'Failed to persist settings', err)
    }
  }
}

export const settings = new SettingsStore()
