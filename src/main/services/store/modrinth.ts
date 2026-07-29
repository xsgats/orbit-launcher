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
import { cached, getJson, postJson } from '../../core/net'

const BASE = 'https://api.modrinth.com/v2'
const TTL_SHORT = 5 * 60 * 1000
const TTL_LONG = 60 * 60 * 1000

const KIND_TO_PROJECT_TYPE: Record<ContentKind, string> = {
  mod: 'mod',
  resourcepack: 'resourcepack',
  shader: 'shader',
  datapack: 'datapack',
  modpack: 'modpack',
  world: 'mod'
}

const PROJECT_TYPE_TO_KIND: Record<string, ContentKind> = {
  mod: 'mod',
  resourcepack: 'resourcepack',
  shader: 'shader',
  datapack: 'datapack',
  modpack: 'modpack'
}

const SORT_INDEX: Record<StoreSearchQuery['sort'], string> = {
  relevance: 'relevance',
  downloads: 'downloads',
  follows: 'follows',
  newest: 'newest',
  updated: 'updated',
  name: 'relevance'
}

const KNOWN_LOADERS: LoaderType[] = ['fabric', 'forge', 'neoforge', 'quilt']

function toLoaders(values: string[] | undefined): LoaderType[] {
  if (!values) return []
  return values.filter((value): value is LoaderType => KNOWN_LOADERS.includes(value as LoaderType))
}

function toSide(value: string | undefined): StoreProject['clientSide'] {
  if (value === 'required' || value === 'optional' || value === 'unsupported') return value
  return 'unknown'
}

/* ------------------------------------------------------------------ */
/* Wire shapes                                                         */
/* ------------------------------------------------------------------ */

interface ModrinthHit {
  project_id: string
  slug: string
  title: string
  description: string
  categories?: string[]
  display_categories?: string[]
  client_side?: string
  server_side?: string
  project_type: string
  downloads: number
  follows: number
  icon_url?: string | null
  versions?: string[]
  latest_version?: string
  author: string
  date_created: string
  date_modified: string
  license?: string
  gallery?: string[]
}

interface ModrinthProject {
  id: string
  slug: string
  title: string
  description: string
  body: string
  categories?: string[]
  additional_categories?: string[]
  client_side?: string
  server_side?: string
  project_type: string
  downloads: number
  followers: number
  icon_url?: string | null
  issues_url?: string | null
  source_url?: string | null
  wiki_url?: string | null
  discord_url?: string | null
  donation_urls?: { platform: string; url: string }[]
  gallery?: { url: string; featured: boolean; title: string | null; description: string | null }[]
  license?: { id: string; name: string } | null
  versions: string[]
  game_versions?: string[]
  loaders?: string[]
  published: string
  updated: string
  team: string
}

interface ModrinthVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  changelog: string | null
  dependencies: {
    version_id: string | null
    project_id: string | null
    file_name: string | null
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
  }[]
  game_versions: string[]
  version_type: StoreVersionChannel
  loaders: string[]
  downloads: number
  date_published: string
  files: {
    hashes: { sha1?: string; sha512?: string }
    url: string
    filename: string
    primary: boolean
    size: number
  }[]
}

interface ModrinthMember {
  role: string
  user: { username: string; name?: string | null; avatar_url?: string | null }
}

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

function mapHit(hit: ModrinthHit): StoreProject {
  const loaders = toLoaders(hit.categories)
  return {
    provider: 'modrinth',
    id: hit.project_id,
    slug: hit.slug,
    name: hit.title,
    summary: hit.description,
    author: hit.author,
    iconUrl: hit.icon_url ?? null,
    downloads: hit.downloads,
    follows: hit.follows,
    categories: hit.categories ?? [],
    displayCategories: (hit.display_categories ?? hit.categories ?? []).filter(
      (category) => !KNOWN_LOADERS.includes(category as LoaderType)
    ),
    loaders,
    gameVersions: hit.versions ?? [],
    latestGameVersion: hit.latest_version ?? hit.versions?.[hit.versions.length - 1] ?? null,
    clientSide: toSide(hit.client_side),
    serverSide: toSide(hit.server_side),
    updatedAt: hit.date_modified,
    createdAt: hit.date_created,
    license: hit.license ?? null,
    kind: PROJECT_TYPE_TO_KIND[hit.project_type] ?? 'mod'
  }
}

