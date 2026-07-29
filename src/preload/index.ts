import { contextBridge, ipcRenderer } from 'electron'
import type { OrbitApi, OrbitEventName, OrbitEvents } from '../shared/api'


function group(domain: string, methods: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const method of methods) {
    const channel = `${domain}:${method}`
    out[method] = (...args: unknown[]) => ipcRenderer.invoke(channel, ...args)
  }
  return out
}

const api = {
  app: group('app', [
    'getSystemInfo',
    'windowMinimize',
    'windowMaximizeToggle',
    'windowClose',
    'windowIsMaximized',
    'openExternal',
    'openPath',
    'showItemInFolder',
    'pickDirectory',
    'pickFile',
    'pickFiles',
    'pickSavePath',
    'relaunch',
    'readImageAsDataUrl'
  ]),
  settings: group('settings', ['get', 'update', 'reset', 'openDataFolder']),
  accounts: group('accounts', ['list', 'getActive', 'add', 'remove', 'setActive', 'refresh', 'cancelLogin']),
  java: group('java', ['list', 'scan', 'addManual', 'remove', 'downloadable', 'install', 'test', 'recommendedFor']),
  versions: group('versions', ['minecraft', 'loader', 'loaderSupportedMinecraft']),
  instances: group('instances', [
    'list',
    'get',
    'create',
    'update',
    'remove',
    'duplicate',
    'launch',
    'kill',
    'isRunning',
    'statuses',
    'ensureInstalled',
    'setFavorite',
    'groups',
    'allTags',
    'openFolder',
    'computeSize',
    'setIconFromFile',
    'setBackgroundFromFile',
    'clearBackground',
    'getImageUrl',
    'changeVersion',
    'export',
    'import',
    'listBackups',
    'createBackup',
    'restoreBackup',
    'deleteBackup',
    'history'
  ]),
  content: group('content', [
    'list',
    'setEnabled',
    'remove',
    'addFromFiles',
    'checkUpdates',
    'applyUpdates',
    'worlds',
    'deleteWorld',
    'exportWorld',
    'importWorld',
    'duplicateWorld',
    'screenshots',
    'deleteScreenshots',
    'copyScreenshot',
    'servers'
  ]),
  store: group('store', [
    'search',
    'project',
    'versions',
    'categories',
    'install',
    'installModpack',
    'updateModpack',
    'featured'
  ]),
  tasks: group('tasks', ['list', 'cancel', 'clearFinished']),
  logs: group('logs', [
    'get',
    'clear',
    'export',
    'crashReports',
    'readCrashReport',
    'deleteCrashReport',
    'launcherLogPath'
  ]),
  news: group('news', ['list']),
  notifications: group('notifications', ['list', 'markRead', 'markAllRead', 'dismiss', 'clear']),
  updater: group('updater', ['state', 'check', 'download', 'installNow']),

  on<K extends OrbitEventName>(event: K, handler: (payload: OrbitEvents[K]) => void): () => void {
    const listener = (_e: Electron.IpcRendererEvent, payload: OrbitEvents[K]): void => handler(payload)
    ipcRenderer.on(event, listener)
    return () => {
      ipcRenderer.removeListener(event, listener)
    }
  }
} as unknown as OrbitApi

contextBridge.exposeInMainWorld('orbit', api)
