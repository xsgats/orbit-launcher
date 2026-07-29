import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDownUp,
  Boxes,
  Filter,
  FolderInput,
  LayoutGrid,
  List,
  Play,
  Plus,
  SearchX,
  Square,
  Star
} from 'lucide-react'
import type { InstanceSummary, LoaderType } from '@shared/types'
import { InstanceCard, InstanceIcon, isBusy, statusLabel, useInstanceImages } from '../components/InstanceCard'
import {
  Button,
  Chip,
  EmptyState,
  IconButton,
  SearchInput,
  Segmented,
  Tooltip,
  useAnchoredMenu,
  useContextMenu
} from '../components/ui'
import { LOADER_NAME, formatRelative, fuzzyMatch, pluralize } from '../lib/format'
import { useInstanceActions } from '../lib/instanceActions'
import { navigate, setQueryParam, useQueryParam } from '../lib/router'
import { api, reportError, toast, useOrbit } from '../state/store'
import { CreateInstanceDialog } from './CreateInstanceDialog'

type SortKey = 'recent' | 'name' | 'playtime' | 'created' | 'version'

const SORT_LABEL: Record<SortKey, string> = {
  recent: 'Last played',
  name: 'Name',
  playtime: 'Playtime',
  created: 'Recently added',
  version: 'Game version'
}