function mapVersion(version: ModrinthVersion): StoreVersion {
  return {
    provider: 'modrinth',
    id: version.id,
    projectId: version.project_id,
    name: version.name,
    versionNumber: version.version_number,
    channel: version.version_type,
    datePublished: version.date_published,
    downloads: version.downloads,
    changelog: version.changelog,
    gameVersions: version.game_versions,
    loaders: toLoaders(version.loaders),
    files: version.files.map((file) => ({
      url: file.url,
      fileName: file.filename,
      sizeBytes: file.size,
      sha1: file.hashes.sha1 ?? null,
      sha512: file.hashes.sha512 ?? null,
      primary: file.primary
    })),
    dependencies: version.dependencies.map(
      (dependency): StoreDependency => ({
        provider: 'modrinth',
        projectId: dependency.project_id,
        versionId: dependency.version_id,
        fileName: dependency.file_name,
        type: dependency.dependency_type
      })
    )
  }
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export async function search(query: StoreSearchQuery): Promise<StoreSearchResult> {
  const facets: string[][] = [[`project_type:${KIND_TO_PROJECT_TYPE[query.kind]}`]]

  if (query.gameVersions.length) facets.push(query.gameVersions.map((v) => `versions:${v}`))
  // Resource packs and shaders are not loader-specific.
  if (query.loaders.length && (query.kind === 'mod' || query.kind === 'modpack')) {
    facets.push(query.loaders.map((loader) => `categories:${loader}`))
  }
  for (const category of query.categories) facets.push([`categories:${category}`])

  const url = new URL(`${BASE}/search`)
  if (query.query.trim()) url.searchParams.set('query', query.query.trim())
  url.searchParams.set('facets', JSON.stringify(facets))
  url.searchParams.set('index', SORT_INDEX[query.sort])
  url.searchParams.set('offset', String(query.offset))
  url.searchParams.set('limit', String(query.limit))

  const response = await getJson<{ hits: ModrinthHit[]; offset: number; limit: number; total_hits: number }>(
    url.toString(),
    { timeoutMs: 20_000 }
  )

  return {
    hits: response.hits.map(mapHit),
    offset: response.offset,
    limit: response.limit,
    total: response.total_hits,
    errors: []
  }
}

export async function project(projectId: string): Promise<StoreProjectDetail> {
  const [detail, members] = await Promise.all([
    cached(`modrinth-project-${projectId}`, TTL_SHORT, () =>
      getJson<ModrinthProject>(`${BASE}/project/${encodeURIComponent(projectId)}`, { timeoutMs: 20_000 })
    ),
    cached(`modrinth-members-${projectId}`, TTL_LONG, () =>
      getJson<ModrinthMember[]>(`${BASE}/project/${encodeURIComponent(projectId)}/members`, {
        timeoutMs: 20_000
      })
    ).catch(() => [] as ModrinthMember[])
  ])

  const owner = members.find((member) => member.role.toLowerCase() === 'owner') ?? members[0]
  const categories = [...(detail.categories ?? []), ...(detail.additional_categories ?? [])]

  return {
    provider: 'modrinth',
    id: detail.id,
    slug: detail.slug,
    name: detail.title,
    summary: detail.description,
    description: detail.description,
    bodyHtml: detail.body,
    author: owner?.user.name || owner?.user.username || 'Unknown',
    iconUrl: detail.icon_url ?? null,
    downloads: detail.downloads,
    follows: detail.followers,
    categories,
    displayCategories: categories.filter((category) => !KNOWN_LOADERS.includes(category as LoaderType)),
    loaders: toLoaders(detail.loaders ?? categories),
    gameVersions: detail.game_versions ?? [],
    latestGameVersion: detail.game_versions?.[detail.game_versions.length - 1] ?? null,
    clientSide: toSide(detail.client_side),
    serverSide: toSide(detail.server_side),
    updatedAt: detail.updated,
    createdAt: detail.published,
    license: detail.license?.name ?? detail.license?.id ?? null,
    kind: PROJECT_TYPE_TO_KIND[detail.project_type] ?? 'mod',
    gallery: (detail.gallery ?? []).map((image) => ({
      url: image.url,
      title: image.title,
      description: image.description,
      featured: image.featured
    })),
    links: {
      website: null,
      issues: detail.issues_url ?? null,
      source: detail.source_url ?? null,
      wiki: detail.wiki_url ?? null,
      discord: detail.discord_url ?? null,
      donate: detail.donation_urls ?? []
    },
    members: members.map((member) => ({
      name: member.user.name || member.user.username,
      role: member.role,
      avatarUrl: member.user.avatar_url ?? null
    }))
  }
}

export async function versions(
  projectId: string,
  filter?: { gameVersions?: string[]; loaders?: LoaderType[] }
): Promise<StoreVersion[]> {
  const url = new URL(`${BASE}/project/${encodeURIComponent(projectId)}/version`)
  if (filter?.gameVersions?.length) url.searchParams.set('game_versions', JSON.stringify(filter.gameVersions))
  if (filter?.loaders?.length) url.searchParams.set('loaders', JSON.stringify(filter.loaders))

  const result = await getJson<ModrinthVersion[]>(url.toString(), { timeoutMs: 20_000 })
  return result.map(mapVersion)
}

export async function version(versionId: string): Promise<StoreVersion> {
  const result = await getJson<ModrinthVersion>(`${BASE}/version/${encodeURIComponent(versionId)}`, {
    timeoutMs: 20_000
  })
  return mapVersion(result)
}

/** Identifies an installed file by its SHA-1 so Orbit can offer updates. */
export async function lookupByHashes(
  hashes: string[]
): Promise<Map<string, StoreVersion>> {
  const out = new Map<string, StoreVersion>()
  if (!hashes.length) return out

  // The bulk endpoint caps out well before typical modpack sizes.
  for (let i = 0; i < hashes.length; i += 200) {
    const batch = hashes.slice(i, i + 200)
    try {
      const result = await postJson<Record<string, ModrinthVersion>>(
        `${BASE}/version_files`,
        { hashes: batch, algorithm: 'sha1' },
        { timeoutMs: 25_000 }
      )
      for (const [hash, value] of Object.entries(result)) out.set(hash.toLowerCase(), mapVersion(value))
    } catch {
      /* an unmatched batch just means no update info for those files */
    }
  }

  return out
}

/** Asks Modrinth directly which newer file replaces each installed hash. */
export async function latestForHashes(
  hashes: string[],
  loaders: LoaderType[],
  gameVersions: string[]
): Promise<Map<string, StoreVersion>> {
  const out = new Map<string, StoreVersion>()
  if (!hashes.length) return out

  for (let i = 0; i < hashes.length; i += 200) {
    const batch = hashes.slice(i, i + 200)
    try {
      const result = await postJson<Record<string, ModrinthVersion>>(
        `${BASE}/version_files/update`,
        {
          hashes: batch,
          algorithm: 'sha1',
          loaders,
          game_versions: gameVersions
        },
        { timeoutMs: 25_000 }
      )
      for (const [hash, value] of Object.entries(result)) out.set(hash.toLowerCase(), mapVersion(value))
    } catch {
      /* leave those files without an update entry */
    }
  }

  return out
}

interface ModrinthCategory {
  icon: string
  name: string
  project_type: string
  header: string
}

export async function categories(kind: ContentKind): Promise<StoreCategory[]> {
  const all = await cached('modrinth-categories', TTL_LONG, () =>
    getJson<ModrinthCategory[]>(`${BASE}/tag/category`, { timeoutMs: 20_000 })
  )
  const projectType = KIND_TO_PROJECT_TYPE[kind]

  return all
    .filter((category) => category.project_type === projectType && category.header !== 'resolutions')
    .map((category) => ({
      id: category.name,
      name: category.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: category.icon,
      kind
    }))
}
