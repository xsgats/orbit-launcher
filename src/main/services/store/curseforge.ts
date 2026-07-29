import type {
  ContentKind,
  LoaderType,
  StoreCategory,
  StoreDependency,
  StoreProject,
  StoreProjectDetail,
  StoreSearchQuery,
  StoreSearchResult,
  StoreVersion,
  StoreVersionChannel
} from '../../../shared/types'
import { cached, getJson } from '../../core/net'
import { settings } from '../../core/settings'

const BASE = 'https://api.curseforge.com/v1'
const MINECRAFT_GAME_ID = 432
const TTL_SHORT = 5 * 60 * 1000
const TTL_LONG = 60 * 60 * 1000


const CLASS_IDS: Record<ContentKind, number> = {
  mod: 6,
  resourcepack: 12,
  shader: 6552,
  datapack: 6945,
  modpack: 4471,
  world: 17
}


const LOADER_IDS: Partial<Record<LoaderType, number>> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6
}

const LOADER_NAMES: Record<string, LoaderType> = {
  forge: 'forge',
  fabric: 'fabric',
  quilt: 'quilt',
  neoforge: 'neoforge'
}

const SORT_FIELDS: Record<StoreSearchQuery['sort'], number> = {
  relevance: 2,
  downloads: 6,
  follows: 2,
  newest: 11,
  updated: 3,
  name: 4
}

export class CurseForgeUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CurseForgeUnavailable'
  }
}

function apiKey(): string {
  const key = settings.get().curseforgeApiKey.trim()
  if (!key) {
    throw new CurseForgeUnavailable(
      'CurseForge needs a free API key. Add one in Settings → Integrations to browse CurseForge content.'
    )
  }
  return key
}

function headers(): Record<string, string> {
  return { 'x-api-key': apiKey(), Accept: 'application/json' }
}

export function isConfigured(): boolean {
  return settings.get().curseforgeApiKey.trim().length > 0
}





interface CfAuthor {
  id: number
  name: string
  url: string
}

interface CfAsset {
  id: number
  title?: string
  description?: string
  thumbnailUrl?: string
  url: string
}

interface CfCategory {
  id: number
  name: string
  slug: string
  iconUrl?: string
  classId?: number
  isClass?: boolean
}

interface CfMod {
  id: number
  gameId: number
  name: string
  slug: string
  summary: string
  status: number
  downloadCount: number
  thumbsUpCount?: number
  classId?: number
  authors: CfAuthor[]
  logo?: CfAsset | null
  screenshots?: CfAsset[]
  latestFiles?: CfFile[]
  latestFilesIndexes?: { gameVersion: string; fileId: number; modLoader?: number }[]
  dateCreated: string
  dateModified: string
  dateReleased: string
  categories: CfCategory[]
  links?: { websiteUrl?: string; wikiUrl?: string; issuesUrl?: string; sourceUrl?: string }
  allowModDistribution?: boolean | null
}

interface CfFile {
  id: number
  modId: number
  displayName: string
  fileName: string
  releaseType: number
  fileDate: string
  fileLength: number
  downloadCount: number
  downloadUrl: string | null
  gameVersions: string[]
  hashes: { value: string; algo: number }[]
  dependencies: { modId: number; relationType: number; fileId?: number }[]
  sortableGameVersions?: { gameVersion: string; gameVersionName: string }[]
  changelog?: string
}

interface Envelope<T> {
  data: T
  pagination?: { index: number; pageSize: number; resultCount: number; totalCount: number }
}





const RELEASE_TYPES: Record<number, StoreVersionChannel> = { 1: 'release', 2: 'beta', 3: 'alpha' }


const RELATION_TYPES: Record<number, StoreDependency['type']> = {
  1: 'embedded',
  2: 'optional',
  3: 'required',
  5: 'incompatible',
  6: 'embedded'
}

function loadersFromGameVersions(gameVersions: string[]): LoaderType[] {
  const found = new Set<LoaderType>()
  for (const value of gameVersions) {
    const loader = LOADER_NAMES[value.toLowerCase()]
    if (loader) found.add(loader)
  }
  return [...found]
}

function minecraftVersions(gameVersions: string[]): string[] {
  return gameVersions.filter((value) => /^\d+\.\d+(\.\d+)?/.test(value))
}

function hashOf(file: CfFile, algo: 1 | 2): string | null {

  return file.hashes?.find((hash) => hash.algo === algo)?.value?.toLowerCase() ?? null
}


