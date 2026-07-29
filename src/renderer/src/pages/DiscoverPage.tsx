import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDownUp,
  Boxes,
  Check,
  Compass,
  Download,
  Heart,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Package,
  RefreshCw,
  SearchX,
  Sun,
  TriangleAlert
} from 'lucide-react'
import type {
  ContentKind,
  ContentProvider,
  LoaderType,
  StoreCategory,
  StoreProject,
  StoreSearchResult,
  StoreSort
} from '@shared/types'
import {
  Button,
  Callout,
  Checkbox,
  Chip,
  EmptyState,
  SearchInput,
  Segmented,
  Select,
  Skeleton
} from '../components/ui'
import { LOADER_NAME, formatCount, formatRelative } from '../lib/format'
import { navigate, setQueryParam, useQueryParam } from '../lib/router'
import { api, useOrbit } from '../state/store'

const KINDS: { value: ContentKind; label: string; icon: React.JSX.Element }[] = [
  { value: 'mod', label: 'Mods', icon: <Layers size={14} /> },
  { value: 'modpack', label: 'Modpacks', icon: <Boxes size={14} /> },
  { value: 'resourcepack', label: 'Resource packs', icon: <ImageIcon size={14} /> },
  { value: 'shader', label: 'Shaders', icon: <Sun size={14} /> },
  { value: 'datapack', label: 'Datapacks', icon: <Package size={14} /> }
]

const SORTS: { value: StoreSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'follows', label: 'Most followed' },
  { value: 'updated', label: 'Recently updated' },
  { value: 'newest', label: 'Newest' }
]

const PAGE_SIZE = 24

