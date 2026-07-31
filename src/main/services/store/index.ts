import { join } from 'node:path'
import type {
  ContentKind,
  ContentProvider,
  Instance,
  LoaderType,
  StoreCategory,
  StoreProjectDetail,
  StoreSearchQuery,
  StoreSearchResult,
  StoreVersion
} from '../../../shared/types'
import type { InstallVersionRequest, QuickInstallRequest } from '../../../shared/api'
import { copyDir, readJson, removePath } from '../../core/fsx'
import { log } from '../../core/logger'
import { paths } from '../../core/paths'
import { settings } from '../../core/settings'
import { extractZip, readZipJson } from '../../core/zip'
import { directoryFor, recordInstall, removePreviousVersion } from '../content'
import { downloadAll, downloadFile } from '../downloads'
import { instances } from '../instances'
import { notifications } from '../notifications'
import { tasks, type TaskHandle } from '../tasks'
import * as curseforge from './curseforge'
import * as modrinth from './modrinth'






function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = []
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (i < a.length) out.push(a[i])
    if (i < b.length) out.push(b[i])
  }
  return out
}

export async function search(query: StoreSearchQuery): Promise<StoreSearchResult> {
  const config = settings.get()
  const wanted = query.providers.filter((provider) =>
    provider === 'modrinth' ? config.enableModrinth : config.enableCurseForge
  )
  const providers = wanted.length ? wanted : (['modrinth'] as ContentProvider[])
  const errors: StoreSearchResult['errors'] = []

  const perProvider = providers.length > 1 ? Math.ceil(query.limit / 2) : query.limit
  const offset = providers.length > 1 ? Math.floor(query.offset / 2) : query.offset

  const results = await Promise.all(
    providers.map(async (provider) => {
      try {
        const scoped = { ...query, limit: perProvider, offset }
        return provider === 'modrinth' ? await modrinth.search(scoped) : await curseforge.search(scoped)
      } catch (err) {
        errors.push({ provider, message: err instanceof Error ? err.message : String(err) })
        return null
      }
    })
  )

  const alive = results.filter((result): result is StoreSearchResult => result !== null)
  if (!alive.length) {
    return { hits: [], offset: query.offset, limit: query.limit, total: 0, errors }
  }

  const hits =
    alive.length === 1 ? alive[0].hits : interleave(alive[0].hits, alive[1].hits)

  const annotated = query.instanceId ? await annotateInstallState(query.instanceId, hits) : hits

  return {
    hits: annotated,
    offset: query.offset,
    limit: query.limit,
    total: alive.reduce((sum, result) => sum + result.total, 0),
    errors
  }
}

async function annotateInstallState(
  instanceId: string,
  hits: StoreSearchResult['hits']
): Promise<StoreSearchResult['hits']> {
  try {
    const instance = await instances.require(instanceId)
    const provenance =
      (await readJson<Record<string, { provider: ContentProvider; projectId: string; versionId: string }>>(
        join(paths.instanceMetaDir(instance.folder), 'content.json')
      )) ?? {}

    const installed = new Map<string, string>()
    for (const entry of Object.values(provenance)) {
      installed.set(`${entry.provider}:${entry.projectId}`, entry.versionId)
    }

    return hits.map((hit) => ({
      ...hit,
      installedVersionId: installed.get(`${hit.provider}:${hit.id}`) ?? null
    }))
  } catch {
    return hits
  }
}

export async function featured(kind: ContentKind): Promise<StoreSearchResult> {
  return search({
    providers: ['modrinth', 'curseforge'],
    kind,
    query: '',
    gameVersions: [],
    loaders: [],
    categories: [],
    sort: 'downloads',
    offset: 0,
    limit: 20
  })
}

export async function project(provider: ContentProvider, projectId: string): Promise<StoreProjectDetail> {
  return provider === 'modrinth' ? modrinth.project(projectId) : curseforge.project(projectId)
}

export async function versions(
  provider: ContentProvider,
  projectId: string,
  filter?: { gameVersions?: string[]; loaders?: LoaderType[] }
): Promise<StoreVersion[]> {
  return provider === 'modrinth'
    ? modrinth.versions(projectId, filter)
    : curseforge.versions(projectId, filter)
}

