import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpCircle,
  CircleAlert,
  Compass,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  Layers,
  Package,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react'
import type { ContentKind, InstanceSummary, LocalContent } from '@shared/types'
import {
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  SearchInput,
  Segmented,
  Skeleton,
  Switch,
  Tooltip,
  useContextMenu
} from '../../components/ui'
import { formatBytes, formatRelative, fuzzyMatch, pluralize } from '../../lib/format'
import { navigate } from '../../lib/router'
import { api, reportError, toast } from '../../state/store'

const KIND_META: Record<
  Exclude<ContentKind, 'modpack' | 'world'>,
  { title: string; singular: string; folder: string; extensions: string[]; browse: string }
> = {
  mod: { title: 'Mods', singular: 'mod', folder: 'mods', extensions: ['jar'], browse: 'mod' },
  resourcepack: {
    title: 'Resource packs',
    singular: 'resource pack',
    folder: 'resourcepacks',
    extensions: ['zip'],
    browse: 'resourcepack'
  },
  shader: {
    title: 'Shader packs',
    singular: 'shader pack',
    folder: 'shaderpacks',
    extensions: ['zip'],
    browse: 'shader'
  },
  datapack: {
    title: 'Datapacks',
    singular: 'datapack',
    folder: 'datapacks',
    extensions: ['zip'],
    browse: 'datapack'
  }
}

type Filter = 'all' | 'enabled' | 'disabled' | 'updates'