function downloadUrlFor(file: CfFile): string {
  if (file.downloadUrl) return file.downloadUrl
  const id = String(file.id)
  const head = id.slice(0, id.length - 3) || '0'
  const tail = String(Number(id.slice(-3)))
  return `https://mediafilez.forgecdn.net/files/${head}/${tail}/${encodeURIComponent(file.fileName)}`
}

function kindFromClassId(classId: number | undefined): ContentKind {
  for (const [kind, id] of Object.entries(CLASS_IDS)) {
    if (id === classId) return kind as ContentKind
  }
  return 'mod'
}

function mapMod(mod: CfMod): StoreProject {
  const gameVersions = [
    ...new Set((mod.latestFilesIndexes ?? []).map((index) => index.gameVersion).filter(Boolean))
  ]
  const loaders = [
    ...new Set(
      (mod.latestFiles ?? []).flatMap((file) => loadersFromGameVersions(file.gameVersions))
    )
  ]

  return {
    provider: 'curseforge',
    id: String(mod.id),
    slug: mod.slug,
    name: mod.name,
    summary: mod.summary,
    author: mod.authors?.[0]?.name ?? 'Unknown',
    iconUrl: mod.logo?.thumbnailUrl ?? mod.logo?.url ?? null,
    downloads: mod.downloadCount,
    follows: mod.thumbsUpCount ?? 0,
    categories: mod.categories?.map((category) => category.slug) ?? [],
    displayCategories: mod.categories?.filter((c) => !c.isClass).map((category) => category.name) ?? [],
    loaders,
    gameVersions,
    latestGameVersion: gameVersions[0] ?? null,
    clientSide: 'unknown',
    serverSide: 'unknown',
    updatedAt: mod.dateModified,
    createdAt: mod.dateCreated,
    license: null,
    kind: kindFromClassId(mod.classId)
  }
}

function mapFile(file: CfFile): StoreVersion {
  return {
    provider: 'curseforge',
    id: String(file.id),
    projectId: String(file.modId),
    name: file.displayName,
    versionNumber: file.displayName,
    channel: RELEASE_TYPES[file.releaseType] ?? 'release',
    datePublished: file.fileDate,
    downloads: file.downloadCount,
    changelog: file.changelog ?? null,
    gameVersions: minecraftVersions(file.gameVersions),
    loaders: loadersFromGameVersions(file.gameVersions),
    files: [
      {
        url: downloadUrlFor(file),
        fileName: file.fileName,
        sizeBytes: file.fileLength,
        sha1: hashOf(file, 1),
        sha512: null,
        primary: true
      }
    ],
    dependencies: (file.dependencies ?? [])
      .filter((dependency) => RELATION_TYPES[dependency.relationType])
      .map((dependency) => ({
        provider: 'curseforge' as const,
        projectId: String(dependency.modId),
        versionId: dependency.fileId ? String(dependency.fileId) : null,
        fileName: null,
        type: RELATION_TYPES[dependency.relationType]
      }))
  }
}





export async function search(query: StoreSearchQuery): Promise<StoreSearchResult> {
  const url = new URL(`${BASE}/mods/search`)
  url.searchParams.set('gameId', String(MINECRAFT_GAME_ID))
  url.searchParams.set('classId', String(CLASS_IDS[query.kind]))
  url.searchParams.set('sortField', String(SORT_FIELDS[query.sort]))
  url.searchParams.set('sortOrder', 'desc')
  url.searchParams.set('index', String(Math.min(query.offset, 9_000)))
  url.searchParams.set('pageSize', String(Math.min(query.limit, 50)))

  if (query.query.trim()) url.searchParams.set('searchFilter', query.query.trim())
  if (query.gameVersions.length) url.searchParams.set('gameVersion', query.gameVersions[0])
  if (query.loaders.length && (query.kind === 'mod' || query.kind === 'modpack')) {
    const loaderId = LOADER_IDS[query.loaders[0]]
    if (loaderId) url.searchParams.set('modLoaderType', String(loaderId))
  }
  if (query.categories.length) url.searchParams.set('categoryIds', JSON.stringify(query.categories.map(Number)))

  const response = await getJson<Envelope<CfMod[]>>(url.toString(), {
    headers: headers(),
    timeoutMs: 20_000
  })

  return {
    hits: response.data.map(mapMod),
    offset: response.pagination?.index ?? query.offset,
    limit: response.pagination?.pageSize ?? query.limit,
    total: Math.min(response.pagination?.totalCount ?? response.data.length, 10_000),
    errors: []
  }
}

