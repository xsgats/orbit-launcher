import { copyFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { MinecraftVersionSummary, MinecraftVersionType } from '../../../shared/types'
import { ensureDir, exists, readJson, removePath, writeJson } from '../../core/fsx'
import { log } from '../../core/logger'
import { cached, getJson, mapConcurrent } from '../../core/net'
import { paths } from '../../core/paths'
import { extractZip } from '../../core/zip'
import { downloadAll, downloadFile, type DownloadSpec } from '../downloads'
import type { TaskHandle } from '../tasks'
import {
  mavenKey,
  mavenPath,
  mergeVersions,
  nativesClassifier,
  rulesAllow,
  type AssetIndex,
  type Library,
  type VersionJson
} from './schema'

const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const RESOURCES_BASE = 'https://resources.download.minecraft.net'
const MANIFEST_TTL = 15 * 60 * 1000

interface MojangManifest {
  latest: { release: string; snapshot: string }
  versions: { id: string; type: string; url: string; time: string; releaseTime: string; sha1: string }[]
}

let latestIds: { release: string; snapshot: string } = { release: '', snapshot: '' }

export function latestVersionIds(): { release: string; snapshot: string } {
  return latestIds
}

export async function getManifest(refresh = false): Promise<MinecraftVersionSummary[]> {
  const load = async (): Promise<MojangManifest> => getJson<MojangManifest>(VERSION_MANIFEST_URL, { timeoutMs: 20_000 })
  const manifest = refresh
    ? await load().then(async (value) => {
        await writeJson(join(paths.metaCacheDir, 'mojang-manifest.json'), { fetchedAt: Date.now(), value })
        return value
      })
    : await cached('mojang-manifest', MANIFEST_TTL, load)

  latestIds = manifest.latest

  return manifest.versions.map((version) => ({
    id: version.id,
    type: (version.type as MinecraftVersionType) ?? 'release',
    releaseTime: version.releaseTime,
    url: version.url
  }))
}

async function manifestEntry(id: string): Promise<{ url: string; sha1: string } | null> {
  const manifest = await cached('mojang-manifest', MANIFEST_TTL, () =>
    getJson<MojangManifest>(VERSION_MANIFEST_URL, { timeoutMs: 20_000 })
  )
  const found = manifest.versions.find((v) => v.id === id)
  return found ? { url: found.url, sha1: found.sha1 } : null
}

export function versionDir(id: string): string {
  return join(paths.versionsDir, id)
}

export function versionJsonPath(id: string): string {
  return join(versionDir(id), `${id}.json`)
}

export function versionJarPath(id: string): string {
  return join(versionDir(id), `${id}.jar`)
}


export async function saveVersionJson(json: VersionJson): Promise<void> {
  await ensureDir(versionDir(json.id))
  await writeJson(versionJsonPath(json.id), json)
}


export async function loadVersionJson(id: string): Promise<VersionJson> {
  const local = await readJson<VersionJson>(versionJsonPath(id))
  if (local) return local

  const entry = await manifestEntry(id)
  if (!entry) {
    throw new Error(`Unknown Minecraft version "${id}". It may have been removed from the Mojang manifest.`)
  }

  const json = await getJson<VersionJson>(entry.url, { timeoutMs: 25_000 })
  await saveVersionJson(json)
  return json
}

export interface ResolvedVersion extends VersionJson {

  chain: string[]
  javaMajor: number
}


export async function resolveVersion(id: string, seen = new Set<string>()): Promise<ResolvedVersion> {
  if (seen.has(id)) throw new Error(`Circular version inheritance detected at "${id}"`)
  seen.add(id)

  const json = await loadVersionJson(id)
  if (!json.inheritsFrom) {
    return { ...json, chain: [id], javaMajor: json.javaVersion?.majorVersion ?? 8 }
  }

  const parent = await resolveVersion(json.inheritsFrom, seen)
  const merged = mergeVersions(parent, json)
  return {
    ...merged,
    chain: [...parent.chain, id],
    javaMajor: merged.javaVersion?.majorVersion ?? parent.javaMajor
  }
}





export interface ResolvedLibrary {
  name: string

  path: string
  url: string | null
  sha1: string | null
  size: number | null
  isNative: boolean
  extractExclude: string[]
}

function libraryDownloadUrl(library: Library, relativePath: string): string | null {
  if (library.url) return `${library.url.replace(/\/$/, '')}/${relativePath}`

  return `https://libraries.minecraft.net/${relativePath}`
}

export function resolveLibraries(version: VersionJson): ResolvedLibrary[] {
  const out: ResolvedLibrary[] = []
  const seen = new Set<string>()

  for (const library of version.libraries ?? []) {
    if (!rulesAllow(library.rules)) continue

    const classifier = nativesClassifier(library)


    const hasArtifact = library.downloads?.artifact || !library.natives
    if (hasArtifact) {
      const artifact = library.downloads?.artifact
      const relative = artifact?.path ?? mavenPath(library.name)
      const key = `jar:${relative}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({
          name: library.name,
          path: join(paths.librariesDir, ...relative.split('/')),
          url: artifact?.url ?? libraryDownloadUrl(library, relative),
          sha1: artifact?.sha1 ?? null,
          size: artifact?.size ?? null,
          isNative: false,
          extractExclude: []
        })
      }
    }

    if (classifier) {
      const artifact = library.downloads?.classifiers?.[classifier]
      const relative = artifact?.path ?? mavenPath(`${library.name}:${classifier}`)
      const key = `native:${relative}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({
          name: `${library.name}:${classifier}`,
          path: join(paths.librariesDir, ...relative.split('/')),
          url: artifact?.url ?? libraryDownloadUrl(library, relative),
          sha1: artifact?.sha1 ?? null,
          size: artifact?.size ?? null,
          isNative: true,
          extractExclude: library.extract?.exclude ?? ['META-INF/']
        })
      }
    }
  }

  return out
}