export async function categories(kind: ContentKind): Promise<StoreCategory[]> {
  const config = settings.get()
  const lists = await Promise.all([
    config.enableModrinth ? modrinth.categories(kind).catch(() => []) : Promise.resolve([]),
    config.enableCurseForge && curseforge.isConfigured()
      ? curseforge.categories(kind).catch(() => [])
      : Promise.resolve([])
  ])


  const seen = new Set(lists[0].map((category) => category.name.toLowerCase()))
  return [...lists[0], ...lists[1].filter((category) => !seen.has(category.name.toLowerCase()))]
}

async function getVersion(
  provider: ContentProvider,
  projectId: string,
  versionId: string
): Promise<StoreVersion> {
  return provider === 'modrinth' ? modrinth.version(versionId) : curseforge.version(projectId, versionId)
}





function bestVersion(
  candidates: StoreVersion[],
  minecraftVersion: string,
  loader: LoaderType
): StoreVersion | null {
  const compatible = candidates.filter(
    (version) =>
      version.gameVersions.includes(minecraftVersion) &&
      (loader === 'vanilla' || !version.loaders.length || version.loaders.includes(loader))
  )
  const pool = compatible.length ? compatible : candidates
  return (
    pool.find((version) => version.channel === 'release') ??
    pool.sort((a, b) => new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime())[0] ??
    null
  )
}

async function installSingleVersion(
  instance: Instance,
  kind: ContentKind,
  version: StoreVersion,
  projectName: string,
  task: TaskHandle
): Promise<void> {
  const file = version.files.find((entry) => entry.primary) ?? version.files[0]
  if (!file) throw new Error(`${projectName} ${version.versionNumber} has no downloadable file.`)

  const dir = directoryFor(instance, kind)
  const target = join(dir, file.fileName)

  task.setDetail(`Downloading ${file.fileName}`)
  await downloadFile(
    {
      url: file.url,
      target,
      sha1: file.sha1,
      sha512: file.sha512,
      size: file.sizeBytes || null
    },
    { task, verify: Boolean(file.sha1 || file.sha512) }
  )

  await removePreviousVersion(instance, kind, version.projectId, file.fileName)
  await recordInstall(instance, file.fileName, {
    provider: version.provider,
    projectId: version.projectId,
    versionId: version.id,
    projectName
  })
}


async function resolveDependencies(
  instance: Instance,
  version: StoreVersion
): Promise<{ version: StoreVersion; name: string }[]> {
  const out: { version: StoreVersion; name: string }[] = []

  for (const dependency of version.dependencies) {
    if (dependency.type !== 'required') continue
    if (!dependency.projectId && !dependency.versionId) continue

    try {
      let resolved: StoreVersion | null = null

      if (dependency.versionId && dependency.projectId) {
        resolved = await getVersion(dependency.provider, dependency.projectId, dependency.versionId)
      } else if (dependency.projectId) {
        const candidates = await versions(dependency.provider, dependency.projectId, {
          gameVersions: [instance.minecraftVersion],
          loaders: instance.loader === 'vanilla' ? undefined : [instance.loader]
        })
        resolved = bestVersion(candidates, instance.minecraftVersion, instance.loader)
      }

      if (resolved) {
        const detail = await project(resolved.provider, resolved.projectId).catch(() => null)
        out.push({ version: resolved, name: detail?.name ?? resolved.name })
      }
    } catch (err) {
      log.warn('store', `Could not resolve a dependency of ${version.name}`, err)
    }
  }

  return out
}

/**
 * The version a one-click install should choose: the newest stable release that
 * actually fits the instance, falling back to the newest pre-release. Unlike
 * bestVersion this never settles for something incompatible — a quick action
 * has no dialog in which to warn the user.
 */
function pickRecommended(
  candidates: StoreVersion[],
  minecraftVersion: string,
  loader: LoaderType,
  kind: ContentKind
): StoreVersion | null {
  const loaderMatters = kind === 'mod'

  const compatible = candidates.filter(
    (version) =>
      version.gameVersions.includes(minecraftVersion) &&
      (!loaderMatters || loader === 'vanilla' || !version.loaders.length || version.loaders.includes(loader))
  )
  if (!compatible.length) return null

  const newestFirst = [...compatible].sort(
    (a, b) => new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime()
  )
  return newestFirst.find((version) => version.channel === 'release') ?? newestFirst[0]
}

