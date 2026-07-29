/**
 * Shared domain model for Orbit Launcher.
 * These types are the contract between the main process and the renderer.
 */

/* ------------------------------------------------------------------ */
/* Loaders & versions                                                  */
/* ------------------------------------------------------------------ */

export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

export const LOADER_LABELS: Record<LoaderType, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

export type MinecraftVersionType = 'release' | 'snapshot' | 'old_beta' | 'old_alpha'

export interface MinecraftVersionSummary {
  id: string
  type: MinecraftVersionType
  releaseTime: string
  url: string
  /** Java major version required by Mojang's own metadata, when known. */
  javaMajor?: number
}

export interface LoaderVersion {
  id: string
  /** Marks the maintainer-recommended build. */
  stable: boolean
  recommended?: boolean
  latest?: boolean
  releaseTime?: string
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export interface SkinInfo {
  id: string
  url: string
  variant: 'CLASSIC' | 'SLIM'
  state: string
}

export interface CapeInfo {
  id: string
  url: string
  alias: string
  state: string
}

export interface Account {
  /** Minecraft profile UUID (dashless). */
  id: string
  username: string
  uuid: string
  xuid: string | null
  /** Orbit only supports genuine Microsoft/Mojang accounts. */
  type: 'microsoft'
  addedAt: number
  /** Epoch ms at which the Minecraft access token expires. */
  expiresAt: number
  lastRefreshed: number
  skins: SkinInfo[]
  capes: CapeInfo[]
  /** Set when a silent refresh failed and the user must sign in again. */
  needsReauth?: boolean
  ownsMinecraft: boolean
}

export interface AuthProgress {
  stage:
    | 'waiting-for-user'
    | 'microsoft'
    | 'xbox-live'
    | 'xsts'
    | 'minecraft'
    | 'entitlements'
    | 'profile'
    | 'done'
    | 'error'
  message: string
  detail?: string
}

/* ------------------------------------------------------------------ */
/* Java                                                                */
/* ------------------------------------------------------------------ */

export interface JavaRuntime {
  id: string
  /** Absolute path to javaw.exe / java.exe */
  path: string
  version: string
  majorVersion: number
  vendor: string
  arch: string
  /** True when Orbit downloaded and owns this runtime. */
  managed: boolean
  label: string
}

export interface JavaDownloadOption {
  majorVersion: number
  label: string
  description: string
  installed: boolean
}

/* ------------------------------------------------------------------ */
/* Instances                                                           */
/* ------------------------------------------------------------------ */

export type InstanceIcon =
  | { type: 'preset'; key: string }
  | { type: 'file'; file: string }
  | { type: 'url'; url: string }

export interface InstanceSettings {
  /** `null` means "inherit the global default". */
  memoryMinMb: number | null
  memoryMaxMb: number | null
  javaRuntimeId: string | null
  javaPathOverride: string | null
  javaArgs: string | null
  environmentVariables: Record<string, string> | null
  preLaunchCommand: string | null
  postExitCommand: string | null
  wrapperCommand: string | null
  windowWidth: number | null
  windowHeight: number | null
  startMaximized: boolean | null
  fullscreen: boolean | null
  closeLauncherOnLaunch: boolean | null
  openLogsOnLaunch: boolean | null
  quickPlaySingleplayer: string | null
  quickPlayServer: string | null
  showSnapshotWarning: boolean | null
  useSystemGpuPreference: boolean | null
}

export function emptyInstanceSettings(): InstanceSettings {
  return {
    memoryMinMb: null,
    memoryMaxMb: null,
    javaRuntimeId: null,
    javaPathOverride: null,
    javaArgs: null,
    environmentVariables: null,
    preLaunchCommand: null,
    postExitCommand: null,
    wrapperCommand: null,
    windowWidth: null,
    windowHeight: null,
    startMaximized: null,
    fullscreen: null,
    closeLauncherOnLaunch: null,
    openLogsOnLaunch: null,
    quickPlaySingleplayer: null,
    quickPlayServer: null,
    showSnapshotWarning: null,
    useSystemGpuPreference: null
  }
}

export type InstanceStatus =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'installing'
  | 'launching'
  | 'running'
  | 'crashed'
  | 'error'

export interface LaunchRecord {
  startedAt: number
  endedAt: number | null
  durationMs: number
  exitCode: number | null
  crashed: boolean
  accountId: string | null
  accountName: string | null
  crashReportPath?: string | null
}

export interface ModpackOrigin {
  provider: ContentProvider
  projectId: string
  projectName: string
  versionId: string
  versionName: string
  /** Set when a newer modpack version is available. */
  updateAvailable?: { versionId: string; versionName: string } | null
}

export interface Instance {
  id: string
  name: string
  /** Folder name inside the instances root. */
  folder: string
  group: string | null
  tags: string[]
  favorite: boolean
  notes: string
  icon: InstanceIcon
  /** File name of a background image stored in the instance's `.orbit` folder. */
  background: string | null
  accent: string | null
  minecraftVersion: string
  minecraftVersionType: MinecraftVersionType
  loader: LoaderType
  loaderVersion: string | null
  /** The resolved version id that will actually be launched. */
  resolvedVersionId: string | null
  createdAt: number
  updatedAt: number
  lastPlayed: number | null
  totalPlaytimeMs: number
  launchCount: number
  settings: InstanceSettings
  modpack: ModpackOrigin | null
  /** True once assets/libraries/loader have been fully installed. */
  installed: boolean
  history: LaunchRecord[]
}

export interface InstanceCreateRequest {
  name: string
  minecraftVersion: string
  minecraftVersionType?: MinecraftVersionType
  loader: LoaderType
  loaderVersion?: string | null
  group?: string | null
  icon?: InstanceIcon
  notes?: string
  tags?: string[]
}

export interface InstanceSummary extends Instance {
  status: InstanceStatus
  /** Bytes on disk; computed lazily. */
  sizeBytes?: number
  modCount?: number
}

/* ------------------------------------------------------------------ */
/* Content: mods, packs, worlds                                        */
/* ------------------------------------------------------------------ */

export type ContentProvider = 'modrinth' | 'curseforge'

export type ContentKind = 'mod' | 'resourcepack' | 'shader' | 'datapack' | 'modpack' | 'world'

export interface LocalContent {
  /** Stable id: relative path within the instance. */
  id: string
  kind: ContentKind
  fileName: string
  relativePath: string
  enabled: boolean
  sizeBytes: number
  modifiedAt: number
  sha1: string | null
  name: string
  description: string | null
  version: string | null
  authors: string[]
  loaders: LoaderType[]
  gameVersions: string[]
  /** Base64 data URL extracted from the jar/zip when available. */
  iconDataUrl: string | null
  homepage: string | null
  provider: ContentProvider | null
  projectId: string | null
  versionId: string | null
  /** Populated by the update checker. */
  update: {
    versionId: string
    versionNumber: string
    versionName: string
    datePublished: string
    changelog: string | null
    fileName: string
  } | null
  /** Ids of other local content this file declares as required. */
  requiredDependencies: string[]
  problems: string[]
}

export interface WorldInfo {
  id: string
  folder: string
  name: string
  sizeBytes: number
  lastPlayed: number | null
  gameMode: number | null
  hardcore: boolean
  difficulty: number | null
  seed: string | null
  version: string | null
  iconDataUrl: string | null
  hasDatapacks: boolean
  datapackCount: number
}

export interface ScreenshotInfo {
  id: string
  fileName: string
  path: string
  sizeBytes: number
  createdAt: number
  width: number | null
  height: number | null
}

export interface ServerInfo {
  name: string
  address: string
  iconDataUrl: string | null
}

/* ------------------------------------------------------------------ */
/* Store (Modrinth + CurseForge)                                       */
/* ------------------------------------------------------------------ */

export interface StoreProject {
  provider: ContentProvider
  id: string
  slug: string
  name: string
  summary: string
  author: string
  iconUrl: string | null
  downloads: number
  follows: number
  categories: string[]
  displayCategories: string[]
  loaders: LoaderType[]
  gameVersions: string[]
  latestGameVersion: string | null
  clientSide: 'required' | 'optional' | 'unsupported' | 'unknown'
  serverSide: 'required' | 'optional' | 'unsupported' | 'unknown'
  updatedAt: string
  createdAt: string
  license: string | null
  kind: ContentKind
  /** Marks projects the user already has installed in the active instance. */
  installedVersionId?: string | null
}

export interface StoreProjectDetail extends StoreProject {
  description: string
  bodyHtml: string
  gallery: { url: string; title: string | null; description: string | null; featured: boolean }[]
  links: {
    website: string | null
    issues: string | null
    source: string | null
    wiki: string | null
    discord: string | null
    donate: { platform: string; url: string }[]
  }
  members: { name: string; role: string; avatarUrl: string | null }[]
}

export type StoreVersionChannel = 'release' | 'beta' | 'alpha'

export interface StoreDependency {
  provider: ContentProvider
  projectId: string | null
  versionId: string | null
  fileName: string | null
  type: 'required' | 'optional' | 'incompatible' | 'embedded'
  /** Resolved lazily for display. */
  projectName?: string | null
  projectIconUrl?: string | null
}

export interface StoreFile {
  url: string
  fileName: string
  sizeBytes: number
  sha1: string | null
  sha512: string | null
  primary: boolean
}

export interface StoreVersion {
  provider: ContentProvider
  id: string
  projectId: string
  name: string
  versionNumber: string
  channel: StoreVersionChannel
  datePublished: string
  downloads: number
  changelog: string | null
  gameVersions: string[]
  loaders: LoaderType[]
  files: StoreFile[]
  dependencies: StoreDependency[]
}

export type StoreSort =
  | 'relevance'
  | 'downloads'
  | 'follows'
  | 'newest'
  | 'updated'
  | 'name'

export interface StoreSearchQuery {
  providers: ContentProvider[]
  kind: ContentKind
  query: string
  gameVersions: string[]
  loaders: LoaderType[]
  categories: string[]
  sort: StoreSort
  offset: number
  limit: number
  /** When set, results are annotated with install state for this instance. */
  instanceId?: string | null
}

export interface StoreSearchResult {
  hits: StoreProject[]
  offset: number
  limit: number
  total: number
  /** Providers that failed for this query, e.g. a missing CurseForge key. */
  errors: { provider: ContentProvider; message: string }[]
}

export interface StoreCategory {
  id: string
  name: string
  icon: string | null
  kind: ContentKind
}

/* ------------------------------------------------------------------ */
/* Tasks / downloads                                                   */
/* ------------------------------------------------------------------ */

export type TaskStatus = 'queued' | 'running' | 'paused' | 'success' | 'error' | 'cancelled'

export interface TaskInfo {
  id: string
  title: string
  detail: string
  status: TaskStatus
  /** 0..1, or -1 for indeterminate. */
  progress: number
  bytesDone: number
  bytesTotal: number
  /** Bytes per second. */
  speed: number
  startedAt: number
  endedAt: number | null
  error: string | null
  instanceId: string | null
  cancellable: boolean
  kind: 'install' | 'download' | 'update' | 'backup' | 'import' | 'export' | 'java' | 'other'
}

/* ------------------------------------------------------------------ */
/* Logs & crashes                                                      */
/* ------------------------------------------------------------------ */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'stdout' | 'launcher'

export interface LogLine {
  seq: number
  time: number
  level: LogLevel
  thread: string | null
  logger: string | null
  message: string
}

export interface CrashReport {
  id: string
  instanceId: string
  path: string
  fileName: string
  createdAt: number
  sizeBytes: number
  /** First meaningful exception line. */
  summary: string
  exitCode: number | null
}

/* ------------------------------------------------------------------ */
/* Backups                                                             */
/* ------------------------------------------------------------------ */

export interface BackupInfo {
  id: string
  instanceId: string
  fileName: string
  path: string
  createdAt: number
  sizeBytes: number
  note: string
  contents: ('saves' | 'mods' | 'config' | 'resourcepacks' | 'shaderpacks' | 'everything')[]
}

/* ------------------------------------------------------------------ */
/* News & notifications                                                */
/* ------------------------------------------------------------------ */

export interface NewsItem {
  id: string
  title: string
  summary: string
  url: string
  imageUrl: string | null
  date: string
  category: string
  source: string
}

export interface AppNotification {
  id: string
  title: string
  body: string
  level: 'info' | 'success' | 'warning' | 'error'
  createdAt: number
  read: boolean
  action?: { label: string; route: string } | null
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface AppSettings {
  /* Appearance */
  theme: 'dark' | 'midnight' | 'light'
  accentColor: string
  reduceMotion: boolean
  uiScale: number
  instanceCardSize: 'compact' | 'regular' | 'large'
  showInstanceBackgrounds: boolean

  /* Java defaults */
  memoryMinMb: number
  memoryMaxMb: number
  javaArgs: string
  defaultJavaRuntimeId: string | null
  autoDownloadJava: boolean

  /* Launch defaults */
  closeLauncherOnLaunch: boolean
  openLogsOnLaunch: boolean
  windowWidth: number
  windowHeight: number
  startMaximized: boolean
  fullscreen: boolean
  allowParallelInstances: boolean
  confirmBeforeLaunchingSnapshots: boolean

  /* Downloads */
  maxConcurrentDownloads: number
  maxConcurrentTasks: number
  verifyDownloads: boolean

  /* Paths */
  dataRoot: string
  instancesDir: string
  javaDir: string
  /** Shared assets/libraries directory used by all instances. */
  sharedDir: string

  /* Integrations */
  curseforgeApiKey: string
  enableModrinth: boolean
  enableCurseForge: boolean
  /**
   * Azure "Application (client) ID" used for Microsoft sign-in. Orbit ships
   * without one so each install authenticates under its own registration.
   */
  msaClientId: string

  /* Updates */
  autoCheckUpdates: boolean
  autoDownloadUpdates: boolean
  updateChannel: 'stable' | 'beta'

  /* Behaviour */
  minimizeToTray: boolean
  launchOnStartup: boolean
  showNewsOnHome: boolean
  checkModUpdatesOnOpen: boolean
  notifyOnGameCrash: boolean
  notifyOnDownloadComplete: boolean
  language: string
  analyticsEnabled: false
}

/* ------------------------------------------------------------------ */
/* Updater                                                             */
/* ------------------------------------------------------------------ */

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date'
  version: string | null
  notes: string | null
  progress: number
  error: string | null
  currentVersion: string
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export interface SystemInfo {
  platform: string
  arch: string
  totalMemoryMb: number
  freeMemoryMb: number
  cpuModel: string
  cpuCores: number
  osVersion: string
  appVersion: string
  electronVersion: string
  dataRoot: string
}

export interface Result<T> {
  ok: boolean
  data?: T
  error?: string
}
