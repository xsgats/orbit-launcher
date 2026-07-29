import { copyFile, open, readdir, readFile, rename, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { clipboard, nativeImage, shell } from 'electron'
import type {
  ContentKind,
  ContentProvider,
  Instance,
  LoaderType,
  LocalContent,
  ScreenshotInfo,
  ServerInfo,
  StoreVersion,
  WorldInfo
} from '../../../shared/types'
import { copyDir, dirSize, ensureDir, exists, hashFile, readJson, removePath, writeJson } from '../../core/fsx'
import { log } from '../../core/logger'
import { nbtGet, nbtNumber, nbtString, parseNbt } from '../../core/nbt'
import { paths } from '../../core/paths'
import { createZip, extractZip, listZipEntries } from '../../core/zip'
import { instances } from '../instances'
import { tasks } from '../tasks'
import * as curseforge from '../store/curseforge'
import * as modrinth from '../store/modrinth'
import { packFormatLabel, readModMetadata, readPackMetadata } from './metadata'

const DISABLED_SUFFIX = '.disabled'

const CONTENT_DIRS: Record<ContentKind, string> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
  datapack: 'datapacks',
  modpack: 'mods',
  world: 'saves'
}

const CONTENT_EXTENSIONS: Record<ContentKind, string[]> = {
  mod: ['.jar'],
  resourcepack: ['.zip'],
  shader: ['.zip'],
  datapack: ['.zip'],
  modpack: ['.zip'],
  world: []
}





interface ProvenanceEntry {
  provider: ContentProvider
  projectId: string
  versionId: string
  projectName?: string
}

type ProvenanceIndex = Record<string, ProvenanceEntry>

function provenanceFile(instance: Instance): string {
  return join(paths.instanceMetaDir(instance.folder), 'content.json')
}

async function readProvenance(instance: Instance): Promise<ProvenanceIndex> {
  return (await readJson<ProvenanceIndex>(provenanceFile(instance))) ?? {}
}

async function writeProvenance(instance: Instance, index: ProvenanceIndex): Promise<void> {
  await writeJson(provenanceFile(instance), index)
}


function provenanceKey(fileName: string): string {
  return fileName.toLowerCase().replace(new RegExp(`${DISABLED_SUFFIX}$`, 'i'), '')
}





interface CacheEntry {
  key: string
  value: Awaited<ReturnType<typeof readModMetadata>>
}

const metadataCache = new Map<string, CacheEntry>()
const hashCache = new Map<string, { key: string; sha1: string }>()

async function cachedHash(path: string, size: number, mtime: number): Promise<string | null> {
  const key = `${size}:${mtime}`
  const hit = hashCache.get(path)
  if (hit?.key === key) return hit.sha1
  try {
    const sha1 = await hashFile(path, 'sha1')
    hashCache.set(path, { key, sha1 })
    return sha1
  } catch {
    return null
  }
}





function contentDir(instance: Instance, kind: ContentKind): string {
  return join(instances.gameDir(instance), CONTENT_DIRS[kind])
}

