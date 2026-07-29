import { randomUUID } from 'node:crypto'
import { copyFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { shell } from 'electron'
import type {
  BackupInfo,
  Instance,
  InstanceCreateRequest,
  InstanceStatus,
  InstanceSummary,
  LaunchRecord,
  LoaderType,
  MinecraftVersionType
} from '../../shared/types'
import { emptyInstanceSettings } from '../../shared/types'
import type { BackupOptions, InstanceExportOptions } from '../../shared/api'
import { emit } from '../core/events'
import {
  copyDir,
  dirSize,
  ensureDir,
  exists,
  readJson,
  removePath,
  uniqueFolderName,
  writeJson
} from '../core/fsx'
import { log } from '../core/logger'
import { mediaUrl } from '../core/media'
import { paths } from '../core/paths'
import { createZip, extractZip, readZipJson } from '../core/zip'
import { installLoader, latestLoaderVersion } from './loaders'
import { installVersion } from './minecraft/versions'
import { tasks, type TaskHandle } from './tasks'

const GAME_SUBFOLDERS = [
  'mods',
  'saves',
  'config',
  'resourcepacks',
  'shaderpacks',
  'screenshots',
  'crash-reports',
  'logs'
]

const PRESET_ICONS = [
  'orbit',
  'grass',
  'stone',
  'diamond',
  'emerald',
  'gold',
  'redstone',
  'lapis',
  'netherite',
  'amethyst',
  'enderpearl',
  'creeper',
  'flame',
  'anvil',
  'chest',
  'compass'
] as const

export const INSTANCE_PRESET_ICONS = PRESET_ICONS

function defaultInstance(folder: string, req: InstanceCreateRequest): Instance {
  const now = Date.now()
  return {
    id: randomUUID(),
    name: req.name.trim() || 'New Instance',
    folder,
    group: req.group ?? null,
    tags: req.tags ?? [],
    favorite: false,
    notes: req.notes ?? '',
    icon: req.icon ?? { type: 'preset', key: 'orbit' },
    background: null,
    accent: null,
    minecraftVersion: req.minecraftVersion,
    minecraftVersionType: req.minecraftVersionType ?? 'release',
    loader: req.loader,
    loaderVersion: req.loaderVersion ?? null,
    resolvedVersionId: null,
    createdAt: now,
    updatedAt: now,
    lastPlayed: null,
    totalPlaytimeMs: 0,
    launchCount: 0,
    settings: emptyInstanceSettings(),
    modpack: null,
    installed: false,
    history: []
  }
}

class InstanceManager {
  private cache = new Map<string, Instance>()
  private statuses = new Map<string, InstanceStatus>()
  private loaded = false





  async load(): Promise<void> {
    this.cache.clear()
    await ensureDir(paths.instancesDir)

    const entries = await readdir(paths.instancesDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const config = await readJson<Instance>(paths.instanceConfigFile(entry.name))
      if (!config?.id) continue

      config.folder = entry.name
      config.settings = { ...emptyInstanceSettings(), ...config.settings }
      config.history ??= []
      config.tags ??= []
      this.cache.set(config.id, config)
    }

    this.loaded = true
    log.info('instances', `Loaded ${this.cache.size} instance(s)`)
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load()
  }

  private async persist(instance: Instance): Promise<void> {
    instance.updatedAt = Date.now()
    await ensureDir(paths.instanceMetaDir(instance.folder))
    await writeJson(paths.instanceConfigFile(instance.folder), instance)
    this.cache.set(instance.id, instance)
  }

  private notify(): void {
    emit('instances:changed', undefined)
  }





  async list(): Promise<InstanceSummary[]> {
    await this.ensureLoaded()
    return [...this.cache.values()]
      .map((instance) => this.decorate(instance))
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
        return (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || a.name.localeCompare(b.name)
      })
  }

  async get(id: string): Promise<InstanceSummary | null> {
    await this.ensureLoaded()
    const instance = this.cache.get(id)
    return instance ? this.decorate(instance) : null
  }


  async require(id: string): Promise<Instance> {
    await this.ensureLoaded()
    const instance = this.cache.get(id)
    if (!instance) throw new Error('That instance no longer exists.')
    return instance
  }

  private decorate(instance: Instance): InstanceSummary {
    return { ...instance, status: this.statuses.get(instance.id) ?? 'idle' }
  }

  gameDir(instance: Instance): string {
    return paths.instanceGameDir(instance.folder)
  }

  async groups(): Promise<string[]> {
    await this.ensureLoaded()
    const set = new Set<string>()
    for (const instance of this.cache.values()) if (instance.group) set.add(instance.group)
    return [...set].sort((a, b) => a.localeCompare(b))
  }

  async allTags(): Promise<string[]> {
    await this.ensureLoaded()
    const set = new Set<string>()
    for (const instance of this.cache.values()) for (const tag of instance.tags) set.add(tag)
    return [...set].sort((a, b) => a.localeCompare(b))
  }





  setStatus(id: string, status: InstanceStatus, detail?: string): void {
    if (status === 'idle') this.statuses.delete(id)
    else this.statuses.set(id, status)
    emit('instance:status', { instanceId: id, status, detail })
  }

  getStatus(id: string): InstanceStatus {
    return this.statuses.get(id) ?? 'idle'
  }

  allStatuses(): Record<string, InstanceStatus> {
    return Object.fromEntries(this.statuses)
  }





  async create(req: InstanceCreateRequest): Promise<Instance> {
    await this.ensureLoaded()

    const folder = await uniqueFolderName(paths.instancesDir, req.name)
    const instance = defaultInstance(folder, req)

    await ensureDir(paths.instanceMetaDir(folder))
    const gameDir = paths.instanceGameDir(folder)
    for (const sub of GAME_SUBFOLDERS) await ensureDir(join(gameDir, sub))

    if (instance.loader !== 'vanilla' && !instance.loaderVersion) {
      instance.loaderVersion = await latestLoaderVersion(instance.loader, instance.minecraftVersion).catch(
        () => null
      )
    }

    await this.persist(instance)
    this.notify()
    log.info('instances', `Created "${instance.name}" (${instance.minecraftVersion} / ${instance.loader})`)
    return instance
  }

  async update(id: string, patch: Partial<Instance>): Promise<Instance> {
    const instance = await this.require(id)


    const { id: _id, folder: _folder, history: _history, ...safe } = patch
    Object.assign(instance, safe)

    if (patch.settings) instance.settings = { ...instance.settings, ...patch.settings }

    await this.persist(instance)
    this.notify()
    return instance
  }

  async setFavorite(id: string, value: boolean): Promise<void> {
    const instance = await this.require(id)
    instance.favorite = value
    await this.persist(instance)
    this.notify()
  }

  async remove(id: string): Promise<void> {
    const instance = await this.require(id)
    if (this.getStatus(id) === 'running') {
      throw new Error('Stop the game before deleting this instance.')
    }

    await removePath(paths.instanceDir(instance.folder))
    await removePath(paths.instanceBackupsDir(instance.folder)).catch(() => undefined)
    this.cache.delete(id)
    this.statuses.delete(id)
    this.notify()
    log.info('instances', `Deleted "${instance.name}"`)
  }

  async duplicate(id: string, newName: string): Promise<Instance> {
    const source = await this.require(id)

    return tasks.run(
      { title: `Duplicating ${source.name}`, kind: 'other', instanceId: id },
      async (task) => {
        const folder = await uniqueFolderName(paths.instancesDir, newName || `${source.name} copy`)
        const clone: Instance = {
          ...structuredClone(source),
          id: randomUUID(),
          name: newName || `${source.name} copy`,
          folder,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastPlayed: null,
          totalPlaytimeMs: 0,
          launchCount: 0,
          favorite: false,
          history: []
        }

        task.setDetail('Copying files…')
        await copyDir(paths.instanceDir(source.folder), paths.instanceDir(folder))

        await this.persist(clone)
        this.notify()
        return clone
      }
    )
  }

  async changeVersion(
    id: string,
    minecraftVersion: string,
    loader: LoaderType,
    loaderVersion: string | null
  ): Promise<Instance> {
    const instance = await this.require(id)
    instance.minecraftVersion = minecraftVersion
    instance.loader = loader
    instance.loaderVersion = loaderVersion
    instance.resolvedVersionId = null
    instance.installed = false
    await this.persist(instance)
    this.notify()
    return instance
  }





  async setIconFromFile(id: string, sourcePath: string): Promise<Instance> {
    const instance = await this.require(id)
    const extension = (extname(sourcePath) || '.png').toLowerCase()
    const fileName = `icon${extension}`
    await ensureDir(paths.instanceMetaDir(instance.folder))
    await copyFile(sourcePath, join(paths.instanceMetaDir(instance.folder), fileName))
    instance.icon = { type: 'file', file: fileName }
    await this.persist(instance)
    this.notify()
    return instance
  }

  async setBackgroundFromFile(id: string, sourcePath: string): Promise<Instance> {
    const instance = await this.require(id)
    const extension = (extname(sourcePath) || '.jpg').toLowerCase()
    const fileName = `background${extension}`
    await ensureDir(paths.instanceMetaDir(instance.folder))
    await copyFile(sourcePath, join(paths.instanceMetaDir(instance.folder), fileName))
    instance.background = fileName
    await this.persist(instance)
    this.notify()
    return instance
  }

  async clearBackground(id: string): Promise<Instance> {
    const instance = await this.require(id)
    if (instance.background) {
      await removePath(join(paths.instanceMetaDir(instance.folder), instance.background)).catch(() => undefined)
    }
    instance.background = null
    await this.persist(instance)
    this.notify()
    return instance
  }

  async getImageUrl(id: string, which: 'icon' | 'background'): Promise<string | null> {
    const instance = await this.require(id)
    if (which === 'background') {
      if (!instance.background) return null
      const file = join(paths.instanceMetaDir(instance.folder), instance.background)
      return (await exists(file)) ? mediaUrl(file, instance.updatedAt) : null
    }
    if (instance.icon.type !== 'file') return null
    const file = join(paths.instanceMetaDir(instance.folder), instance.icon.file)
    return (await exists(file)) ? mediaUrl(file, instance.updatedAt) : null
  }





  async openFolder(id: string, sub?: string): Promise<void> {
    const instance = await this.require(id)
    const target = sub ? join(this.gameDir(instance), sub) : paths.instanceDir(instance.folder)
    await ensureDir(target)
    await shell.openPath(target)
  }

  async computeSize(id: string): Promise<number> {
    const instance = await this.require(id)
    return dirSize(paths.instanceDir(instance.folder))
  }






  async ensureInstalled(id: string, existingTask?: TaskHandle): Promise<string> {
    const instance = await this.require(id)

    const run = async (task: TaskHandle): Promise<string> => {
      this.setStatus(id, 'installing')
      try {
        task.setDetail('Preparing the loader…')
        const versionId = await installLoader(
          instance.loader,
          instance.minecraftVersion,
          instance.loaderVersion,
          task.slice(0, 0.35)
        )

        task.setDetail('Downloading game files…')
        await installVersion(versionId, { task: task.slice(0.35, 1), signal: task.signal })

        instance.resolvedVersionId = versionId
        instance.installed = true
        await this.persist(instance)
        this.notify()
        this.setStatus(id, 'idle')
        return versionId
      } catch (err) {
        this.setStatus(id, 'error', err instanceof Error ? err.message : String(err))
        throw err
      }
    }

    if (existingTask) return run(existingTask)
    return tasks.run(
      { title: `Preparing ${instance.name}`, kind: 'install', instanceId: id },
      run
    )
  }





  async recordLaunchStart(id: string, accountId: string | null, accountName: string | null): Promise<LaunchRecord> {
    const instance = await this.require(id)
    const record: LaunchRecord = {
      startedAt: Date.now(),
      endedAt: null,
      durationMs: 0,
      exitCode: null,
      crashed: false,
      accountId,
      accountName
    }
    instance.history.unshift(record)
    instance.history = instance.history.slice(0, 100)
    instance.launchCount += 1
    instance.lastPlayed = record.startedAt
    await this.persist(instance)
    this.notify()
    return record
  }

  async recordLaunchEnd(
    id: string,
    startedAt: number,
    exitCode: number | null,
    crashed: boolean,
    crashReportPath?: string | null
  ): Promise<void> {
    const instance = this.cache.get(id)
    if (!instance) return

    const record = instance.history.find((entry) => entry.startedAt === startedAt)
    if (record) {
      record.endedAt = Date.now()
      record.durationMs = record.endedAt - record.startedAt
      record.exitCode = exitCode
      record.crashed = crashed
      record.crashReportPath = crashReportPath ?? null
      instance.totalPlaytimeMs += record.durationMs
    }
    await this.persist(instance)
    this.notify()
  }





  async listBackups(id: string): Promise<BackupInfo[]> {
    const instance = await this.require(id)
    const dir = paths.instanceBackupsDir(instance.folder)
    const entries = await readdir(dir).catch(() => [] as string[])

    const backups: BackupInfo[] = []
    for (const fileName of entries) {
      if (!fileName.endsWith('.zip')) continue
      const full = join(dir, fileName)
      const info = await stat(full).catch(() => null)
      if (!info) continue
      const meta = await readJson<{ note: string; contents: BackupInfo['contents']; createdAt: number }>(
        `${full}.json`
      )
      backups.push({
        id: fileName,
        instanceId: id,
        fileName,
        path: full,
        createdAt: meta?.createdAt ?? info.mtimeMs,
        sizeBytes: info.size,
        note: meta?.note ?? '',
        contents: meta?.contents ?? ['everything']
      })
    }

    return backups.sort((a, b) => b.createdAt - a.createdAt)
  }

  async createBackup(id: string, options: BackupOptions): Promise<BackupInfo> {
    const instance = await this.require(id)

    return tasks.run(
      { title: `Backing up ${instance.name}`, kind: 'backup', instanceId: id },
      async (task) => {
        const gameDir = this.gameDir(instance)
        const dir = paths.instanceBackupsDir(instance.folder)
        await ensureDir(dir)

        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const fileName = `${stamp}.zip`
        const target = join(dir, fileName)

        const contents: BackupInfo['contents'] = []
        const sources: { path: string; archivePath: string }[] = []
        const add = (folder: BackupInfo['contents'][number], include: boolean): void => {
          if (!include) return
          contents.push(folder)
          sources.push({ path: join(gameDir, folder), archivePath: folder })
        }

        add('saves', options.includeSaves)
        add('mods', options.includeMods)
        add('config', options.includeConfig)
        add('resourcepacks', options.includeResourcePacks)
        add('shaderpacks', options.includeShaderPacks)

        if (!sources.length) throw new Error('Choose at least one folder to back up.')

        task.setDetail('Compressing…')
        await createZip(target, sources, [
          {
            archivePath: 'orbit-backup.json',
            content: JSON.stringify(
              { instance: instance.name, version: instance.minecraftVersion, loader: instance.loader },
              null,
              2
            )
          }
        ])

        const meta = { note: options.note, contents, createdAt: Date.now() }
        await writeJson(`${target}.json`, meta)

        const info = await stat(target)
        return {
          id: fileName,
          instanceId: id,
          fileName,
          path: target,
          createdAt: meta.createdAt,
          sizeBytes: info.size,
          note: options.note,
          contents
        }
      }
    )
  }

  async restoreBackup(id: string, backupId: string): Promise<void> {
    const instance = await this.require(id)
    if (this.getStatus(id) === 'running') throw new Error('Stop the game before restoring a backup.')

    const archive = join(paths.instanceBackupsDir(instance.folder), backupId)
    if (!(await exists(archive))) throw new Error('That backup file is missing.')

    await tasks.run(
      { title: `Restoring ${instance.name}`, kind: 'backup', instanceId: id },
      async (task) => {
        task.setDetail('Extracting…')
        await extractZip(archive, this.gameDir(instance), {
          filter: (name) => name !== 'orbit-backup.json',
          onProgress: (done, total) => task.setProgress(total ? done / total : -1)
        })
      }
    )
    this.notify()
  }

  async deleteBackup(id: string, backupId: string): Promise<void> {
    const instance = await this.require(id)
    const archive = join(paths.instanceBackupsDir(instance.folder), backupId)
    await removePath(archive)
    await removePath(`${archive}.json`).catch(() => undefined)
  }





  async export(id: string, targetPath: string, options: InstanceExportOptions): Promise<string> {
    const instance = await this.require(id)

    return tasks.run(
      { title: `Exporting ${instance.name}`, kind: 'export', instanceId: id },
      async (task) => {
        const gameDir = this.gameDir(instance)
        const metaDir = paths.instanceMetaDir(instance.folder)

        const sources: { path: string; archivePath: string }[] = [
          { path: join(gameDir, 'mods'), archivePath: 'minecraft/mods' }
        ]
        const maybe = (include: boolean, folder: string): void => {
          if (include) sources.push({ path: join(gameDir, folder), archivePath: `minecraft/${folder}` })
        }
        maybe(options.includeSaves, 'saves')
        maybe(options.includeConfig, 'config')
        maybe(options.includeResourcePacks, 'resourcepacks')
        maybe(options.includeShaderPacks, 'shaderpacks')
        maybe(options.includeScreenshots, 'screenshots')
        maybe(options.includeLogs, 'logs')

        if (instance.icon.type === 'file') {
          sources.push({ path: join(metaDir, instance.icon.file), archivePath: `assets/${instance.icon.file}` })
        }
        if (instance.background) {
          sources.push({ path: join(metaDir, instance.background), archivePath: `assets/${instance.background}` })
        }

        const manifest = {
          formatVersion: 1,
          exportedAt: new Date().toISOString(),
          instance: {
            name: instance.name,
            notes: instance.notes,
            tags: instance.tags,
            group: instance.group,
            icon: instance.icon,
            background: instance.background,
            accent: instance.accent,
            minecraftVersion: instance.minecraftVersion,
            minecraftVersionType: instance.minecraftVersionType,
            loader: instance.loader,
            loaderVersion: instance.loaderVersion,
            settings: instance.settings,
            modpack: instance.modpack
          }
        }

        task.setDetail('Compressing…')
        await createZip(targetPath, sources, [
          { archivePath: 'orbit-instance.json', content: JSON.stringify(manifest, null, 2) }
        ])
        return targetPath
      }
    )
  }

  async import(sourcePath: string): Promise<Instance> {
    await this.ensureLoaded()

    return tasks.run({ title: 'Importing instance', kind: 'import' }, async (task) => {
      const manifest = await readZipJson<{
        formatVersion: number
        instance: Partial<Instance> & { name: string; minecraftVersion: string; loader: LoaderType }
      }>(sourcePath, 'orbit-instance.json')

      if (!manifest?.instance) {
        throw new Error(
          'That file is not an Orbit instance export. Use Discover → Modpacks to import a Modrinth or CurseForge pack.'
        )
      }

      const source = manifest.instance
      const folder = await uniqueFolderName(paths.instancesDir, source.name)
      const instance: Instance = {
        ...defaultInstance(folder, {
          name: source.name,
          minecraftVersion: source.minecraftVersion,
          minecraftVersionType: (source.minecraftVersionType as MinecraftVersionType) ?? 'release',
          loader: source.loader,
          loaderVersion: source.loaderVersion ?? null
        }),
        notes: source.notes ?? '',
        tags: source.tags ?? [],
        group: source.group ?? null,
        icon: source.icon ?? { type: 'preset', key: 'orbit' },
        background: source.background ?? null,
        accent: source.accent ?? null,
        settings: { ...emptyInstanceSettings(), ...source.settings },
        modpack: source.modpack ?? null
      }

      await ensureDir(paths.instanceMetaDir(folder))
      const gameDir = paths.instanceGameDir(folder)
      for (const sub of GAME_SUBFOLDERS) await ensureDir(join(gameDir, sub))

      task.setDetail('Extracting files…')
      await extractZip(sourcePath, gameDir, {
        stripPrefix: 'minecraft/',
        onProgress: (done, total) => task.setProgress(total ? (done / total) * 0.9 : -1)
      })
      await extractZip(sourcePath, paths.instanceMetaDir(folder), { stripPrefix: 'assets/' }).catch(() => 0)

      await this.persist(instance)
      this.notify()
      log.info('instances', `Imported "${instance.name}" from ${basename(sourcePath)}`)
      return instance
    })
  }


  async register(instance: Instance): Promise<Instance> {
    await this.persist(instance)
    this.notify()
    return instance
  }


  async scaffold(req: InstanceCreateRequest): Promise<Instance> {
    await this.ensureLoaded()
    const folder = await uniqueFolderName(paths.instancesDir, req.name)
    const instance = defaultInstance(folder, req)
    await ensureDir(paths.instanceMetaDir(folder))
    const gameDir = paths.instanceGameDir(folder)
    for (const sub of GAME_SUBFOLDERS) await ensureDir(join(gameDir, sub))
    return instance
  }

  async writeInstanceFile(instance: Instance, relativePath: string, content: string | Buffer): Promise<void> {
    const target = join(this.gameDir(instance), relativePath)
    await ensureDir(join(target, '..'))
    await writeFile(target, content)
  }
}

export const instances = new InstanceManager()
