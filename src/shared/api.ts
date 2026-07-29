import type {
  Account,
  AppNotification,
  AppSettings,
  AuthProgress,
  BackupInfo,
  ContentKind,
  CrashReport,
  Instance,
  InstanceCreateRequest,
  InstanceStatus,
  InstanceSummary,
  JavaDownloadOption,
  JavaRuntime,
  LoaderType,
  LoaderVersion,
  LocalContent,
  LogLine,
  MinecraftVersionSummary,
  NewsItem,
  ScreenshotInfo,
  ServerInfo,
  StoreCategory,
  StoreProjectDetail,
  StoreSearchQuery,
  StoreSearchResult,
  StoreVersion,
  SystemInfo,
  TaskInfo,
  UpdateState,
  WorldInfo,
  ContentProvider
} from './types'

/** Payloads pushed from main -> renderer. */
export interface OrbitEvents {
  'tasks:changed': TaskInfo[]
  'instance:status': { instanceId: string; status: InstanceStatus; detail?: string }
  'instances:changed': void
  'instance:log': { instanceId: string; lines: LogLine[] }
  'auth:progress': AuthProgress
  'accounts:changed': Account[]
  'settings:changed': AppSettings
  'notification:new': AppNotification
  'notifications:changed': AppNotification[]
  'updater:state': UpdateState
  'navigate': { route: string }
}

export type OrbitEventName = keyof OrbitEvents

export interface InstanceExportOptions {
  includeSaves: boolean
  includeConfig: boolean
  includeResourcePacks: boolean
  includeShaderPacks: boolean
  includeScreenshots: boolean
  includeLogs: boolean
}

export interface BackupOptions {
  note: string
  includeSaves: boolean
  includeMods: boolean
  includeConfig: boolean
  includeResourcePacks: boolean
  includeShaderPacks: boolean
}

export interface InstallVersionRequest {
  instanceId: string
  provider: ContentProvider
  projectId: string
  versionId: string
  kind: ContentKind
  /** Also fetch and install required dependencies. */
  withDependencies: boolean
}