export async function listContent(instanceId: string, kind: ContentKind): Promise<LocalContent[]> {
  const instance = await instances.require(instanceId)
  const dir = contentDir(instance, kind)
  await ensureDir(dir)

  const [entries, provenance] = await Promise.all([
    readdir(dir, { withFileTypes: true }).catch(() => []),
    readProvenance(instance)
  ])

  const extensions = CONTENT_EXTENSIONS[kind]
  const out: LocalContent[] = []

  for (const entry of entries) {
    const fileName = entry.name
    const enabled = !fileName.toLowerCase().endsWith(DISABLED_SUFFIX)
    const bare = enabled ? fileName : fileName.slice(0, -DISABLED_SUFFIX.length)
    const extension = extname(bare).toLowerCase()


    const isFolderPack = entry.isDirectory() && kind !== 'mod'
    if (!isFolderPack && (!entry.isFile() || (extensions.length && !extensions.includes(extension)))) continue

    const full = join(dir, fileName)
    const info = await stat(full).catch(() => null)
    if (!info) continue

    const size = isFolderPack ? await dirSize(full) : info.size
    const record = provenance[provenanceKey(bare)] ?? null

    const item: LocalContent = {
      id: fileName,
      kind,
      fileName,
      relativePath: `${CONTENT_DIRS[kind]}/${fileName}`,
      enabled,
      sizeBytes: size,
      modifiedAt: info.mtimeMs,
      sha1: null,
      name: bare.replace(/\.(jar|zip)$/i, ''),
      description: null,
      version: null,
      authors: [],
      loaders: [],
      gameVersions: [],
      iconDataUrl: null,
      homepage: null,
      provider: record?.provider ?? null,
      projectId: record?.projectId ?? null,
      versionId: record?.versionId ?? null,
      update: null,
      requiredDependencies: [],
      problems: []
    }

    if (!isFolderPack) {
      item.sha1 = await cachedHash(full, info.size, info.mtimeMs)

      if (kind === 'mod') {
        const cacheKey = `${info.size}:${info.mtimeMs}`
        let metadata = metadataCache.get(full)?.key === cacheKey ? metadataCache.get(full)!.value : null
        if (!metadata) {
          metadata = await readModMetadata(full)
          metadataCache.set(full, { key: cacheKey, value: metadata })
        }
        item.name = metadata.name
        item.description = metadata.description
        item.version = metadata.version
        item.authors = metadata.authors
        item.loaders = metadata.loaders
        item.gameVersions = metadata.gameVersions
        item.iconDataUrl = metadata.iconDataUrl
        item.homepage = metadata.homepage
        item.requiredDependencies = metadata.dependencies

        if (metadata.loaders.length && !metadata.loaders.includes(instance.loader)) {
          item.problems.push(
            `Built for ${metadata.loaders.join(', ')} but this instance uses ${instance.loader}.`
          )
        }
      } else {
        const pack = await readPackMetadata(full)
        item.description = pack.description
        item.iconDataUrl = pack.iconDataUrl
        const label = packFormatLabel(pack.packFormat)
        if (label) item.gameVersions = [label]
      }
    }

    if (record?.projectName) item.name = record.projectName || item.name
    out.push(item)
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}





export async function setEnabled(
  instanceId: string,
  contentId: string,
  enabled: boolean
): Promise<LocalContent[]> {
  const instance = await instances.require(instanceId)

  for (const kind of ['mod', 'resourcepack', 'shader', 'datapack'] as ContentKind[]) {
    const dir = contentDir(instance, kind)
    const current = join(dir, contentId)
    if (!(await exists(current))) continue

    const isDisabled = contentId.toLowerCase().endsWith(DISABLED_SUFFIX)
    if (isDisabled === !enabled) return listContent(instanceId, kind)

    const next = enabled
      ? join(dir, contentId.slice(0, -DISABLED_SUFFIX.length))
      : join(dir, `${contentId}${DISABLED_SUFFIX}`)

    await rename(current, next)
    return listContent(instanceId, kind)
  }

  throw new Error('That file is no longer in the instance folder.')
}

export async function removeContent(instanceId: string, contentIds: string[]): Promise<LocalContent[]> {
  const instance = await instances.require(instanceId)
  const provenance = await readProvenance(instance)
  let touchedKind: ContentKind = 'mod'

  for (const contentId of contentIds) {
    for (const kind of ['mod', 'resourcepack', 'shader', 'datapack'] as ContentKind[]) {
      const target = join(contentDir(instance, kind), contentId)
      if (await exists(target)) {
        await removePath(target)
        delete provenance[provenanceKey(contentId)]
        metadataCache.delete(target)
        hashCache.delete(target)
        touchedKind = kind
        break
      }
    }
  }

  await writeProvenance(instance, provenance)
  return listContent(instanceId, touchedKind)
}

export async function addFromFiles(
  instanceId: string,
  kind: ContentKind,
  sourcePaths: string[]
): Promise<LocalContent[]> {
  const instance = await instances.require(instanceId)
  const dir = contentDir(instance, kind)
  await ensureDir(dir)

  for (const source of sourcePaths) {
    const target = join(dir, basename(source))
    await copyFile(source, target)
  }

  return listContent(instanceId, kind)
}





export async function recordInstall(
  instance: Instance,
  fileName: string,
  entry: ProvenanceEntry
): Promise<void> {
  const provenance = await readProvenance(instance)
  provenance[provenanceKey(fileName)] = entry
  await writeProvenance(instance, provenance)
}


export async function removePreviousVersion(
  instance: Instance,
  kind: ContentKind,
  projectId: string,
  keepFileName: string
): Promise<void> {
  const provenance = await readProvenance(instance)
  const dir = contentDir(instance, kind)
  let changed = false

  for (const [key, entry] of Object.entries(provenance)) {
    if (entry.projectId !== projectId || key === provenanceKey(keepFileName)) continue
    for (const candidate of [key, `${key}${DISABLED_SUFFIX}`]) {
      const target = join(dir, candidate)
      if (await exists(target)) {
        await removePath(target)
        metadataCache.delete(target)
        hashCache.delete(target)
      }
    }
    delete provenance[key]
    changed = true
  }

  if (changed) await writeProvenance(instance, provenance)
}

export function directoryFor(instance: Instance, kind: ContentKind): string {
  return contentDir(instance, kind)
}





function versionToUpdate(version: StoreVersion): NonNullable<LocalContent['update']> {
  const file = version.files.find((f) => f.primary) ?? version.files[0]
  return {
    versionId: version.id,
    versionNumber: version.versionNumber,
    versionName: version.name,
    datePublished: version.datePublished,
    changelog: version.changelog,
    fileName: file?.fileName ?? version.name
  }
}

export async function checkUpdates(instanceId: string, kind: ContentKind): Promise<LocalContent[]> {
  const instance = await instances.require(instanceId)
  const items = await listContent(instanceId, kind)
  if (!items.length) return items

  const loaders: LoaderType[] = kind === 'mod' && instance.loader !== 'vanilla' ? [instance.loader] : []
  const gameVersions = [instance.minecraftVersion]


  const hashes = items.map((item) => item.sha1).filter((hash): hash is string => Boolean(hash))
  if (hashes.length) {
    try {
      const updates = await modrinth.latestForHashes(hashes, loaders, gameVersions)
      const known = await modrinth.lookupByHashes(hashes)

      for (const item of items) {
        if (!item.sha1) continue
        const current = known.get(item.sha1)
        if (current && !item.projectId) {
          item.provider = 'modrinth'
          item.projectId = current.projectId
          item.versionId = current.id
        }
        const candidate = updates.get(item.sha1)
        if (candidate && candidate.id !== (current?.id ?? item.versionId)) {
          item.update = versionToUpdate(candidate)
        }
      }
    } catch (err) {
      log.warn('content', 'Modrinth update check failed', err)
    }
  }


  if (curseforge.isConfigured()) {
    const pending = items.filter((item) => item.provider === 'curseforge' && item.projectId && !item.update)
    for (const item of pending) {
      try {
        const versions = await curseforge.versions(item.projectId!, {
          gameVersions,
          loaders: loaders.length ? loaders : undefined
        })
        const newest = versions.find((version) => version.channel === 'release') ?? versions[0]
        if (newest && newest.id !== item.versionId) item.update = versionToUpdate(newest)
      } catch (err) {
        log.warn('content', `CurseForge update check failed for ${item.name}`, err)
      }
    }
  }

  return items
}





export async function listWorlds(instanceId: string): Promise<WorldInfo[]> {
  const instance = await instances.require(instanceId)
  const savesDir = join(instances.gameDir(instance), 'saves')
  await ensureDir(savesDir)

  const entries = await readdir(savesDir, { withFileTypes: true }).catch(() => [])
  const worlds: WorldInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(savesDir, entry.name)
    const levelDat = join(dir, 'level.dat')
    if (!(await exists(levelDat))) continue

    const world: WorldInfo = {
      id: entry.name,
      folder: entry.name,
      name: entry.name,
      sizeBytes: 0,
      lastPlayed: null,
      gameMode: null,
      hardcore: false,
      difficulty: null,
      seed: null,
      version: null,
      iconDataUrl: null,
      hasDatapacks: false,
      datapackCount: 0
    }

    try {
      const nbt = parseNbt(await readFile(levelDat))
      const data = nbtGet(nbt, 'Data')
      world.name = nbtString(nbtGet(data, 'LevelName')) ?? entry.name
      world.lastPlayed = nbtNumber(nbtGet(data, 'LastPlayed'))
      world.gameMode = nbtNumber(nbtGet(data, 'GameType'))
      world.hardcore = nbtNumber(nbtGet(data, 'hardcore')) === 1
      world.difficulty = nbtNumber(nbtGet(data, 'Difficulty'))
      world.version = nbtString(nbtGet(data, 'Version', 'Name'))
      const seed =
        nbtGet(data, 'WorldGenSettings', 'seed') ?? nbtGet(data, 'RandomSeed')
      if (typeof seed === 'bigint') world.seed = seed.toString()
      else if (typeof seed === 'number') world.seed = String(seed)
    } catch (err) {
      log.warn('content', `Could not read level.dat for ${entry.name}`, err)
    }

    const icon = join(dir, 'icon.png')
    if (await exists(icon)) {
      try {
        world.iconDataUrl = `data:image/png;base64,${(await readFile(icon)).toString('base64')}`
      } catch {

      }
    }

    const datapacks = await readdir(join(dir, 'datapacks')).catch(() => [] as string[])
    world.datapackCount = datapacks.filter((name) => !name.startsWith('.')).length
    world.hasDatapacks = world.datapackCount > 0
    world.sizeBytes = await dirSize(dir)

    worlds.push(world)
  }

  return worlds.sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || a.name.localeCompare(b.name))
}