export function DiscoverPage(): React.JSX.Element {
  const settings = useOrbit((state) => state.settings)
  const instances = useOrbit((state) => state.instances)
  const versions = useOrbit((state) => state.minecraftVersions)

  const kind = (useQueryParam('kind', 'mod') || 'mod') as ContentKind
  const instanceId = useQueryParam('instance')
  const targetInstance = instances.find((entry) => entry.id === instanceId) ?? null

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState<StoreSort>('relevance')
  const [providers, setProviders] = useState<ContentProvider[]>(['modrinth', 'curseforge'])
  const [gameVersions, setGameVersions] = useState<string[]>([])
  const [loaders, setLoaders] = useState<LoaderType[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [categoryList, setCategoryList] = useState<StoreCategory[]>([])

  const [result, setResult] = useState<StoreSearchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const sentinel = useRef<HTMLDivElement>(null)


  useEffect(() => {
    if (!targetInstance) return
    setGameVersions([targetInstance.minecraftVersion])
    setLoaders(targetInstance.loader === 'vanilla' ? [] : [targetInstance.loader])
  }, [targetInstance?.id])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 260)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    void api.store
      .categories(kind)
      .then(setCategoryList)
      .catch(() => setCategoryList([]))
    setCategories([])
  }, [kind])

  const runSearch = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (append) setLoadingMore(true)
      else setLoading(true)

      try {
        const response = await api.store.search({
          providers,
          kind,
          query: debounced,
          gameVersions,
          loaders,
          categories,
          sort,
          offset: nextOffset,
          limit: PAGE_SIZE,
          instanceId: instanceId || null
        })
        setResult((current) =>
          append && current ? { ...response, hits: [...current.hits, ...response.hits] } : response
        )
      } catch {
        if (!append) setResult({ hits: [], offset: 0, limit: PAGE_SIZE, total: 0, errors: [] })
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [providers, kind, debounced, gameVersions, loaders, categories, sort, instanceId]
  )

  useEffect(() => {
    setOffset(0)
    void runSearch(0, false)
  }, [runSearch])


  useEffect(() => {
    const node = sentinel.current
    if (!node || !result) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || loading || loadingMore) return
        if (result.hits.length >= result.total) return
        const next = offset + PAGE_SIZE
        setOffset(next)
        void runSearch(next, true)
      },
      { rootMargin: '400px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [result, offset, loading, loadingMore, runSearch])

  const releaseVersions = useMemo(
    () => versions.filter((version) => version.type === 'release').slice(0, 60),
    [versions]
  )

  const curseforgeError = result?.errors.find((error) => error.provider === 'curseforge')
  const loaderFilterApplies = kind === 'mod' || kind === 'modpack'

  const toggleProvider = (provider: ContentProvider): void =>
    setProviders((current) =>
      current.includes(provider)
        ? current.length > 1
          ? current.filter((entry) => entry !== provider)
          : current
        : [...current, provider]
    )

  return (
    <div className="page__inner page__inner--wide">
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Discover</h1>
          <p className="page-header__sub">
            {targetInstance
              ? `Installing into ${targetInstance.name} · ${targetInstance.minecraftVersion} ${LOADER_NAME[targetInstance.loader]}`
              : 'Modrinth and CurseForge, side by side'}
          </p>
        </div>
        {targetInstance && (
          <Button variant="ghost" onClick={() => setQueryParam('instance', null)}>
            Clear target instance
          </Button>
        )}
      </header>

      <div className="toolbar">
        <Segmented value={kind} onChange={(next) => setQueryParam('kind', next)} options={KINDS} />
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={`Search ${KINDS.find((entry) => entry.value === kind)?.label.toLowerCase() ?? 'mods'}…`}
          className="grow"
        />
        <Select
          value={sort}
          onChange={(value) => setSort(value as StoreSort)}
          options={SORTS}
          small
          className="shrink"
        />
      </div>

      <div className="store-layout">
        <aside className="store-filters">
          <div>
            <div className="filter-group__title">Sources</div>
            <div className="col gap-1">
              <ProviderToggle
                provider="modrinth"
                label="Modrinth"
                enabled={settings?.enableModrinth ?? true}
                checked={providers.includes('modrinth')}
                onToggle={() => toggleProvider('modrinth')}
              />
              <ProviderToggle
                provider="curseforge"
                label="CurseForge"
                enabled={settings?.enableCurseForge ?? true}
                checked={providers.includes('curseforge')}
                onToggle={() => toggleProvider('curseforge')}
              />
            </div>
          </div>

          {loaderFilterApplies && (
            <div>
              <div className="filter-group__title">Mod loader</div>
              <div className="row wrap gap-2">
                {(['fabric', 'quilt', 'forge', 'neoforge'] as LoaderType[]).map((loader) => (
                  <Chip
                    key={loader}
                    selected={loaders.includes(loader)}
                    onClick={() =>
                      setLoaders((current) =>
                        current.includes(loader) ? current.filter((entry) => entry !== loader) : [...current, loader]
                      )
                    }
                  >
                    {LOADER_NAME[loader]}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="filter-group__title">Minecraft version</div>
            <div className="row wrap gap-2" style={{ maxHeight: 168, overflowY: 'auto' }}>
              {releaseVersions.map((version) => (
                <Chip
                  key={version.id}
                  selected={gameVersions.includes(version.id)}
                  onClick={() =>
                    setGameVersions((current) =>
                      current.includes(version.id)
                        ? current.filter((entry) => entry !== version.id)
                        : [...current, version.id]
                    )
                  }
                >
                  {version.id}
                </Chip>
              ))}
            </div>
          </div>

          {categoryList.length > 0 && (
            <div>
              <div className="filter-group__title">Categories</div>
              <div className="row wrap gap-2" style={{ maxHeight: 240, overflowY: 'auto' }}>
                {categoryList.slice(0, 40).map((category) => (
                  <Chip
                    key={`${category.id}-${category.name}`}
                    selected={categories.includes(category.id)}
                    onClick={() =>
                      setCategories((current) =>
                        current.includes(category.id)
                          ? current.filter((entry) => entry !== category.id)
                          : [...current, category.id]
                      )
                    }
                  >
                    {category.name}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {(gameVersions.length > 0 || loaders.length > 0 || categories.length > 0) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setGameVersions([])
                setLoaders([])
                setCategories([])
              }}
            >
              Clear filters
            </Button>
          )}
        </aside>

        <div className="col gap-4">
          {curseforgeError && (
            <Callout tone="warning" icon={<KeyRound size={16} />}>
              <strong>CurseForge is not connected.</strong> {curseforgeError.message}
              <div style={{ marginTop: 10 }}>
                <Button size="sm" onClick={() => navigate('/settings/integrations')}>
                  Add an API key
                </Button>
              </div>
            </Callout>
          )}

          {loading ? (
            <div className="store-grid">
              {Array.from({ length: 9 }, (_, index) => (
                <div className="scard" key={index} style={{ pointerEvents: 'none' }}>
                  <div className="scard__top">
                    <Skeleton width={54} height={54} radius={13} />
                    <div className="col gap-2 grow">
                      <Skeleton height={13} width="60%" />
                      <Skeleton height={10} width="34%" />
                      <Skeleton height={10} width="92%" />
                      <Skeleton height={10} width="76%" />
                    </div>
                  </div>
                  <div className="scard__foot">
                    <Skeleton height={10} width="40%" />
                  </div>
                </div>
              ))}
            </div>
          ) : !result || result.hits.length === 0 ? (
            <EmptyState
              icon={debounced ? <SearchX size={26} /> : <Compass size={26} />}
              title={debounced ? 'No results' : 'Nothing to show'}
              description={
                debounced
                  ? `Nothing matched “${debounced}” with the current filters.`
                  : 'Loosen the filters or pick a different source.'
              }
            />
          ) : (
            <>
              <div className="row between">
                <span className="t-small dim">
                  {result.total > 0 ? `${formatCount(result.total)} results` : `${result.hits.length} results`}
                </span>
              </div>

              <div className="store-grid">
                {result.hits.map((project, index) => (
                  <ProjectCard key={`${project.provider}-${project.id}-${index}`} project={project} />
                ))}
              </div>

              <div ref={sentinel} style={{ height: 1 }} />

              {loadingMore && (
                <div className="row center gap-2 dimmer t-small" style={{ padding: 'var(--s-5)' }}>
                  <RefreshCw size={14} className="spin" /> Loading more…
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ProviderToggle({
  provider,
  label,
  enabled,
  checked,
  onToggle
}: {
  provider: ContentProvider
  label: string
  enabled: boolean
  checked: boolean
  onToggle: () => void
}): React.JSX.Element {
  if (!enabled) {
    return (
      <div className="row gap-2 dimmer t-small" style={{ padding: '6px 8px' }}>
        <TriangleAlert size={13} />
        {label} disabled in settings
      </div>
    )
  }
  return (
    <label className="checkbox-row">
      <Checkbox checked={checked} onChange={onToggle} />
      <span className="row gap-2">
        <span className="provider-mark" data-provider={provider}>
          {provider === 'modrinth' ? 'MR' : 'CF'}
        </span>
        {label}
      </span>
    </label>
  )
}

function ProjectCard({ project }: { project: StoreProject }): React.JSX.Element {
  return (
    <motion.article
      className="scard"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => navigate(`/discover/${project.provider}/${project.id}`)}
    >
      <div className="scard__top">
        <div className="scard__icon">
          {project.iconUrl ? (
            <img src={project.iconUrl} alt="" loading="lazy" width={54} height={54} />
          ) : (
            <Package size={20} />
          )}
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="scard__name">
            <span className="truncate">{project.name}</span>
            {project.installedVersionId && (
              <span className="chip chip--success" style={{ height: 18 }}>
                <Check size={10} /> Installed
              </span>
            )}
          </div>
          <div className="scard__author truncate">by {project.author}</div>
          <p className="scard__summary clamp-2">{project.summary}</p>
          {project.displayCategories.length > 0 && (
            <div className="row wrap gap-1" style={{ marginTop: 9 }}>
              {project.displayCategories.slice(0, 3).map((category) => (
                <span className="chip" key={category} style={{ height: 19, fontSize: 10.5 }}>
                  {category}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="scard__foot">
        <span className="provider-mark" data-provider={project.provider}>
          {project.provider === 'modrinth' ? 'Modrinth' : 'CurseForge'}
        </span>
        <span className="row gap-1 nums">
          <Download size={11} /> {formatCount(project.downloads)}
        </span>
        {project.follows > 0 && (
          <span className="row gap-1 nums">
            <Heart size={11} /> {formatCount(project.follows)}
          </span>
        )}
        <span className="grow" />
        <span className="truncate">{formatRelative(project.updatedAt)}</span>
      </div>
    </motion.article>
  )
}

export { ArrowDownUp }