export async function project(projectId: string): Promise<StoreProjectDetail> {
  const [mod, description] = await Promise.all([
    cached(`cf-project-${projectId}`, TTL_SHORT, () =>
      getJson<Envelope<CfMod>>(`${BASE}/mods/${projectId}`, { headers: headers(), timeoutMs: 20_000 })
    ),
    cached(`cf-description-${projectId}`, TTL_SHORT, () =>
      getJson<Envelope<string>>(`${BASE}/mods/${projectId}/description`, {
        headers: headers(),
        timeoutMs: 20_000
      })
    ).catch(() => ({ data: '' }))
  ])

  const base = mapMod(mod.data)

  return {
    ...base,
    description: mod.data.summary,
    bodyHtml: description.data,
    gallery: (mod.data.screenshots ?? []).map((shot) => ({
      url: shot.url,
      title: shot.title ?? null,
      description: shot.description ?? null,
      featured: false
    })),
    links: {
      website: mod.data.links?.websiteUrl ?? null,
      issues: mod.data.links?.issuesUrl ?? null,
      source: mod.data.links?.sourceUrl ?? null,
      wiki: mod.data.links?.wikiUrl ?? null,
      discord: null,
      donate: []
    },
    members: (mod.data.authors ?? []).map((author) => ({
      name: author.name,
      role: 'Author',
      avatarUrl: null
    }))
  }
}

export async function versions(
  projectId: string,
  filter?: { gameVersions?: string[]; loaders?: LoaderType[] }
): Promise<StoreVersion[]> {
  const url = new URL(`${BASE}/mods/${projectId}/files`)
  url.searchParams.set('pageSize', '50')
  if (filter?.gameVersions?.length) url.searchParams.set('gameVersion', filter.gameVersions[0])
  if (filter?.loaders?.length) {
    const loaderId = LOADER_IDS[filter.loaders[0]]
    if (loaderId) url.searchParams.set('modLoaderType', String(loaderId))
  }

  const response = await getJson<Envelope<CfFile[]>>(url.toString(), {
    headers: headers(),
    timeoutMs: 20_000
  })

  return response.data
    .map(mapFile)
    .sort((a, b) => new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime())
}

export async function version(_projectId: string, fileId: string): Promise<StoreVersion> {
  const response = await getJson<Envelope<CfFile>>(`${BASE}/mods/${_projectId}/files/${fileId}`, {
    headers: headers(),
    timeoutMs: 20_000
  })
  return mapFile(response.data)
}


export async function filesByIds(fileIds: number[]): Promise<Map<string, StoreVersion>> {
  const out = new Map<string, StoreVersion>()
  for (let i = 0; i < fileIds.length; i += 200) {
    const batch = fileIds.slice(i, i + 200)
    const response = await getJson<Envelope<CfFile[]>>(`${BASE}/mods/files`, {
      method: 'POST',
      body: JSON.stringify({ fileIds: batch }),
      headers: { ...headers(), 'Content-Type': 'application/json' },
      timeoutMs: 30_000
    })
    for (const file of response.data) out.set(String(file.id), mapFile(file))
  }
  return out
}

export async function modsByIds(modIds: number[]): Promise<Map<string, StoreProject>> {
  const out = new Map<string, StoreProject>()
  for (let i = 0; i < modIds.length; i += 200) {
    const batch = modIds.slice(i, i + 200)
    const response = await getJson<Envelope<CfMod[]>>(`${BASE}/mods`, {
      method: 'POST',
      body: JSON.stringify({ modIds: batch }),
      headers: { ...headers(), 'Content-Type': 'application/json' },
      timeoutMs: 30_000
    })
    for (const mod of response.data) out.set(String(mod.id), mapMod(mod))
  }
  return out
}

export async function categories(kind: ContentKind): Promise<StoreCategory[]> {
  const response = await cached(`cf-categories-${kind}`, TTL_LONG, () =>
    getJson<Envelope<CfCategory[]>>(
      `${BASE}/categories?gameId=${MINECRAFT_GAME_ID}&classId=${CLASS_IDS[kind]}`,
      { headers: headers(), timeoutMs: 20_000 }
    )
  )

  return response.data
    .filter((category) => !category.isClass)
    .map((category) => ({
      id: String(category.id),
      name: category.name,
      icon: category.iconUrl ?? null,
      kind
    }))
}