async function resolveRecommended(
  request: QuickInstallRequest
): Promise<{ instance: Instance; version: StoreVersion | null; projectName: string }> {
  const instance = await instances.require(request.instanceId)

  const filtered = await versions(request.provider, request.projectId, {
    gameVersions: [instance.minecraftVersion],
    loaders: request.kind === 'mod' && instance.loader !== 'vanilla' ? [instance.loader] : undefined
  }).catch(() => [] as StoreVersion[])

  let chosen = pickRecommended(filtered, instance.minecraftVersion, instance.loader, request.kind)

  // Provider-side filters are advisory; re-check against the full list before
  // concluding that nothing fits.
  if (!chosen) {
    const all = await versions(request.provider, request.projectId).catch(() => [] as StoreVersion[])
    chosen = pickRecommended(all, instance.minecraftVersion, instance.loader, request.kind)
  }

  const detail = await project(request.provider, request.projectId).catch(() => null)
  return { instance, version: chosen, projectName: detail?.name ?? chosen?.name ?? 'That project' }
}

export async function recommendedVersion(request: QuickInstallRequest): Promise<StoreVersion | null> {
  return (await resolveRecommended(request)).version
}

export async function install(request: InstallVersionRequest): Promise<void> {
  const instance = await instances.require(request.instanceId)
  const version = await getVersion(request.provider, request.projectId, request.versionId)
  const detail = await project(request.provider, request.projectId).catch(() => null)
  const name = detail?.name ?? version.name

  await tasks.run(
    { title: `Installing ${name}`, kind: 'download', instanceId: request.instanceId },
    async (task) => {
      const dependencies = request.withDependencies ? await resolveDependencies(instance, version) : []
      const total = dependencies.length + 1
      let done = 0

      await installSingleVersion(instance, request.kind, version, name, task.slice(0, 1 / total))
      done += 1

      for (const dependency of dependencies) {
        task.setDetail(`Installing dependency: ${dependency.name}`)
        await installSingleVersion(
          instance,
          request.kind,
          dependency.version,
          dependency.name,
          task.slice(done / total, (done + 1) / total)
        )
        done += 1
      }

      task.setDetail(
        dependencies.length
          ? `${name} and ${dependencies.length} ${dependencies.length === 1 ? 'dependency' : 'dependencies'} installed`
          : `${name} installed`
      )
    }
  )
}





interface ModrinthIndex {
  formatVersion: number
  name: string
  versionId: string
  summary?: string
  dependencies: Record<string, string>
  files: {
    path: string
    hashes: { sha1?: string; sha512?: string }
    env?: { client?: string; server?: string }
    downloads: string[]
    fileSize?: number
  }[]
}

interface CurseForgeManifest {
  minecraft: { version: string; modLoaders: { id: string; primary: boolean }[] }
  name: string
  version: string
  author: string
  files: { projectID: number; fileID: number; required: boolean }[]
  overrides?: string
}

function loaderFromModrinthDependencies(dependencies: Record<string, string>): {
  loader: LoaderType
  loaderVersion: string | null
} {
  if (dependencies['fabric-loader']) return { loader: 'fabric', loaderVersion: dependencies['fabric-loader'] }
  if (dependencies['quilt-loader']) return { loader: 'quilt', loaderVersion: dependencies['quilt-loader'] }
  if (dependencies['neoforge']) return { loader: 'neoforge', loaderVersion: dependencies['neoforge'] }
  if (dependencies['forge']) return { loader: 'forge', loaderVersion: dependencies['forge'] }
  return { loader: 'vanilla', loaderVersion: null }
}

function loaderFromCurseForgeId(id: string): { loader: LoaderType; loaderVersion: string | null } {
  const [name, ...rest] = id.split('-')
  const version = rest.join('-') || null
  switch (name.toLowerCase()) {
    case 'fabric':
      return { loader: 'fabric', loaderVersion: version }
    case 'quilt':
      return { loader: 'quilt', loaderVersion: version }
    case 'neoforge':
      return { loader: 'neoforge', loaderVersion: version }
    case 'forge':
      return { loader: 'forge', loaderVersion: version }
    default:
      return { loader: 'vanilla', loaderVersion: null }
  }
}