export interface OrbitApi {
  app: {
    getSystemInfo(): Promise<SystemInfo>
    windowMinimize(): Promise<void>
    windowMaximizeToggle(): Promise<boolean>
    windowClose(): Promise<void>
    windowIsMaximized(): Promise<boolean>
    openExternal(url: string): Promise<void>
    openPath(target: string): Promise<void>
    showItemInFolder(target: string): Promise<void>
    pickDirectory(title?: string): Promise<string | null>
    pickFile(filters: { name: string; extensions: string[] }[], title?: string): Promise<string | null>
    pickFiles(filters: { name: string; extensions: string[] }[], title?: string): Promise<string[]>
    pickSavePath(defaultName: string, filters: { name: string; extensions: string[] }[]): Promise<string | null>
    relaunch(): Promise<void>
    readImageAsDataUrl(path: string): Promise<string | null>
  }

  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
    reset(): Promise<AppSettings>
    openDataFolder(): Promise<void>
  }

  accounts: {
    list(): Promise<Account[]>
    getActive(): Promise<Account | null>
    add(): Promise<Account>
    remove(id: string): Promise<void>
    setActive(id: string): Promise<void>
    refresh(id: string): Promise<Account>
    cancelLogin(): Promise<void>
  }

  java: {
    list(): Promise<JavaRuntime[]>
    scan(): Promise<JavaRuntime[]>
    addManual(path: string): Promise<JavaRuntime>
    remove(id: string): Promise<void>
    downloadable(): Promise<JavaDownloadOption[]>
    install(majorVersion: number): Promise<JavaRuntime>
    test(path: string): Promise<{ ok: boolean; version?: string; error?: string }>
    recommendedFor(minecraftVersion: string): Promise<number>
  }

  versions: {
    minecraft(refresh?: boolean): Promise<MinecraftVersionSummary[]>
    loader(loader: LoaderType, minecraftVersion: string): Promise<LoaderVersion[]>
    loaderSupportedMinecraft(loader: LoaderType): Promise<string[]>
  }

  instances: {
    list(): Promise<InstanceSummary[]>
    get(id: string): Promise<InstanceSummary | null>
    create(req: InstanceCreateRequest): Promise<Instance>
    update(id: string, patch: Partial<Instance>): Promise<Instance>
    remove(id: string): Promise<void>
    duplicate(id: string, newName: string): Promise<Instance>
    launch(id: string, accountId?: string): Promise<void>
    kill(id: string): Promise<void>
    isRunning(id: string): Promise<boolean>
    statuses(): Promise<Record<string, InstanceStatus>>
    ensureInstalled(id: string): Promise<void>
    setFavorite(id: string, value: boolean): Promise<void>
    groups(): Promise<string[]>
    allTags(): Promise<string[]>
    openFolder(id: string, sub?: string): Promise<void>
    computeSize(id: string): Promise<number>
    setIconFromFile(id: string, sourcePath: string): Promise<Instance>
    setBackgroundFromFile(id: string, sourcePath: string): Promise<Instance>
    clearBackground(id: string): Promise<Instance>
    getImageUrl(id: string, which: 'icon' | 'background'): Promise<string | null>
    changeVersion(id: string, minecraftVersion: string, loader: LoaderType, loaderVersion: string | null): Promise<Instance>
    export(id: string, targetPath: string, options: InstanceExportOptions): Promise<string>
    import(sourcePath: string): Promise<Instance>
    listBackups(id: string): Promise<BackupInfo[]>
    createBackup(id: string, options: BackupOptions): Promise<BackupInfo>
    restoreBackup(id: string, backupId: string): Promise<void>
    deleteBackup(id: string, backupId: string): Promise<void>
    history(id: string): Promise<Instance['history']>
  }

  content: {
    list(instanceId: string, kind: ContentKind): Promise<LocalContent[]>
    setEnabled(instanceId: string, contentId: string, enabled: boolean): Promise<LocalContent[]>
    remove(instanceId: string, contentIds: string[]): Promise<LocalContent[]>
    addFromFiles(instanceId: string, kind: ContentKind, paths: string[]): Promise<LocalContent[]>
    checkUpdates(instanceId: string, kind: ContentKind): Promise<LocalContent[]>
    applyUpdates(instanceId: string, kind: ContentKind, contentIds: string[]): Promise<LocalContent[]>
    worlds(instanceId: string): Promise<WorldInfo[]>
    deleteWorld(instanceId: string, worldId: string): Promise<void>
    exportWorld(instanceId: string, worldId: string, targetPath: string): Promise<string>
    importWorld(instanceId: string, sourcePath: string): Promise<WorldInfo[]>
    duplicateWorld(instanceId: string, worldId: string): Promise<WorldInfo[]>
    screenshots(instanceId: string): Promise<ScreenshotInfo[]>
    deleteScreenshots(instanceId: string, ids: string[]): Promise<ScreenshotInfo[]>
    copyScreenshot(instanceId: string, id: string): Promise<void>
    servers(instanceId: string): Promise<ServerInfo[]>
  }

  store: {
    search(query: StoreSearchQuery): Promise<StoreSearchResult>
    project(provider: ContentProvider, projectId: string): Promise<StoreProjectDetail>
    versions(
      provider: ContentProvider,
      projectId: string,
      filter?: { gameVersions?: string[]; loaders?: LoaderType[] }
    ): Promise<StoreVersion[]>
    categories(kind: ContentKind): Promise<StoreCategory[]>
    install(req: InstallVersionRequest): Promise<void>
    installModpack(
      provider: ContentProvider,
      projectId: string,
      versionId: string,
      instanceName?: string
    ): Promise<Instance>
    updateModpack(instanceId: string, versionId: string): Promise<void>
    featured(kind: ContentKind): Promise<StoreSearchResult>
  }

  tasks: {
    list(): Promise<TaskInfo[]>
    cancel(id: string): Promise<void>
    clearFinished(): Promise<TaskInfo[]>
  }

  logs: {
    get(instanceId: string): Promise<LogLine[]>
    clear(instanceId: string): Promise<void>
    export(instanceId: string, targetPath: string): Promise<string>
    crashReports(instanceId: string): Promise<CrashReport[]>
    readCrashReport(path: string): Promise<string>
    deleteCrashReport(path: string): Promise<void>
    launcherLogPath(): Promise<string>
  }

  news: {
    list(refresh?: boolean): Promise<NewsItem[]>
  }

  notifications: {
    list(): Promise<AppNotification[]>
    markRead(id: string): Promise<AppNotification[]>
    markAllRead(): Promise<AppNotification[]>
    dismiss(id: string): Promise<AppNotification[]>
    clear(): Promise<AppNotification[]>
  }

  updater: {
    state(): Promise<UpdateState>
    check(): Promise<UpdateState>
    download(): Promise<void>
    installNow(): Promise<void>
  }

  on<K extends OrbitEventName>(event: K, handler: (payload: OrbitEvents[K]) => void): () => void
}