export function InstancesPage(): React.JSX.Element {
  const instances = useOrbit((state) => state.instances)
  const statuses = useOrbit((state) => state.statuses)
  const settings = useOrbit((state) => state.settings)
  const updateSettings = useOrbit((state) => state.updateSettings)
  const refreshInstances = useOrbit((state) => state.refreshInstances)
  const actions = useInstanceActions()
  const openMenu = useContextMenu()
  const anchorMenu = useAnchoredMenu()

  const [query, setQuery] = useState('')
  const [view, setView] = useState<'grid' | 'list'>(
    (localStorage.getItem('orbit.instanceView') as 'grid' | 'list') ?? 'grid'
  )
  const [sort, setSort] = useState<SortKey>('recent')
  const [loaderFilter, setLoaderFilter] = useState<LoaderType[]>([])
  const [favouritesOnly, setFavouritesOnly] = useState(false)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const groupParam = useQueryParam('group')

  const decorated = useMemo<InstanceSummary[]>(
    () => instances.map((instance) => ({ ...instance, status: statuses[instance.id] ?? 'idle' })),
    [instances, statuses]
  )

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const instance of instances) for (const tag of instance.tags) set.add(tag)
    return [...set].sort()
  }, [instances])

  const groups = useMemo(() => {
    const set = new Set<string>()
    for (const instance of instances) if (instance.group) set.add(instance.group)
    return [...set].sort()
  }, [instances])

  const filtered = useMemo(() => {
    let list = decorated

    if (query.trim()) {
      list = list.filter((instance) =>
        fuzzyMatch(`${instance.name} ${instance.minecraftVersion} ${instance.loader} ${instance.tags.join(' ')}`, query)
      )
    }
    if (loaderFilter.length) list = list.filter((instance) => loaderFilter.includes(instance.loader))
    if (favouritesOnly) list = list.filter((instance) => instance.favorite)
    if (tagFilter.length) list = list.filter((instance) => tagFilter.every((tag) => instance.tags.includes(tag)))
    if (groupParam) list = list.filter((instance) => instance.group === groupParam)

    const sorted = [...list]
    sorted.sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'playtime':
          return b.totalPlaytimeMs - a.totalPlaytimeMs
        case 'created':
          return b.createdAt - a.createdAt
        case 'version':
          return b.minecraftVersion.localeCompare(a.minecraftVersion, undefined, { numeric: true })
        default:
          return (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)
      }
    })
    return sorted
  }, [decorated, query, loaderFilter, favouritesOnly, tagFilter, groupParam, sort])

  const toggleLoader = (loader: LoaderType): void =>
    setLoaderFilter((current) =>
      current.includes(loader) ? current.filter((entry) => entry !== loader) : [...current, loader]
    )

  const importInstance = async (): Promise<void> => {
    try {
      const path = await api.app.pickFile(
        [
          { name: 'Instances & modpacks', extensions: ['orbitpack', 'mrpack', 'zip'] },
          { name: 'All files', extensions: ['*'] }
        ],
        'Import an instance or modpack'
      )
      if (!path) return
      const instance = await api.instances.import(path)
      await refreshInstances()
      toast('Import complete', instance.name)
      navigate(`/instances/${instance.id}`)
    } catch (err) {
      reportError('Import failed', err)
    }
  }

  const hasFilters = Boolean(query || loaderFilter.length || favouritesOnly || tagFilter.length || groupParam)

  return (
    <div className="page__inner page__inner--wide">
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Instances</h1>
          <p className="page-header__sub">
            {hasFilters
              ? `${filtered.length} of ${instances.length} shown`
              : pluralize(instances.length, 'instance')}
          </p>
        </div>
        <div className="row gap-2">
          <Button icon={<FolderInput size={15} />} onClick={() => void importInstance()}>
            Import
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
            New instance
          </Button>
        </div>
      </header>

      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search instances…" className="grow" />

        <Tooltip content="Favourites only">
          <button
            className="iconbtn iconbtn--lg"
            data-active={favouritesOnly || undefined}
            onClick={() => setFavouritesOnly((value) => !value)}
            aria-label="Favourites only"
            type="button"
          >
            <Star size={16} fill={favouritesOnly ? 'currentColor' : 'none'} />
          </button>
        </Tooltip>

        <IconButton
          large
          label="Filter"
          active={loaderFilter.length > 0 || tagFilter.length > 0 || Boolean(groupParam)}
          onClick={(event) =>
            anchorMenu(event.currentTarget, [
              { heading: 'Mod loader', label: 'h1' },
              ...(['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'] as LoaderType[]).map((loader) => ({
                label: `${loaderFilter.includes(loader) ? '✓  ' : '     '}${LOADER_NAME[loader]}`,
                onSelect: () => toggleLoader(loader)
              })),
              ...(groups.length
                ? [
                    { separator: true, label: 'sep-g' },
                    { heading: 'Group', label: 'h2' },
                    {
                      label: `${!groupParam ? '✓  ' : '     '}All groups`,
                      onSelect: () => setQueryParam('group', null)
                    },
                    ...groups.map((group) => ({
                      label: `${groupParam === group ? '✓  ' : '     '}${group}`,
                      onSelect: () => setQueryParam('group', group)
                    }))
                  ]
                : []),
              ...(allTags.length
                ? [
                    { separator: true, label: 'sep-t' },
                    { heading: 'Tags', label: 'h3' },
                    ...allTags.map((tag) => ({
                      label: `${tagFilter.includes(tag) ? '✓  ' : '     '}${tag}`,
                      onSelect: () =>
                        setTagFilter((current) =>
                          current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]
                        )
                    }))
                  ]
                : []),
              { separator: true, label: 'sep-c' },
              {
                label: 'Clear all filters',
                onSelect: () => {
                  setLoaderFilter([])
                  setTagFilter([])
                  setFavouritesOnly(false)
                  setQueryParam('group', null)
                }
              }
            ])
          }
        >
          <Filter size={16} />
        </IconButton>

        <IconButton
          large
          label={`Sort: ${SORT_LABEL[sort]}`}
          onClick={(event) =>
            anchorMenu(
              event.currentTarget,
              (Object.keys(SORT_LABEL) as SortKey[]).map((key) => ({
                label: `${sort === key ? '✓  ' : '     '}${SORT_LABEL[key]}`,
                onSelect: () => setSort(key)
              }))
            )
          }
        >
          <ArrowDownUp size={16} />
        </IconButton>

        <Segmented
          value={view}
          onChange={(next) => {
            setView(next)
            localStorage.setItem('orbit.instanceView', next)
          }}
          options={[
            { value: 'grid', label: '', icon: <LayoutGrid size={14} /> },
            { value: 'list', label: '', icon: <List size={14} /> }
          ]}
        />
      </div>

      {(loaderFilter.length > 0 || tagFilter.length > 0 || groupParam) && (
        <div className="row wrap gap-2" style={{ marginBottom: 'var(--s-4)' }}>
          {groupParam && (
            <Chip tone="accent" onClick={() => setQueryParam('group', null)}>
              Group: {groupParam} ✕
            </Chip>
          )}
          {loaderFilter.map((loader) => (
            <Chip key={loader} tone="accent" onClick={() => toggleLoader(loader)}>
              {LOADER_NAME[loader]} ✕
            </Chip>
          ))}
          {tagFilter.map((tag) => (
            <Chip
              key={tag}
              tone="accent"
              onClick={() => setTagFilter((current) => current.filter((entry) => entry !== tag))}
            >
              {tag} ✕
            </Chip>
          ))}
        </div>
      )}

      {instances.length === 0 ? (
        <EmptyState
          icon={<Boxes size={26} />}
          title="No instances yet"
          description="Every Minecraft setup lives in its own instance, with separate mods, worlds and settings."
          action={
            <div className="row gap-2">
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
                Create an instance
              </Button>
              <Button icon={<FolderInput size={15} />} onClick={() => void importInstance()}>
                Import one
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX size={26} />}
          title="Nothing matches"
          description="Try a different search term, or clear the active filters."
          action={
            <Button
              onClick={() => {
                setQuery('')
                setLoaderFilter([])
                setTagFilter([])
                setFavouritesOnly(false)
                setQueryParam('group', null)
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : view === 'grid' ? (
        <motion.div layout className="instance-grid" data-size={settings?.instanceCardSize ?? 'regular'}>
          <AnimatePresence mode="popLayout">
            {filtered.map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                onOpen={() => navigate(`/instances/${instance.id}`)}
                onPlay={() => void actions.play(instance)}
                onStop={() => void actions.stop(instance)}
                onToggleFavorite={() => void actions.toggleFavorite(instance)}
                onContextMenu={(event) => openMenu(event, actions.buildMenu(instance))}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="surface" style={{ padding: 6 }}>
          {filtered.map((instance) => (
            <InstanceRow
              key={instance.id}
              instance={instance}
              onPlay={() => void actions.play(instance)}
              onStop={() => void actions.stop(instance)}
              onContextMenu={(event) => openMenu(event, actions.buildMenu(instance))}
            />
          ))}
        </div>
      )}

      {view === 'grid' && instances.length > 0 && (
        <div className="row center gap-3" style={{ marginTop: 'var(--s-6)' }}>
          <span className="t-tiny dimmer">Card size</span>
          <Segmented
            value={settings?.instanceCardSize ?? 'regular'}
            onChange={(size) => void updateSettings({ instanceCardSize: size })}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'regular', label: 'Regular' },
              { value: 'large', label: 'Large' }
            ]}
          />
        </div>
      )}

      <CreateInstanceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {actions.dialogs}
    </div>
  )
}