export async function installModpack(
  provider: ContentProvider,
  projectId: string,
  versionId: string,
  instanceName?: string
): Promise<Instance> {
  const version = await getVersion(provider, projectId, versionId)
  const detail = await project(provider, projectId).catch(() => null)
  const packName = instanceName?.trim() || detail?.name || version.name

  return tasks.run({ title: `Installing ${packName}`, kind: 'install' }, async (task) => {
    const file = version.files.find((entry) => entry.primary) ?? version.files[0]
    if (!file) throw new Error('That modpack version has no downloadable file.')

    const archive = join(paths.downloadsCacheDir, file.fileName)

    task.setDetail('Downloading the modpackâ€¦')
    await downloadFile(
      { url: file.url, target: archive, sha1: file.sha1, sha512: file.sha512, size: file.sizeBytes || null },
      { task: task.slice(0, 0.2) }
    )

    const instance = await createInstanceFromArchive(archive, packName, task.slice(0.2, 1), {
      provider,
      projectId,
      projectName: detail?.name ?? packName,
      versionId,
      versionName: version.versionNumber
    })

    notifications.push({
      title: `${packName} is ready`,
      body: 'The modpack was installed and a new instance was created.',
      level: 'success',
      action: { label: 'Open', route: `/instances/${instance.id}` }
    })

    return instance
  })
}

interface ModpackOriginInput {
  provider: ContentProvider
  projectId: string
  projectName: string
  versionId: string
  versionName: string
}

interface ModpackArchiveInfo {
  name: string
  minecraftVersion: string
  loader: LoaderType
  loaderVersion: string | null
  modrinthIndex: ModrinthIndex | null
  curseManifest: CurseForgeManifest | null
}

async function inspectModpackArchive(archivePath: string, fallbackName: string): Promise<ModpackArchiveInfo> {
  const modrinthIndex = await readZipJson<ModrinthIndex>(archivePath, 'modrinth.index.json')
  const curseManifest = modrinthIndex
    ? null
    : await readZipJson<CurseForgeManifest>(archivePath, 'manifest.json')

  if (!modrinthIndex && !curseManifest) {
    throw new Error('That file is not a Modrinth (.mrpack) or CurseForge modpack archive.')
  }

  const loaderInfo = modrinthIndex
    ? loaderFromModrinthDependencies(modrinthIndex.dependencies)
    : loaderFromCurseForgeId(
        curseManifest!.minecraft.modLoaders.find((entry) => entry.primary)?.id ??
          curseManifest!.minecraft.modLoaders[0]?.id ??
          ''
      )

  return {
    name: modrinthIndex?.name ?? curseManifest?.name ?? fallbackName,
    minecraftVersion: modrinthIndex ? modrinthIndex.dependencies.minecraft : curseManifest!.minecraft.version,
    loader: loaderInfo.loader,
    loaderVersion: loaderInfo.loaderVersion,
    modrinthIndex,
    curseManifest
  }
}


export async function createInstanceFromArchive(
  archivePath: string,
  fallbackName: string,
  task: TaskHandle,
  origin?: ModpackOriginInput
): Promise<Instance> {
  const info = await inspectModpackArchive(archivePath, fallbackName)

  task.setDetail('Creating the instanceâ€¦')
  const instance = await instances.scaffold({
    name: info.name,
    minecraftVersion: info.minecraftVersion,
    loader: info.loader,
    loaderVersion: info.loaderVersion
  })

  if (origin) {
    instance.modpack = {
      provider: origin.provider,
      projectId: origin.projectId,
      projectName: origin.projectName,
      versionId: origin.versionId,
      versionName: origin.versionName,
      updateAvailable: null
    }
  }

  await applyModpackArchive(archivePath, instance, info, task)
  await instances.register(instance)
  log.info('store', `Installed modpack "${info.name}" (${info.minecraftVersion} / ${info.loader})`)
  return instance
}