export function buildClasspath(version: VersionJson, clientJar: string): string[] {
  const libraries = resolveLibraries(version).filter((l) => !l.isNative)
  const byKey = new Map<string, string>()
  for (const library of libraries) byKey.set(mavenKey(library.name), library.path)
  return [...byKey.values(), clientJar]
}





export interface InstallOptions {
  task?: TaskHandle
  signal?: AbortSignal
}

async function installAssets(version: VersionJson, options: InstallOptions): Promise<void> {
  if (!version.assetIndex) return
  const { task } = options

  const indexPath = join(paths.assetIndexesDir, `${version.assetIndex.id}.json`)
  task?.setDetail('Fetching the asset index…')
  await downloadFile(
    {
      url: version.assetIndex.url,
      target: indexPath,
      sha1: version.assetIndex.sha1,
      size: version.assetIndex.size
    },
    { signal: options.signal }
  )

  const index = await readJson<AssetIndex>(indexPath)
  if (!index?.objects) return

  const entries = Object.entries(index.objects)
  task?.setDetail(`Downloading ${entries.length.toLocaleString()} assets…`)

  const specs: DownloadSpec[] = entries.map(([, object]) => ({
    url: `${RESOURCES_BASE}/${object.hash.slice(0, 2)}/${object.hash}`,
    target: join(paths.assetObjectsDir, object.hash.slice(0, 2), object.hash),
    sha1: object.hash,
    size: object.size
  }))

  await downloadAll(specs, { task, signal: options.signal, verify: false })


  if (index.virtual || index.map_to_resources) {
    const virtualRoot = join(paths.assetsDir, 'virtual', version.assetIndex.id)
    task?.setDetail('Preparing legacy assets…')
    await mapConcurrent(entries, 16, async ([name, object]) => {
      const target = join(virtualRoot, ...name.split('/'))
      if (await exists(target)) return
      await ensureDir(join(target, '..'))
      await copyFile(join(paths.assetObjectsDir, object.hash.slice(0, 2), object.hash), target).catch(() => undefined)
    })
  }
}


export async function extractNatives(version: VersionJson, targetDir: string): Promise<void> {
  const natives = resolveLibraries(version).filter((l) => l.isNative)
  if (!natives.length) return

  await removePath(targetDir)
  await ensureDir(targetDir)

  for (const native of natives) {
    if (!(await exists(native.path))) continue
    await extractZip(native.path, targetDir, {
      filter: (name) => {
        if (name.endsWith('/')) return false
        if (native.extractExclude.some((prefix) => name.startsWith(prefix))) return false

        return true
      }
    })
  }


  const entries = await readdir(targetDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const nested = await readdir(join(targetDir, entry.name)).catch(() => [])
    for (const file of nested) {
      if (file.toLowerCase().endsWith('.dll')) {
        await copyFile(join(targetDir, entry.name, file), join(targetDir, file)).catch(() => undefined)
      }
    }
  }
}

export function nativesDirFor(versionId: string): string {
  return join(paths.nativesDir, versionId)
}





export async function installVersion(versionId: string, options: InstallOptions = {}): Promise<ResolvedVersion> {
  const { task } = options
  task?.setDetail('Resolving version metadata…')

  const version = await resolveVersion(versionId)


  const rootId = version.chain[0]
  const clientJar = versionJarPath(rootId)
  const clientDownload = version.downloads?.client
  if (clientDownload) {
    task?.setDetail('Downloading the Minecraft client…')
    await downloadFile(
      { url: clientDownload.url, target: clientJar, sha1: clientDownload.sha1, size: clientDownload.size },
      { task: task?.slice(0, 0.12), signal: options.signal }
    )
  } else if (!(await exists(clientJar))) {
    throw new Error(`Version "${rootId}" does not publish a client download.`)
  }


  task?.setDetail('Downloading libraries…')
  const libraries = resolveLibraries(version)
  await downloadAll(
    libraries
      .filter((library) => library.url)
      .map((library) => ({
        url: library.url!,
        target: library.path,
        sha1: library.sha1,
        size: library.size
      })),
    { task: task?.slice(0.12, 0.42), signal: options.signal }
  )


  task?.setDetail('Extracting natives…')
  await extractNatives(version, nativesDirFor(version.id))


  if (version.logging?.client?.file) {
    const file = version.logging.client.file
    await downloadFile(
      {
        url: file.url,
        target: join(paths.assetsDir, 'log_configs', file.id),
        sha1: file.sha1,
        size: file.size
      },
      { signal: options.signal }
    ).catch((err) => log.warn('versions', 'Could not fetch the log4j config', err))
  }


  await installAssets(version, { task: task?.slice(0.45, 1), signal: options.signal })

  task?.setProgress(1)
  log.info('versions', `Version ${versionId} is fully installed`)
  return version
}

export function loggingConfigPath(version: VersionJson): string | null {
  const file = version.logging?.client?.file
  return file ? join(paths.assetsDir, 'log_configs', file.id) : null
}


export function assetsRootFor(version: VersionJson): { dir: string; index: string; legacy: boolean } {
  const index = version.assetIndex?.id ?? version.assets ?? 'legacy'
  const legacy = index === 'legacy' || index === 'pre-1.6'
  return {
    dir: legacy ? join(paths.assetsDir, 'virtual', index) : paths.assetsDir,
    index,
    legacy
  }
}