export async function deleteWorld(instanceId: string, worldId: string): Promise<void> {
  const instance = await instances.require(instanceId)
  await removePath(join(instances.gameDir(instance), 'saves', worldId))
}

export async function duplicateWorld(instanceId: string, worldId: string): Promise<WorldInfo[]> {
  const instance = await instances.require(instanceId)
  const savesDir = join(instances.gameDir(instance), 'saves')

  let target = `${worldId} copy`
  let index = 1
  while (await exists(join(savesDir, target))) {
    index += 1
    target = `${worldId} copy ${index}`
  }
  await copyDir(join(savesDir, worldId), join(savesDir, target))
  return listWorlds(instanceId)
}

export async function exportWorld(instanceId: string, worldId: string, targetPath: string): Promise<string> {
  const instance = await instances.require(instanceId)
  const source = join(instances.gameDir(instance), 'saves', worldId)

  return tasks.run({ title: `Exporting ${worldId}`, kind: 'export', instanceId }, async (task) => {
    task.setDetail('Compressingâ€¦')
    await createZip(targetPath, [{ path: source, archivePath: worldId }])
    return targetPath
  })
}

export async function importWorld(instanceId: string, sourcePath: string): Promise<WorldInfo[]> {
  const instance = await instances.require(instanceId)
  const savesDir = join(instances.gameDir(instance), 'saves')
  await ensureDir(savesDir)

  await tasks.run({ title: 'Importing world', kind: 'import', instanceId }, async (task) => {
    const entries = await listZipEntries(sourcePath)


    const hasRootLevelDat = entries.some((entry) => entry.fileName === 'level.dat')
    const rootFolder = entries.find((entry) => /^[^/]+\/level\.dat$/.test(entry.fileName))?.fileName.split('/')[0]

    if (!hasRootLevelDat && !rootFolder) {
      throw new Error('That archive does not contain a Minecraft world (no level.dat found).')
    }

    const name = hasRootLevelDat ? basename(sourcePath).replace(/\.zip$/i, '') : rootFolder!
    let target = name
    let index = 1
    while (await exists(join(savesDir, target))) {
      index += 1
      target = `${name} (${index})`
    }

    task.setDetail('Extractingâ€¦')
    await extractZip(sourcePath, hasRootLevelDat ? join(savesDir, target) : savesDir, {
      onProgress: (done, total) => task.setProgress(total ? done / total : -1)
    })

    if (!hasRootLevelDat && rootFolder && rootFolder !== target) {
      await rename(join(savesDir, rootFolder), join(savesDir, target)).catch(() => undefined)
    }
  })

  return listWorlds(instanceId)
}





function pngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

export async function listScreenshots(instanceId: string): Promise<ScreenshotInfo[]> {
  const instance = await instances.require(instanceId)
  const dir = join(instances.gameDir(instance), 'screenshots')
  await ensureDir(dir)

  const entries = await readdir(dir).catch(() => [] as string[])
  const shots: ScreenshotInfo[] = []

  for (const fileName of entries) {
    if (!/\.(png|jpg|jpeg)$/i.test(fileName)) continue
    const full = join(dir, fileName)
    const info = await stat(full).catch(() => null)
    if (!info) continue

    let width: number | null = null
    let height: number | null = null
    if (fileName.toLowerCase().endsWith('.png')) {
      try {
        const handle = await open(full, 'r')
        const header = Buffer.alloc(24)
        await handle.read(header, 0, 24, 0)
        await handle.close()
        const dimensions = pngDimensions(header)
        width = dimensions?.width ?? null
        height = dimensions?.height ?? null
      } catch {

      }
    }

    shots.push({
      id: fileName,
      fileName,
      path: full,
      sizeBytes: info.size,
      createdAt: info.mtimeMs,
      width,
      height
    })
  }

  return shots.sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteScreenshots(instanceId: string, ids: string[]): Promise<ScreenshotInfo[]> {
  const instance = await instances.require(instanceId)
  const dir = join(instances.gameDir(instance), 'screenshots')
  for (const id of ids) await removePath(join(dir, id))
  return listScreenshots(instanceId)
}

export async function copyScreenshotToClipboard(instanceId: string, id: string): Promise<void> {
  const instance = await instances.require(instanceId)
  const full = join(instances.gameDir(instance), 'screenshots', id)
  const image = nativeImage.createFromPath(full)
  if (image.isEmpty()) throw new Error('That screenshot could not be read.')
  clipboard.writeImage(image)
}

export async function revealScreenshot(instanceId: string, id: string): Promise<void> {
  const instance = await instances.require(instanceId)
  shell.showItemInFolder(join(instances.gameDir(instance), 'screenshots', id))
}





export async function listServers(instanceId: string): Promise<ServerInfo[]> {
  const instance = await instances.require(instanceId)
  const file = join(instances.gameDir(instance), 'servers.dat')
  if (!(await exists(file))) return []

  try {
    const nbt = parseNbt(await readFile(file))
    const list = nbtGet(nbt, 'servers')
    if (!Array.isArray(list)) return []

    return list.map((entry) => {
      const record = entry as Record<string, unknown>
      const icon = typeof record.icon === 'string' ? record.icon : null
      return {
        name: typeof record.name === 'string' ? record.name : 'Server',
        address: typeof record.ip === 'string' ? record.ip : '',
        iconDataUrl: icon ? `data:image/png;base64,${icon}` : null
      }
    })
  } catch (err) {
    log.warn('content', 'Could not read servers.dat', err)
    return []
  }
}