async function applyModpackArchive(
  archivePath: string,
  instance: Instance,
  info: ModpackArchiveInfo,
  task: TaskHandle
): Promise<void> {
  const { modrinthIndex, curseManifest } = info
  const gameDir = instances.gameDir(instance)


  if (modrinthIndex) {
    const wanted = modrinthIndex.files.filter((entry) => entry.env?.client !== 'unsupported')
    task.setDetail(`Downloading ${wanted.length} filesâ€¦`)
    await downloadAll(
      wanted.map((entry) => ({
        url: entry.downloads[0],
        mirrors: entry.downloads.slice(1),
        target: join(gameDir, ...entry.path.split('/')),
        sha1: entry.hashes.sha1 ?? null,
        sha512: entry.hashes.sha512 ?? null,
        size: entry.fileSize ?? null
      })),
      { task: task.slice(0, 0.7), signal: task.signal }
    )
  } else {
    const manifest = curseManifest!
    if (!curseforge.isConfigured()) {
      throw new Error(
        'CurseForge modpacks need a free CurseForge API key. Add one in Settings â†’ Integrations and try again.'
      )
    }

    task.setDetail(`Resolving ${manifest.files.length} modsâ€¦`)
    const files = await curseforge.filesByIds(manifest.files.map((entry) => entry.fileID))
    const projects = await curseforge
      .modsByIds(manifest.files.map((entry) => entry.projectID))
      .catch(() => new Map())

    const specs: { url: string; target: string; sha1: string | null; size: number | null; name: string; projectId: string; versionId: string }[] = []
    const missing: string[] = []

    for (const entry of manifest.files) {
      const resolved = files.get(String(entry.fileID))
      const file = resolved?.files[0]
      if (!resolved || !file) {
        if (entry.required) missing.push(String(entry.projectID))
        continue
      }
      specs.push({
        url: file.url,
        target: join(gameDir, 'mods', file.fileName),
        sha1: file.sha1,
        size: file.sizeBytes || null,
        name: projects.get(String(entry.projectID))?.name ?? file.fileName,
        projectId: String(entry.projectID),
        versionId: String(entry.fileID)
      })
    }

    task.setDetail(`Downloading ${specs.length} modsâ€¦`)
    await downloadAll(specs, { task: task.slice(0, 0.7), signal: task.signal })

    for (const spec of specs) {
      await recordInstall(instance, spec.target.split(/[\\/]/).pop()!, {
        provider: 'curseforge',
        projectId: spec.projectId,
        versionId: spec.versionId,
        projectName: spec.name
      })
    }

    if (missing.length) {
      log.warn('store', `${missing.length} modpack files could not be downloaded automatically`)
      notifications.push({
        title: `${missing.length} files need a manual download`,
        body: 'Some authors block third-party downloads. Open the pack page on CurseForge to fetch them.',
        level: 'warning'
      })
    }
  }


  task.setDetail('Applying pack configurationâ€¦')
  const overridesFolder = curseManifest?.overrides ?? 'overrides'
  await extractZip(archivePath, gameDir, {
    stripPrefix: `${overridesFolder}/`,
    onProgress: (done, total) => task.setProgress(0.7 + (total ? done / total : 0) * 0.25)
  }).catch(() => 0)
  await extractZip(archivePath, gameDir, { stripPrefix: 'client-overrides/' }).catch(() => 0)

  task.setProgress(1)
}


export async function updateModpack(instanceId: string, versionId: string): Promise<void> {
  const instance = await instances.require(instanceId)
  if (!instance.modpack) throw new Error('This instance was not created from a modpack.')

  const origin = instance.modpack
  const version = await getVersion(origin.provider, origin.projectId, versionId)

  await tasks.run(
    { title: `Updating ${origin.projectName}`, kind: 'update', instanceId },
    async (task) => {
      const file = version.files.find((entry) => entry.primary) ?? version.files[0]
      if (!file) throw new Error('That modpack version has no downloadable file.')
      const archive = join(paths.downloadsCacheDir, file.fileName)

      task.setDetail('Downloading the updateâ€¦')
      await downloadFile(
        { url: file.url, target: archive, sha1: file.sha1, sha512: file.sha512, size: file.sizeBytes || null },
        { task: task.slice(0, 0.25) }
      )

      const info = await inspectModpackArchive(archive, origin.projectName)


      task.setDetail('Replacing modsâ€¦')
      await removePath(join(instances.gameDir(instance), 'mods'))

      await applyModpackArchive(archive, instance, info, task.slice(0.25, 1))

      await instances.update(instanceId, {
        minecraftVersion: info.minecraftVersion,
        loader: info.loader,
        loaderVersion: info.loaderVersion,
        installed: false,
        resolvedVersionId: null,
        modpack: {
          ...origin,
          versionId,
          versionName: version.versionNumber,
          updateAvailable: null
        }
      })
    }
  )
}

export { curseforge, modrinth }
