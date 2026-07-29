import type { LoaderType, LoaderVersion } from '../../../shared/types'
import { cached, getJson } from '../../core/net'
import { log } from '../../core/logger'
import { saveVersionJson } from '../minecraft/versions'
import type { VersionJson } from '../minecraft/schema'
import type { TaskHandle } from '../tasks'


interface FabricMetaBase {
  name: string
  baseUrl: string

  loaderKey: 'fabric' | 'quilt'
}

const META: Record<'fabric' | 'quilt', FabricMetaBase> = {
  fabric: { name: 'Fabric', baseUrl: 'https://meta.fabricmc.net/v2', loaderKey: 'fabric' },
  quilt: { name: 'Quilt', baseUrl: 'https://meta.quiltmc.org/v3', loaderKey: 'quilt' }
}

interface MetaGameVersion {
  version: string
  stable: boolean
}

interface MetaLoaderEntry {
  loader: { version: string; build?: number; stable?: boolean; maven?: string }
  intermediary?: { version: string; maven?: string }
}

const TTL = 10 * 60 * 1000

function isStable(kind: 'fabric' | 'quilt', entry: MetaLoaderEntry): boolean {
  if (typeof entry.loader.stable === 'boolean') return entry.loader.stable

  return kind === 'quilt' ? !/-(beta|alpha|rc|pre)/i.test(entry.loader.version) : true
}

export async function listSupportedMinecraft(kind: 'fabric' | 'quilt'): Promise<string[]> {
  const meta = META[kind]
  const versions = await cached(`${kind}-game-versions`, TTL, () =>
    getJson<MetaGameVersion[]>(`${meta.baseUrl}/versions/game`, { timeoutMs: 20_000 })
  )
  return versions.map((v) => v.version)
}

export async function listLoaderVersions(
  kind: 'fabric' | 'quilt',
  minecraftVersion: string
): Promise<LoaderVersion[]> {
  const meta = META[kind]
  const entries = await cached(`${kind}-loader-${minecraftVersion}`, TTL, () =>
    getJson<MetaLoaderEntry[]>(`${meta.baseUrl}/versions/loader/${encodeURIComponent(minecraftVersion)}`, {
      timeoutMs: 20_000
    })
  )

  let markedLatest = false
  return entries.map((entry) => {
    const stable = isStable(kind, entry)
    const latest = stable && !markedLatest
    if (latest) markedLatest = true
    return {
      id: entry.loader.version,
      stable,
      recommended: latest,
      latest
    }
  })
}

export async function latestLoaderVersion(
  kind: 'fabric' | 'quilt',
  minecraftVersion: string
): Promise<string> {
  const versions = await listLoaderVersions(kind, minecraftVersion)
  const stable = versions.find((v) => v.stable)
  const chosen = stable ?? versions[0]
  if (!chosen) throw new Error(`${META[kind].name} does not support Minecraft ${minecraftVersion} yet.`)
  return chosen.id
}






export async function installFabricLike(
  kind: 'fabric' | 'quilt',
  minecraftVersion: string,
  loaderVersion: string,
  task?: TaskHandle
): Promise<string> {
  const meta = META[kind]
  task?.setDetail(`Fetching the ${meta.name} profile…`)

  const url = `${meta.baseUrl}/versions/loader/${encodeURIComponent(minecraftVersion)}/${encodeURIComponent(
    loaderVersion
  )}/profile/json`

  const profile = await getJson<VersionJson>(url, { timeoutMs: 25_000 })
  if (!profile?.id) throw new Error(`${meta.name} returned an unusable profile for ${minecraftVersion}.`)

  profile.orbitLoader = kind
  if (!profile.inheritsFrom) profile.inheritsFrom = minecraftVersion

  await saveVersionJson(profile)
  log.info('loaders', `Installed ${meta.name} ${loaderVersion} profile as ${profile.id}`)
  return profile.id
}

export function loaderKindOf(loader: LoaderType): 'fabric' | 'quilt' | null {
  return loader === 'fabric' || loader === 'quilt' ? loader : null
}
