








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

  javaMajor?: number
}

export interface LoaderVersion {
  id: string

  stable: boolean
  recommended?: boolean
  latest?: boolean
  releaseTime?: string
}





export interface SkinInfo {
  id: string
  url: string
  variant: 'CLASSIC' | 'SLIM'
  state: string
}

export interface SkinChangeResult {
  account: Account
  message: string
}

export interface CapeInfo {
  id: string
  url: string
  alias: string
  state: string
}

export type SkinVariant = 'CLASSIC' | 'SLIM'

/** A skin saved locally so it can be re-applied to any account later. */
export interface SkinLibraryEntry {
  id: string
  name: string
  variant: SkinVariant
  /** Absolute path on disk. */
  path: string
  /** orbit-media URL for rendering in the UI. */
  url: string
  addedAt: number
  width: number
  height: number
}

export interface Account {

  id: string
  username: string
  uuid: string
  xuid: string | null

  type: 'microsoft'
  addedAt: number

  expiresAt: number
  lastRefreshed: number
  skins: SkinInfo[]
  capes: CapeInfo[]

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





export interface JavaRuntime {
  id: string

  path: string
  version: string
  majorVersion: number
  vendor: string
  arch: string

  managed: boolean
  label: string
}

export interface JavaDownloadOption {
  majorVersion: number
  label: string
  description: string
  installed: boolean
}





export type InstanceIcon =
  | { type: 'preset'; key: string }
  | { type: 'file'; file: string }
  | { type: 'url'; url: string }

export interface InstanceSettings {

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

  updateAvailable?: { versionId: string; versionName: string } | null
}

export interface Instance {
  id: string
  name: string

  folder: string
  group: string | null
  tags: string[]
  favorite: boolean
  notes: string
  icon: InstanceIcon

  background: string | null
  accent: string | null
  minecraftVersion: string
  minecraftVersionType: MinecraftVersionType
  loader: LoaderType
  loaderVersion: string | null

  resolvedVersionId: string | null
  createdAt: number
  updatedAt: number
  lastPlayed: number | null
  totalPlaytimeMs: number
  launchCount: number
  settings: InstanceSettings
  modpack: ModpackOrigin | null

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

  sizeBytes?: number
  modCount?: number
}





export type ContentProvider = 'modrinth' | 'curseforge'

export type ContentKind = 'mod' | 'resourcepack' | 'shader' | 'datapack' | 'modpack' | 'world'

export interface LocalContent {

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

  iconDataUrl: string | null
  homepage: string | null
  provider: ContentProvider | null
  projectId: string | null
  versionId: string | null

  update: {
    versionId: string
    versionNumber: string
    versionName: string
    datePublished: string
    changelog: string | null
    fileName: string
  } | null

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

  instanceId?: string | null
}

export interface StoreSearchResult {
  hits: StoreProject[]
  offset: number
  limit: number
  total: number

  errors: { provider: ContentProvider; message: string }[]
}

export interface StoreCategory {
  id: string
  name: string
  icon: string | null
  kind: ContentKind
}





export type TaskStatus = 'queued' | 'running' | 'paused' | 'success' | 'error' | 'cancelled'

export interface TaskInfo {
  id: string
  title: string
  detail: string
  status: TaskStatus

  progress: number
  bytesDone: number
  bytesTotal: number

  speed: number
  startedAt: number
  endedAt: number | null
  error: string | null
  instanceId: string | null
  cancellable: boolean
  kind: 'install' | 'download' | 'update' | 'backup' | 'import' | 'export' | 'java' | 'other'
}





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

  summary: string
  exitCode: number | null
}





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





export interface AppSettings {

  theme: 'dark' | 'midnight' | 'light'
  accentColor: string
  reduceMotion: boolean
  uiScale: number
  instanceCardSize: 'compact' | 'regular' | 'large'
  showInstanceBackgrounds: boolean
  showAdPlaceholders: boolean


  memoryMinMb: number
  memoryMaxMb: number
  javaArgs: string
  defaultJavaRuntimeId: string | null
  autoDownloadJava: boolean


  closeLauncherOnLaunch: boolean
  openLogsOnLaunch: boolean
  windowWidth: number
  windowHeight: number
  startMaximized: boolean
  fullscreen: boolean
  allowParallelInstances: boolean
  confirmBeforeLaunchingSnapshots: boolean


  maxConcurrentDownloads: number
  maxConcurrentTasks: number
  verifyDownloads: boolean


  dataRoot: string
  instancesDir: string
  javaDir: string

  sharedDir: string


  curseforgeApiKey: string
  enableModrinth: boolean
  enableCurseForge: boolean




  msaClientId: string


  autoCheckUpdates: boolean
  autoDownloadUpdates: boolean
  updateChannel: 'stable' | 'beta'


  minimizeToTray: boolean
  launchOnStartup: boolean
  showNewsOnHome: boolean
  checkModUpdatesOnOpen: boolean
  notifyOnGameCrash: boolean
  notifyOnDownloadComplete: boolean
  language: string
  analyticsEnabled: false
}





export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date'
  version: string | null
  notes: string | null
  progress: number
  error: string | null
  currentVersion: string

  releaseUrl: string | null
}





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