function InstanceRow({
  instance,
  onPlay,
  onStop,
  onContextMenu
}: {
  instance: InstanceSummary
  onPlay: () => void
  onStop: () => void
  onContextMenu: (event: React.MouseEvent) => void
}): React.JSX.Element {
  const { iconUrl } = useInstanceImages(instance)
  const running = instance.status === 'running'
  const busy = isBusy(instance.status)

  return (
    <div
      className="irow"
      onClick={() => navigate(`/instances/${instance.id}`)}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
    >
      <InstanceIcon instance={instance} iconUrl={iconUrl} size={40} className="irow__icon" />

      <div style={{ minWidth: 0 }}>
        <div className="row gap-2">
          {instance.favorite && <Star size={12} fill="#FFC94D" color="#FFC94D" />}
          <span className="t-small truncate" style={{ fontWeight: 560 }}>
            {instance.name}
          </span>
        </div>
        {instance.tags.length > 0 && (
          <div className="dimmer truncate" style={{ fontSize: 11, marginTop: 2 }}>
            {instance.tags.join(' · ')}
          </div>
        )}
      </div>

      <div className="row gap-2" style={{ minWidth: 0 }}>
        <Chip>{instance.minecraftVersion}</Chip>
        <Chip loader={instance.loader}>{LOADER_NAME[instance.loader]}</Chip>
      </div>

      <span className="dimmer t-small truncate">
        {instance.lastPlayed ? formatRelative(instance.lastPlayed) : 'Never'}
      </span>

      <span className="dimmer t-small nums">
        {instance.totalPlaytimeMs > 0 ? `${(instance.totalPlaytimeMs / 3_600_000).toFixed(1)} h` : '—'}
      </span>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {busy ? (
          <span className="chip">{statusLabel(instance.status)}</span>
        ) : (
          <Button
            size="sm"
            variant={running ? 'danger' : 'secondary'}
            icon={running ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            onClick={(event) => {
              event.stopPropagation()
              if (running) onStop()
              else onPlay()
            }}
          >
            {running ? 'Stop' : 'Play'}
          </Button>
        )}
      </div>
    </div>
  )
}
