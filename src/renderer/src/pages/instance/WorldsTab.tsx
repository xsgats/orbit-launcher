import { useCallback, useEffect, useState } from 'react'
import {
  Copy,
  FolderInput,
  FolderOpen,
  Globe2,
  Hash,
  Package,
  Share,
  Skull,
  Swords,
  Trash2
} from 'lucide-react'
import type { InstanceSummary, ServerInfo, WorldInfo } from '@shared/types'
import {
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  SearchInput,
  Skeleton,
  Tooltip,
  useContextMenu
} from '../../components/ui'
import { DIFFICULTIES, GAME_MODES, formatBytes, formatRelative, fuzzyMatch } from '../../lib/format'
import { api, reportError, toast } from '../../state/store'

export function WorldsTab({ instance }: { instance: InstanceSummary }): React.JSX.Element {
  const openMenu = useContextMenu()
  const [worlds, setWorlds] = useState<WorldInfo[] | null>(null)
  const [servers, setServers] = useState<ServerInfo[]>([])
  const [query, setQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<WorldInfo | null>(null)

  const load = useCallback(async () => {
    try {
      const [worldList, serverList] = await Promise.all([
        api.content.worlds(instance.id),
        api.content.servers(instance.id).catch(() => [])
      ])
      setWorlds(worldList)
      setServers(serverList)
    } catch (err) {
      reportError('Could not read the saves folder', err)
      setWorlds([])
    }
  }, [instance.id])

  useEffect(() => {
    void load()
  }, [load])

  const importWorld = async (): Promise<void> => {
    try {
      const path = await api.app.pickFile([{ name: 'World archive', extensions: ['zip'] }], 'Import a world')
      if (!path) return
      setWorlds(await api.content.importWorld(instance.id, path))
      toast('World imported')
    } catch (err) {
      reportError('Import failed', err)
    }
  }

  const exportWorld = async (world: WorldInfo): Promise<void> => {
    try {
      const path = await api.app.pickSavePath(`${world.folder}.zip`, [{ name: 'Zip archive', extensions: ['zip'] }])
      if (!path) return
      await api.content.exportWorld(instance.id, world.id, path)
      toast('World exported', path)
    } catch (err) {
      reportError('Export failed', err)
    }
  }

  const filtered = (worlds ?? []).filter((world) => fuzzyMatch(`${world.name} ${world.folder}`, query))

  return (
    <div className="col gap-5">
      <div className="row gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search worlds…" className="grow" />
        <Button icon={<FolderInput size={15} />} onClick={() => void importWorld()}>
          Import world
        </Button>
        <Button icon={<FolderOpen size={15} />} onClick={() => void api.instances.openFolder(instance.id, 'saves')}>
          Open folder
        </Button>
      </div>

      {worlds === null ? (
        <div className="world-grid">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} height={90} radius={18} />
          ))}
        </div>
      ) : worlds.length === 0 ? (
        <EmptyState
          icon={<Globe2 size={26} />}
          title="No worlds yet"
          description="Worlds you create in game appear here, along with their size, game mode and seed."
          action={
            <Button icon={<FolderInput size={15} />} onClick={() => void importWorld()}>
              Import a world
            </Button>
          }
        />
      ) : (
        <div className="world-grid">
          {filtered.map((world) => (
            <div
              className="world"
              key={world.id}
              onContextMenu={(event) =>
                openMenu(event, [
                  { label: 'Export…', icon: <Share size={15} />, onSelect: () => void exportWorld(world) },
                  {
                    label: 'Duplicate',
                    icon: <Copy size={15} />,
                    onSelect: async () => {
                      setWorlds(await api.content.duplicateWorld(instance.id, world.id))
                      toast('World duplicated')
                    }
                  },
                  {
                    label: 'Open folder',
                    icon: <FolderOpen size={15} />,
                    onSelect: () => void api.instances.openFolder(instance.id, `saves/${world.folder}`)
                  },
                  ...(world.seed
                    ? [
                        {
                          label: 'Copy seed',
                          icon: <Hash size={15} />,
                          onSelect: () => {
                            void navigator.clipboard.writeText(world.seed!)
                            toast('Seed copied', world.seed!)
                          }
                        }
                      ]
                    : []),
                  { separator: true, label: 'sep' },
                  { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onSelect: () => setConfirmDelete(world) }
                ])
              }
            >
              {world.iconDataUrl ? (
                <img className="world__icon" src={world.iconDataUrl} alt="" />
              ) : (
                <div className="world__icon">
                  <Globe2 size={22} />
                </div>
              )}

              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row gap-2">
                  <span className="t-small truncate" style={{ fontWeight: 560 }}>
                    {world.name}
                  </span>
                  {world.hardcore && (
                    <Tooltip content="Hardcore">
                      <Skull size={13} style={{ color: 'var(--danger)' }} />
                    </Tooltip>
                  )}
                </div>

                <div className="row wrap gap-1" style={{ marginTop: 6 }}>
                  {world.gameMode !== null && (
                    <Chip>
                      <Swords size={10} />
                      {GAME_MODES[world.gameMode] ?? 'Unknown'}
                    </Chip>
                  )}
                  {world.difficulty !== null && <Chip>{DIFFICULTIES[world.difficulty] ?? '—'}</Chip>}
                  {world.version && <Chip>{world.version}</Chip>}
                  {world.datapackCount > 0 && (
                    <Chip>
                      <Package size={10} />
                      {world.datapackCount}
                    </Chip>
                  )}
                </div>

                <div className="dimmer" style={{ fontSize: 11, marginTop: 7 }}>
                  {formatBytes(world.sizeBytes)} · {world.lastPlayed ? formatRelative(world.lastPlayed) : 'never played'}
                </div>
              </div>

              <div className="col gap-1" style={{ justifyContent: 'center' }}>
                <IconButton label="Export" onClick={() => void exportWorld(world)}>
                  <Share size={14} />
                </IconButton>
                <IconButton label="Delete" danger onClick={() => setConfirmDelete(world)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {servers.length > 0 && (
        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">Saved servers</span>
            <span className="section-title__count">{servers.length}</span>
          </div>
          <div className="panel__body col gap-1">
            {servers.map((server) => (
              <div className="crow" key={`${server.name}-${server.address}`}>
                <div className="crow__icon">
                  {server.iconDataUrl ? <img src={server.iconDataUrl} alt="" /> : <Globe2 size={16} />}
                </div>
                <div className="crow__text">
                  <div className="crow__name truncate">{server.name}</div>
                  <div className="crow__desc">{server.address}</div>
                </div>
                <IconButton
                  label="Copy address"
                  onClick={() => {
                    void navigator.clipboard.writeText(server.address)
                    toast('Address copied', server.address)
                  }}
                >
                  <Copy size={14} />
                </IconButton>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name ?? ''}?`}
        description="The entire world folder is removed. Export it first if you might want it back."
        confirmLabel="Delete world"
        danger
        icon={<Trash2 size={18} />}
        onConfirm={async () => {
          if (!confirmDelete) return
          await api.content.deleteWorld(instance.id, confirmDelete.id)
          await load()
          toast('World deleted', confirmDelete.name)
        }}
      />
    </div>
  )
}
