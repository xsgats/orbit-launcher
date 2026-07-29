import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import { cpus, freemem, release, totalmem } from 'node:os'
import { basename } from 'node:path'
import type { ContentKind, ContentProvider, LoaderType } from '../shared/types'
import type { InstallVersionRequest, BackupOptions, InstanceExportOptions } from '../shared/api'
import { log } from './core/logger'
import { paths } from './core/paths'
import { settings } from './core/settings'
import { exists } from './core/fsx'
import { readZipJson } from './core/zip'
import { accounts } from './services/accounts'
import * as content from './services/content'
import { instances } from './services/instances'
import { java } from './services/java'
import { isRunning, killInstance, launchInstance } from './services/launcher'
import {
  deleteCrashReport,
  listCrashReports,
  logStore,
  readCrashReport
} from './services/logs'
import { loaderSupportedMinecraft, loaderVersions } from './services/loaders'
import { getManifest } from './services/minecraft/versions'
import { listNews } from './services/news'
import { notifications } from './services/notifications'
import * as store from './services/store'
import { tasks } from './services/tasks'
import * as updater from './services/updater'

type Handler = (...args: never[]) => unknown

/** Registers a handler and turns thrown errors into clean renderer-side rejections. */
function handle(channel: string, handler: Handler): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await (handler as (...a: unknown[]) => unknown)(...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error('ipc', `${channel} failed: ${message}`, err)
      throw new Error(message)
    }
  })
}

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