export function ContentTab({
  instance,
  kind,
  onCountChange
}: {
  instance: InstanceSummary
  kind: ContentKind
  onCountChange?: (count: number) => void
}): React.JSX.Element {
  const meta = KIND_META[kind as keyof typeof KIND_META] ?? KIND_META.mod
  const openMenu = useContextMenu()

  const [items, setItems] = useState<LocalContent[] | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await api.content.list(instance.id, kind)
      setItems(list)
      setSelected(new Set())
      if (kind === 'mod') onCountChange?.(list.length)
    } catch (err) {
      reportError(`Could not read the ${meta.folder} folder`, err)
      setItems([])
    }
  }, [instance.id, kind, meta.folder, onCountChange])

  useEffect(() => {
    setItems(null)
    void load()
  }, [load])

  const checkUpdates = async (): Promise<void> => {
    setChecking(true)
    try {
      const list = await api.content.checkUpdates(instance.id, kind)
      setItems(list)
      const count = list.filter((item) => item.update).length
      toast(
        count ? `${pluralize(count, 'update')} available` : 'Everything is up to date',
        count ? 'Select the entries you want to update.' : undefined,
        count ? 'info' : 'success'
      )
    } catch (err) {
      reportError('Update check failed', err)
    } finally {
      setChecking(false)
    }
  }

  const applyUpdates = async (ids: string[]): Promise<void> => {
    setUpdating(true)
    try {
      const list = await api.content.applyUpdates(instance.id, kind, ids)
      setItems(list)
      setSelected(new Set())
      toast('Updates applied')
    } catch (err) {
      reportError('Update failed', err)
    } finally {
      setUpdating(false)
    }
  }

  const addFromDisk = async (): Promise<void> => {
    try {
      const paths = await api.app.pickFiles(
        [{ name: meta.title, extensions: meta.extensions }],
        `Add ${meta.singular}s`
      )
      if (!paths.length) return
      setItems(await api.content.addFromFiles(instance.id, kind, paths))
      toast(`Added ${pluralize(paths.length, meta.singular)}`)
    } catch (err) {
      reportError('Could not add files', err)
    }
  }

  const toggle = async (item: LocalContent): Promise<void> => {
    try {
      setItems(await api.content.setEnabled(instance.id, item.id, !item.enabled))
    } catch (err) {
      reportError('Could not toggle that file', err)
    }
  }

  const remove = async (ids: string[]): Promise<void> => {
    try {
      const list = await api.content.remove(instance.id, ids)
      setItems(list)
      setSelected(new Set())
      if (kind === 'mod') onCountChange?.(list.length)
      toast(`Removed ${pluralize(ids.length, meta.singular)}`)
    } catch (err) {
      reportError('Could not remove files', err)
    }
  }

  const filtered = useMemo(() => {
    if (!items) return []
    return items.filter((item) => {
      if (filter === 'enabled' && !item.enabled) return false
      if (filter === 'disabled' && item.enabled) return false
      if (filter === 'updates' && !item.update) return false
      if (query && !fuzzyMatch(`${item.name} ${item.fileName} ${item.authors.join(' ')}`, query)) return false
      return true
    })
  }, [items, filter, query])

  const updateCount = items?.filter((item) => item.update).length ?? 0
  const allSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id))

  return (
    <div className="col gap-4">
      <div className="row gap-3 wrap">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={`Search ${meta.title.toLowerCase()}…`}
          className="grow"
        />

        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'enabled', label: 'Enabled' },
            { value: 'disabled', label: 'Disabled' },
            { value: 'updates', label: updateCount ? `Updates (${updateCount})` : 'Updates' }
          ]}
        />

        <Button icon={<RefreshCw size={14} className={checking ? 'spin' : undefined} />} loading={checking} onClick={() => void checkUpdates()}>
          Check for updates
        </Button>
        <Button icon={<FilePlus2 size={15} />} onClick={() => void addFromDisk()}>
          Add file
        </Button>
        <Button
          variant="primary"
          icon={<Compass size={15} />}
          onClick={() => navigate(`/discover?kind=${meta.browse}&instance=${instance.id}`)}
        >
          Browse
        </Button>
      </div>

      {(selected.size > 0 || updateCount > 0) && (
        <div
          className="row gap-3 surface"
          style={{ padding: '10px 14px', background: 'var(--accent-a08)', borderColor: 'var(--accent-a24)' }}
        >
          {selected.size > 0 ? (
            <>
              <Checkbox
                checked={allSelected}
                onChange={(value) =>
                  setSelected(value ? new Set(filtered.map((item) => item.id)) : new Set())
                }
              />
              <span className="t-small" style={{ fontWeight: 550 }}>
                {pluralize(selected.size, 'item')} selected
              </span>
              <span className="grow" />
              <Button
                size="sm"
                onClick={() => void Promise.all([...selected].map((id) => {
                  const item = items?.find((entry) => entry.id === id)
                  return item ? api.content.setEnabled(instance.id, id, !item.enabled) : Promise.resolve([])
                })).then(load)}
              >
                Toggle
              </Button>
              <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => setConfirmDelete([...selected])}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </>
          ) : (
            <>
              <ArrowUpCircle size={16} style={{ color: 'var(--accent)' }} />
              <span className="t-small" style={{ fontWeight: 550 }}>
                {pluralize(updateCount, 'update')} available
              </span>
              <span className="grow" />
              <Button size="sm" variant="primary" loading={updating} onClick={() => void applyUpdates([])}>
                Update all
              </Button>
            </>
          )}
        </div>
      )}

      {items === null ? (
        <div className="surface" style={{ padding: 8 }}>
          {[0, 1, 2, 3, 4].map((index) => (
            <div className="crow" key={index}>
              <Skeleton width={40} height={40} radius={9} />
              <div className="col gap-2 grow">
                <Skeleton height={12} width="42%" />
                <Skeleton height={10} width="70%" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={kind === 'mod' ? <Layers size={26} /> : <Package size={26} />}
          title={`No ${meta.title.toLowerCase()} yet`}
          description={
            kind === 'mod' && instance.loader === 'vanilla'
              ? 'This instance runs vanilla Minecraft. Switch it to Fabric, Quilt, Forge or NeoForge in Settings before adding mods.'
              : `Browse Modrinth and CurseForge without leaving Orbit, or drop files straight into the ${meta.folder} folder.`
          }
          action={
            <div className="row gap-2">
              <Button
                variant="primary"
                icon={<Compass size={15} />}
                onClick={() => navigate(`/discover?kind=${meta.browse}&instance=${instance.id}`)}
              >
                Browse {meta.title.toLowerCase()}
              </Button>
              <Button
                icon={<FolderOpen size={15} />}
                onClick={() => void api.instances.openFolder(instance.id, meta.folder)}
              >
                Open folder
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search size={26} />} title="Nothing matches" description="Try a different search or filter." />
      ) : (
        <div className="surface" style={{ padding: 6 }}>
          {filtered.map((item) => (
            <div
              className="crow"
              key={item.id}
              data-disabled={!item.enabled}
              data-selected={selected.has(item.id) || undefined}
              onContextMenu={(event) =>
                openMenu(event, [
                  {
                    label: item.enabled ? 'Disable' : 'Enable',
                    onSelect: () => void toggle(item)
                  },
                  ...(item.update
                    ? [{ label: `Update to ${item.update.versionNumber}`, onSelect: () => void applyUpdates([item.id]) }]
                    : []),
                  ...(item.projectId && item.provider
                    ? [
                        {
                          label: 'Open project page',
                          onSelect: () => navigate(`/discover/${item.provider}/${item.projectId}`)
                        }
                      ]
                    : []),
                  ...(item.homepage
                    ? [{ label: 'Open website', onSelect: () => void api.app.openExternal(item.homepage!) }]
                    : []),
                  { separator: true, label: 'sep' },
                  { label: 'Delete', danger: true, onSelect: () => setConfirmDelete([item.id]) }
                ])
              }
            >
              <Checkbox
                checked={selected.has(item.id)}
                onChange={(value) =>
                  setSelected((current) => {
                    const next = new Set(current)
                    if (value) next.add(item.id)
                    else next.delete(item.id)
                    return next
                  })
                }
              />

              <div className="crow__icon">
                {item.iconDataUrl ? <img src={item.iconDataUrl} alt="" /> : <Package size={17} />}
              </div>

              <div className="crow__text">
                <div className="crow__name">
                  <span className="truncate">{item.name}</span>
                  {item.version && <span className="dimmer" style={{ fontSize: 11 }}>{item.version}</span>}
                  {item.update && (
                    <Tooltip content={`Update available: ${item.update.versionNumber}`}>
                      <span className="chip chip--accent" style={{ height: 18 }}>
                        <ArrowUpCircle size={11} />
                        {item.update.versionNumber}
                      </span>
                    </Tooltip>
                  )}
                  {item.problems.length > 0 && (
                    <Tooltip content={item.problems.join('\n')}>
                      <span className="chip chip--warning" style={{ height: 18 }}>
                        <CircleAlert size={11} />
                      </span>
                    </Tooltip>
                  )}
                  {item.provider && (
                    <span className="provider-mark" data-provider={item.provider}>
                      {item.provider === 'modrinth' ? 'MR' : 'CF'}
                    </span>
                  )}
                </div>
                <div className="crow__desc">
                  {item.description ?? item.fileName}
                  {item.authors.length > 0 && ` · ${item.authors.slice(0, 2).join(', ')}`}
                </div>
              </div>

              <span className="dimmer nums" style={{ fontSize: 11.5, flexShrink: 0 }}>
                {formatBytes(item.sizeBytes)}
              </span>
              <span className="dimmer" style={{ fontSize: 11.5, flexShrink: 0, width: 92, textAlign: 'right' }}>
                {formatRelative(item.modifiedAt)}
              </span>

              <div className="crow__actions">
                {item.update && (
                  <IconButton label="Update" onClick={() => void applyUpdates([item.id])}>
                    <ArrowUpCircle size={15} />
                  </IconButton>
                )}
                {item.projectId && item.provider && (
                  <IconButton
                    label="Project page"
                    onClick={() => navigate(`/discover/${item.provider}/${item.projectId}`)}
                  >
                    <ExternalLink size={14} />
                  </IconButton>
                )}
                <IconButton label="Delete" danger onClick={() => setConfirmDelete([item.id])}>
                  <Trash2 size={14} />
                </IconButton>
              </div>

              <Tooltip content={item.enabled ? 'Enabled' : 'Disabled'}>
                <span style={{ marginLeft: 4 }}>
                  <Switch checked={item.enabled} onChange={() => void toggle(item)} label={item.name} />
                </span>
              </Tooltip>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${pluralize(confirmDelete?.length ?? 0, meta.singular)}?`}
        description="The files are removed from the instance folder. This cannot be undone."
        confirmLabel="Delete"
        danger
        icon={<Trash2 size={18} />}
        onConfirm={() => remove(confirmDelete ?? [])}
      />
    </div>
  )
}

export { Chip }
