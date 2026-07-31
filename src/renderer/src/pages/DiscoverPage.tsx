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
  Plus,
  PlusCircle,
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
  CheckList,
  Checkbox,
  EmptyState,
  SearchInput,
  Segmented,
  Select,
  Skeleton,
  Tooltip
} from '../components/ui'
import { InstallDialog, type InstallTarget } from '../components/InstallDialog'
import { LOADER_NAME, formatCount, formatRelative } from '../lib/format'
import { navigate, setQueryParam, setQueryParams, useQueryList, useQueryParam } from '../lib/router'
import { api, reportError, toast, useOrbit } from '../state/store'

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

  const urlQuery = useQueryParam('q')
  const [query, setQuery] = useState(urlQuery)
  const [debounced, setDebounced] = useState(urlQuery)
  const sort = (useQueryParam('sort', 'relevance') || 'relevance') as StoreSort
  const curseforgeAvailable = Boolean(settings?.curseforgeApiKey?.trim())
  const [providers, setProviders] = useState<ContentProvider[]>(['modrinth'])
  const [destinationId, setDestinationId] = useState('')
  const [installTarget, setInstallTarget] = useState<InstallTarget | null>(null)
  const [installed, setInstalled] = useState<Set<string>>(new Set())

  const destination = instances.find((entry) => entry.id === destinationId) ?? null
  const [gameVersions, setGameVersions] = useQueryList('mc')
  const [loaderList, setLoaderList] = useQueryList('loader')
  const loaders = loaderList as LoaderType[]
  const setLoaders = setLoaderList as (next: LoaderType[]) => void
  const [categories, setCategories] = useQueryList('cat')
  const [categoryList, setCategoryList] = useState<StoreCategory[]>([])

  const [result, setResult] = useState<StoreSearchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const sentinel = useRef<HTMLDivElement>(null)


  useEffect(() => {
    if (!targetInstance) return
    // Only seed on arrival; once the URL carries filters the user owns them.
    if (gameVersions.length || loaders.length) return
    setQueryParams({
      mc: targetInstance.minecraftVersion,
      loader: targetInstance.loader === 'vanilla' ? null : targetInstance.loader
    })
  }, [targetInstance?.id])

  useEffect(() => {
    setDestinationId((current) => targetInstance?.id ?? current ?? '')
  }, [targetInstance?.id])

  /** Picking a destination narrows the results to what will actually load in it. */
  const chooseDestination = (id: string): void => {
    setDestinationId(id)
    const picked = instances.find((entry) => entry.id === id)
    if (!picked) {
      setQueryParams({ mc: null, loader: null })
      return
    }
    setQueryParams({
      mc: picked.minecraftVersion,
      loader: picked.loader === 'vanilla' ? null : picked.loader
    })
  }

  useEffect(() => {
    setProviders(curseforgeAvailable ? ['modrinth', 'curseforge'] : ['modrinth'])
  }, [curseforgeAvailable])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query)
      setQueryParams({ q: query || null })
    }, 260)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    void api.store
      .categories(kind)
      .then(setCategoryList)
      .catch(() => setCategoryList([]))
    setQueryParams({ cat: null })
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
          // Annotating against the chosen destination is what makes
          // "already installed" meaningful.
          instanceId: destinationId || instanceId || null
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
    [providers, kind, debounced, gameVersions, loaders, categories, sort, instanceId, destinationId]
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

  const versionOptions = useMemo(() => {
    const releases = versions.filter((version) => version.type === 'release')
    const snapshots = versions.filter((version) => version.type === 'snapshot').slice(0, 80)
    return [...releases, ...snapshots].map((version) => ({
      value: version.id,
      label: version.id,
      hint: version.type === 'snapshot' ? 'snapshot' : undefined
    }))
  }, [versions])

  const curseforgeError = result?.errors.find((error) => error.provider === 'curseforge')
  const loaderFilterApplies = kind === 'mod' || kind === 'modpack'

  const hideInstalled = useQueryParam('hide') === '1'
  const visibleHits = useMemo(() => {
    if (!result) return []
    if (!hideInstalled || !destinationId) return result.hits
    return result.hits.filter(
      (hit) => !hit.installedVersionId && !installed.has(`${hit.provider}:${hit.id}`)
    )
  }, [result, hideInstalled, destinationId, installed])
  const hiddenCount = (result?.hits.length ?? 0) - visibleHits.length

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
              : curseforgeAvailable
                ? 'Modrinth and CurseForge, side by side'
                : 'Mods, modpacks, resource packs and shaders from Modrinth'}
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
          onChange={(value) => setQueryParams({ sort: value === 'relevance' ? null : value })}
          options={SORTS}
          small
          className="shrink"
        />
      </div>

      {kind !== 'modpack' && instances.length > 0 && (
        <div className="row gap-3 surface" style={{ padding: '9px 14px', marginBottom: 'var(--s-4)' }}>
          <PlusCircle size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span className="t-small dim" style={{ flexShrink: 0 }}>
            Add to
          </span>
          <Select
            small
            value={destinationId}
            onChange={chooseDestination}
            options={[
              { value: '', label: 'Choose an instance…' },
              ...instances.map((entry) => ({
                value: entry.id,
                label: `${entry.name} — ${entry.minecraftVersion} ${LOADER_NAME[entry.loader]}`
              }))
            ]}
          />
          <span className="grow" />
          {destination && (
            <Checkbox
              checked={hideInstalled}
              onChange={(value) => setQueryParams({ hide: value ? '1' : null })}
              label={hiddenCount > 0 ? `Hide installed (${hiddenCount})` : 'Hide installed'}
            />
          )}
        </div>
      )}

      <div className="store-layout">
        <aside className="store-filters">
          {curseforgeAvailable && (
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
          )}

          {loaderFilterApplies && (
            <div>
              <div className="filter-group__title">Mod loader</div>
              <CheckList
                options={(['fabric', 'quilt', 'forge', 'neoforge'] as LoaderType[]).map((loader) => ({
                  value: loader,
                  label: LOADER_NAME[loader],
                  accent: `var(--loader-${loader})`
                }))}
                selected={loaders}
                onChange={(next) => setLoaders(next as LoaderType[])}
                maxHeight={150}
              />
            </div>
          )}

          <div>
            <div className="row between gap-2">
              <div className="filter-group__title">Minecraft version</div>
              {gameVersions.length > 0 && <span className="chip chip--accent">{gameVersions.length}</span>}
            </div>
            <CheckList
              options={versionOptions}
              selected={gameVersions}
              onChange={setGameVersions}
              searchable
              searchPlaceholder="Search versions…"
              maxHeight={196}
              emptyText="No versions match"
            />
          </div>

          {categoryList.length > 0 && (
            <div>
              <div className="row between gap-2">
                <div className="filter-group__title">Categories</div>
                {categories.length > 0 && <span className="chip chip--accent">{categories.length}</span>}
              </div>
              <CheckList
                options={categoryList.map((category) => ({
                  value: category.id,
                  label: category.name
                }))}
                selected={categories}
                onChange={setCategories}
                searchable={categoryList.length > 8}
                searchPlaceholder="Search categories…"
                maxHeight={240}
                emptyText="No categories match"
              />
            </div>
          )}

          {(gameVersions.length > 0 || loaders.length > 0 || categories.length > 0) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setQueryParams({ mc: null, loader: null, cat: null })}
            >
              Clear filters
            </Button>
          )}
        </aside>

        <div className="col gap-4">
          {curseforgeAvailable && curseforgeError && (
            <Callout tone="warning" icon={<KeyRound size={16} />}>
              <strong>CurseForge could not be reached.</strong> {curseforgeError.message} Modrinth results are still
              shown below.
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
          ) : !result || visibleHits.length === 0 ? (
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
                {visibleHits.map((project, index) => {
                  const key = `${project.provider}:${project.id}`
                  return (
                    <ProjectCard
                      key={`${project.provider}-${project.id}-${index}`}
                      project={project}
                      installed={installed.has(key) || Boolean(project.installedVersionId)}
                      onAdd={() =>
                        setInstallTarget({
                          provider: project.provider,
                          projectId: project.id,
                          projectName: project.name,
                          kind,
                          iconUrl: project.iconUrl
                        })
                      }
                    />
                  )
                })}
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

      <InstallDialog
        target={installTarget}
        open={Boolean(installTarget)}
        onClose={() => setInstallTarget(null)}
        defaultInstanceId={destinationId || undefined}
        onInstalled={() => {
          if (installTarget) {
            const key = `${installTarget.provider}:${installTarget.projectId}`
            setInstalled((current) => new Set(current).add(key))
          }
        }}
      />
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

function ProjectCard({
  project,
  installed,
  onAdd
}: {
  project: StoreProject
  installed: boolean
  onAdd: () => void
}): React.JSX.Element {
  return (
    <motion.article
      className="scard"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => navigate(`/discover/${project.provider}/${project.id}`)}
    >
      <Tooltip content={installed ? 'Installed — add another version' : 'Choose a version to add'}>
        <button
          className="scard__quick"
          data-state={installed ? 'done' : 'idle'}
          aria-label="Add to an instance"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onAdd()
          }}
        >
          {installed ? <Check size={16} /> : <Plus size={17} strokeWidth={2.6} />}
        </button>
      </Tooltip>

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