export function registerIpc(): void {
  /* ---------------------------------------------------------------- */
  /* App                                                              */
  /* ---------------------------------------------------------------- */

  handle('app:getSystemInfo', () => ({
    platform: process.platform,
    arch: process.arch,
    totalMemoryMb: Math.round(totalmem() / 1024 / 1024),
    freeMemoryMb: Math.round(freemem() / 1024 / 1024),
    cpuModel: cpus()[0]?.model?.trim() ?? 'Unknown CPU',
    cpuCores: cpus().length,
    osVersion: release(),
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    dataRoot: paths.dataRoot
  }))

  handle('app:windowMinimize', () => focusedWindow()?.minimize())
  handle('app:windowMaximizeToggle', () => {
    const window = focusedWindow()
    if (!window) return false
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  })
  handle('app:windowClose', () => focusedWindow()?.close())
  handle('app:windowIsMaximized', () => focusedWindow()?.isMaximized() ?? false)

  handle('app:openExternal', async (url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only web links can be opened.')
    await shell.openExternal(url)
  })
  handle('app:openPath', async (target: string) => {
    await shell.openPath(target)
  })
  handle('app:showItemInFolder', (target: string) => shell.showItemInFolder(target))

  handle('app:pickDirectory', async (title?: string) => {
    const window = focusedWindow()
    const result = await dialog.showOpenDialog(window!, {
      title: title ?? 'Choose a folder',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  handle('app:pickFile', async (filters: { name: string; extensions: string[] }[], title?: string) => {
    const window = focusedWindow()
    const result = await dialog.showOpenDialog(window!, {
      title: title ?? 'Choose a file',
      filters,
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  handle('app:pickFiles', async (filters: { name: string; extensions: string[] }[], title?: string) => {
    const window = focusedWindow()
    const result = await dialog.showOpenDialog(window!, {
      title: title ?? 'Choose files',
      filters,
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? [] : result.filePaths
  })

  handle('app:pickSavePath', async (defaultName: string, filters: { name: string; extensions: string[] }[]) => {
    const window = focusedWindow()
    const result = await dialog.showSaveDialog(window!, { defaultPath: defaultName, filters })
    return result.canceled ? null : result.filePath
  })

  handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })

  handle('app:readImageAsDataUrl', async (target: string) => {
    if (!(await exists(target))) return null
    const image = nativeImage.createFromPath(target)
    return image.isEmpty() ? null : image.toDataURL()
  })

  /* ---------------------------------------------------------------- */
  /* Settings                                                         */
  /* ---------------------------------------------------------------- */

  handle('settings:get', () => settings.get())
  handle('settings:update', (patch) => settings.update(patch as never))
  handle('settings:reset', () => settings.reset())
  handle('settings:openDataFolder', () => shell.openPath(paths.dataRoot))

  /* ---------------------------------------------------------------- */
  /* Accounts                                                         */
  /* ---------------------------------------------------------------- */

  handle('accounts:list', () => accounts.list())
  handle('accounts:getActive', () => accounts.getActive())
  handle('accounts:add', () => accounts.add())
  handle('accounts:remove', (id: string) => accounts.remove(id))
  handle('accounts:setActive', (id: string) => accounts.setActive(id))
  handle('accounts:refresh', (id: string) => accounts.refresh(id))
  handle('accounts:cancelLogin', () => accounts.cancelLogin())

  /* ---------------------------------------------------------------- */
  /* Java                                                             */
  /* ---------------------------------------------------------------- */

  handle('java:list', () => java.list())
  handle('java:scan', () => java.scan())
  handle('java:addManual', (path: string) => java.addManual(path))
  handle('java:remove', (id: string) => java.remove(id))
  handle('java:downloadable', () => java.downloadable())
  handle('java:install', (major: number) => java.install(major))
  handle('java:test', (path: string) => java.test(path))
  handle('java:recommendedFor', (version: string) => java.recommendedMajorFor(version))

  /* ---------------------------------------------------------------- */
  /* Versions                                                         */
  /* ---------------------------------------------------------------- */

  handle('versions:minecraft', (refresh?: boolean) => getManifest(refresh ?? false))
  handle('versions:loader', (loader: LoaderType, minecraftVersion: string) =>
    loaderVersions(loader, minecraftVersion)
  )
  handle('versions:loaderSupportedMinecraft', (loader: LoaderType) => loaderSupportedMinecraft(loader))

  /* ---------------------------------------------------------------- */
  /* Instances                                                        */
  /* ---------------------------------------------------------------- */

  handle('instances:list', () => instances.list())
  handle('instances:get', (id: string) => instances.get(id))
  handle('instances:create', (req) => instances.create(req as never))
  handle('instances:update', (id: string, patch) => instances.update(id, patch as never))
  handle('instances:remove', (id: string) => instances.remove(id))
  handle('instances:duplicate', (id: string, name: string) => instances.duplicate(id, name))
  handle('instances:launch', (id: string, accountId?: string) => launchInstance({ instanceId: id, accountId }))
  handle('instances:kill', (id: string) => killInstance(id))
  handle('instances:isRunning', (id: string) => isRunning(id))
  handle('instances:statuses', () => instances.allStatuses())
  handle('instances:ensureInstalled', (id: string) => instances.ensureInstalled(id))
  handle('instances:setFavorite', (id: string, value: boolean) => instances.setFavorite(id, value))
  handle('instances:groups', () => instances.groups())
  handle('instances:allTags', () => instances.allTags())
  handle('instances:openFolder', (id: string, sub?: string) => instances.openFolder(id, sub))
  handle('instances:computeSize', (id: string) => instances.computeSize(id))
  handle('instances:setIconFromFile', (id: string, path: string) => instances.setIconFromFile(id, path))
  handle('instances:setBackgroundFromFile', (id: string, path: string) =>
    instances.setBackgroundFromFile(id, path)
  )
  handle('instances:clearBackground', (id: string) => instances.clearBackground(id))
  handle('instances:getImageUrl', (id: string, which: 'icon' | 'background') =>
    instances.getImageUrl(id, which)
  )
  handle('instances:changeVersion', (id: string, mc: string, loader: LoaderType, loaderVersion: string | null) =>
    instances.changeVersion(id, mc, loader, loaderVersion)
  )
  handle('instances:export', (id: string, target: string, options: InstanceExportOptions) =>
    instances.export(id, target, options)
  )

  handle('instances:import', async (sourcePath: string) => {
    // Orbit exports, .mrpack and CurseForge zips all arrive through this door.
    const orbitManifest = await readZipJson<unknown>(sourcePath, 'orbit-instance.json').catch(() => null)
    if (orbitManifest) return instances.import(sourcePath)

    return tasks.run({ title: `Importing ${basename(sourcePath)}`, kind: 'import' }, (task) =>
      store.createInstanceFromArchive(sourcePath, basename(sourcePath).replace(/\.[^.]+$/, ''), task)
    )
  })

  handle('instances:listBackups', (id: string) => instances.listBackups(id))
  handle('instances:createBackup', (id: string, options: BackupOptions) => instances.createBackup(id, options))
  handle('instances:restoreBackup', (id: string, backupId: string) => instances.restoreBackup(id, backupId))
  handle('instances:deleteBackup', (id: string, backupId: string) => instances.deleteBackup(id, backupId))
  handle('instances:history', async (id: string) => (await instances.require(id)).history)

  /* ---------------------------------------------------------------- */
  /* Content                                                          */
  /* ---------------------------------------------------------------- */

  handle('content:list', (id: string, kind: ContentKind) => content.listContent(id, kind))
  handle('content:setEnabled', (id: string, contentId: string, enabled: boolean) =>
    content.setEnabled(id, contentId, enabled)
  )
  handle('content:remove', (id: string, ids: string[]) => content.removeContent(id, ids))
  handle('content:addFromFiles', (id: string, kind: ContentKind, files: string[]) =>
    content.addFromFiles(id, kind, files)
  )
  handle('content:checkUpdates', (id: string, kind: ContentKind) => content.checkUpdates(id, kind))

  handle('content:applyUpdates', async (id: string, kind: ContentKind, contentIds: string[]) => {
    const items = await content.checkUpdates(id, kind)
    const targets = items.filter(
      (item) => item.update && (contentIds.length === 0 || contentIds.includes(item.id))
    )

    if (targets.length) {
      await tasks.run({ title: `Updating ${targets.length} ${kind}s`, kind: 'update', instanceId: id }, async (task) => {
        for (let index = 0; index < targets.length; index++) {
          const item = targets[index]
          if (!item.update || !item.projectId || !item.provider) continue
          task.setDetail(`${item.name} → ${item.update.versionNumber}`)
          task.setProgress(index / targets.length)
          await store.install({
            instanceId: id,
            provider: item.provider,
            projectId: item.projectId,
            versionId: item.update.versionId,
            kind,
            withDependencies: true
          })
        }
      })
    }

    return content.listContent(id, kind)
  })

  handle('content:worlds', (id: string) => content.listWorlds(id))
  handle('content:deleteWorld', (id: string, worldId: string) => content.deleteWorld(id, worldId))
  handle('content:exportWorld', (id: string, worldId: string, target: string) =>
    content.exportWorld(id, worldId, target)
  )
  handle('content:importWorld', (id: string, source: string) => content.importWorld(id, source))
  handle('content:duplicateWorld', (id: string, worldId: string) => content.duplicateWorld(id, worldId))
  handle('content:screenshots', (id: string) => content.listScreenshots(id))
  handle('content:deleteScreenshots', (id: string, ids: string[]) => content.deleteScreenshots(id, ids))
  handle('content:copyScreenshot', (id: string, shotId: string) =>
    content.copyScreenshotToClipboard(id, shotId)
  )
  handle('content:servers', (id: string) => content.listServers(id))

  /* ---------------------------------------------------------------- */
  /* Store                                                            */
  /* ---------------------------------------------------------------- */

  handle('store:search', (query) => store.search(query as never))
  handle('store:project', (provider: ContentProvider, projectId: string) => store.project(provider, projectId))
  handle('store:versions', (provider: ContentProvider, projectId: string, filter) =>
    store.versions(provider, projectId, filter as never)
  )
  handle('store:categories', (kind: ContentKind) => store.categories(kind))
  handle('store:install', (req: InstallVersionRequest) => store.install(req))
  handle('store:installModpack', (provider: ContentProvider, projectId: string, versionId: string, name?: string) =>
    store.installModpack(provider, projectId, versionId, name)
  )
  handle('store:updateModpack', (id: string, versionId: string) => store.updateModpack(id, versionId))
  handle('store:featured', (kind: ContentKind) => store.featured(kind))

  /* ---------------------------------------------------------------- */
  /* Tasks, logs, news, notifications, updater                        */
  /* ---------------------------------------------------------------- */

  handle('tasks:list', () => tasks.list())
  handle('tasks:cancel', (id: string) => tasks.cancel(id))
  handle('tasks:clearFinished', () => tasks.clearFinished())

  handle('logs:get', (id: string) => logStore.get(id))
  handle('logs:clear', (id: string) => logStore.clear(id))
  handle('logs:export', (id: string, target: string) => logStore.export(id, target))
  handle('logs:crashReports', async (id: string) => {
    const instance = await instances.require(id)
    return listCrashReports(id, instances.gameDir(instance))
  })
  handle('logs:readCrashReport', (path: string) => readCrashReport(path))
  handle('logs:deleteCrashReport', (path: string) => deleteCrashReport(path))
  handle('logs:launcherLogPath', () => paths.launcherLogFile)

  handle('news:list', (refresh?: boolean) => listNews(refresh ?? false))

  handle('notifications:list', () => notifications.list())
  handle('notifications:markRead', (id: string) => notifications.markRead(id))
  handle('notifications:markAllRead', () => notifications.markAllRead())
  handle('notifications:dismiss', (id: string) => notifications.dismiss(id))
  handle('notifications:clear', () => notifications.clear())

  handle('updater:state', () => updater.getState())
  handle('updater:check', () => updater.check())
  handle('updater:download', () => updater.download())
  handle('updater:installNow', () => updater.installNow())

  log.info('ipc', 'Handlers registered')
}
