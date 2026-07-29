import { useCallback, useState } from 'react'
import {
  Archive,
  Copy,
  FolderOpen,
  Pencil,
  Play,
  Share,
  Square,
  Star,
  StarOff,
  Trash2,
  Wrench
} from 'lucide-react'
import type { InstanceSummary } from '@shared/types'
import type { MenuItemSpec } from '../components/ui'
import { Button, ConfirmDialog, Dialog, Checkbox, TextField } from '../components/ui'
import { api, reportError, toast, useOrbit } from '../state/store'
import { navigate } from './router'

export interface InstanceActions {
  play: (instance: InstanceSummary) => Promise<void>
  stop: (instance: InstanceSummary) => Promise<void>
  toggleFavorite: (instance: InstanceSummary) => Promise<void>
  buildMenu: (instance: InstanceSummary) => MenuItemSpec[]
  dialogs: React.JSX.Element
}

export function useInstanceActions(): InstanceActions {
  const refreshInstances = useOrbit((state) => state.refreshInstances)
  const activeAccount = useOrbit((state) => state.activeAccount)

  const [deleting, setDeleting] = useState<InstanceSummary | null>(null)
  const [duplicating, setDuplicating] = useState<InstanceSummary | null>(null)
  const [duplicateName, setDuplicateName] = useState('')
  const [exporting, setExporting] = useState<InstanceSummary | null>(null)
  const [exportOptions, setExportOptions] = useState({
    includeSaves: true,
    includeConfig: true,
    includeResourcePacks: true,
    includeShaderPacks: true,
    includeScreenshots: false,
    includeLogs: false
  })

  const play = useCallback(
    async (instance: InstanceSummary) => {
      if (!activeAccount) {
        toast('Sign in first', 'Orbit needs a Microsoft account that owns Minecraft.', 'warning')
        navigate('/accounts')
        return
      }
      try {
        await api.instances.launch(instance.id)
      } catch (err) {
        reportError(`Could not launch ${instance.name}`, err)
      }
    },
    [activeAccount]
  )

  const stop = useCallback(async (instance: InstanceSummary) => {
    try {
      await api.instances.kill(instance.id)
    } catch (err) {
      reportError('Could not stop the game', err)
    }
  }, [])

  const toggleFavorite = useCallback(
    async (instance: InstanceSummary) => {
      try {
        await api.instances.setFavorite(instance.id, !instance.favorite)
        await refreshInstances()
      } catch (err) {
        reportError('Could not update favourites', err)
      }
    },
    [refreshInstances]
  )

  const buildMenu = useCallback(
    (instance: InstanceSummary): MenuItemSpec[] => {
      const running = instance.status === 'running'
      return [
        running
          ? { label: 'Stop', icon: <Square size={15} />, onSelect: () => void stop(instance) }
          : { label: 'Play', icon: <Play size={15} />, onSelect: () => void play(instance) },
        { label: 'Open', icon: <Wrench size={15} />, onSelect: () => navigate(`/instances/${instance.id}`) },
        { separator: true, label: 'sep-1' },
        {
          label: instance.favorite ? 'Remove from favourites' : 'Add to favourites',
          icon: instance.favorite ? <StarOff size={15} /> : <Star size={15} />,
          onSelect: () => void toggleFavorite(instance)
        },
        {
          label: 'Rename & edit',
          icon: <Pencil size={15} />,
          onSelect: () => navigate(`/instances/${instance.id}?tab=settings`)
        },
        {
          label: 'Duplicate',
          icon: <Copy size={15} />,
          onSelect: () => {
            setDuplicateName(`${instance.name} copy`)
            setDuplicating(instance)
          }
        },
        { separator: true, label: 'sep-2' },
        {
          label: 'Open folder',
          icon: <FolderOpen size={15} />,
          onSelect: () => void api.instances.openFolder(instance.id)
        },
        {
          label: 'Back up',
          icon: <Archive size={15} />,
          onSelect: () => navigate(`/instances/${instance.id}?tab=backups`)
        },
        { label: 'Export…', icon: <Share size={15} />, onSelect: () => setExporting(instance) },
        { separator: true, label: 'sep-3' },
        {
          label: 'Delete',
          icon: <Trash2 size={15} />,
          danger: true,
          disabled: running,
          onSelect: () => setDeleting(instance)
        }
      ]
    },
    [play, stop, toggleFavorite]
  )

  const dialogs = (
    <>
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="Every world, mod, config file and screenshot inside this instance will be permanently removed. Back it up first if you want to keep anything."
        confirmLabel="Delete instance"
        danger
        icon={<Trash2 size={18} />}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api.instances.remove(deleting.id)
            await refreshInstances()
            toast('Instance deleted', deleting.name)
            navigate('/instances')
          } catch (err) {
            reportError('Could not delete the instance', err)
          }
        }}
      />

      <Dialog
        open={Boolean(duplicating)}
        onClose={() => setDuplicating(null)}
        title="Duplicate instance"
        description="Copies every file, including worlds and mods. Playtime and history start fresh."
        icon={<Copy size={18} />}
        width="narrow"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDuplicating(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!duplicateName.trim()}
              onClick={async () => {
                if (!duplicating) return
                const target = duplicating
                setDuplicating(null)
                try {
                  const clone = await api.instances.duplicate(target.id, duplicateName.trim())
                  await refreshInstances()
                  toast('Instance duplicated', clone.name)
                } catch (err) {
                  reportError('Could not duplicate the instance', err)
                }
              }}
            >
              Duplicate
            </Button>
          </>
        }
      >
        <TextField
          label="Name"
          value={duplicateName}
          onChange={(event) => setDuplicateName(event.target.value)}
          autoFocus
        />
      </Dialog>

      <Dialog
        open={Boolean(exporting)}
        onClose={() => setExporting(null)}
        title="Export instance"
        description="Creates a single .orbitpack file you can share or move to another PC. Mods are always included."
        icon={<Share size={18} />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setExporting(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!exporting) return
                const target = exporting
                setExporting(null)
                try {
                  const path = await api.app.pickSavePath(`${target.name}.orbitpack`, [
                    { name: 'Orbit instance', extensions: ['orbitpack'] }
                  ])
                  if (!path) return
                  await api.instances.export(target.id, path, exportOptions)
                  toast('Instance exported', path)
                } catch (err) {
                  reportError('Export failed', err)
                }
              }}
            >
              Choose location…
            </Button>
          </>
        }
      >
        <div className="col" style={{ paddingBottom: 8 }}>
          {(
            [
              ['includeSaves', 'Worlds', 'Every save folder, including their datapacks'],
              ['includeConfig', 'Configuration', 'Mod configs so the pack behaves identically'],
              ['includeResourcePacks', 'Resource packs', null],
              ['includeShaderPacks', 'Shader packs', null],
              ['includeScreenshots', 'Screenshots', null],
              ['includeLogs', 'Logs', 'Useful when sharing a pack for debugging']
            ] as const
          ).map(([key, label, description]) => (
            <label key={key} className="checkbox-row" style={{ alignItems: 'flex-start', padding: '8px' }}>
              <Checkbox
                checked={exportOptions[key]}
                onChange={(value) => setExportOptions((current) => ({ ...current, [key]: value }))}
              />
              <span>
                <span style={{ fontWeight: 550 }}>{label}</span>
                {description && (
                  <span className="dimmer" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                    {description}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </Dialog>
    </>
  )

  return { play, stop, toggleFavorite, buildMenu, dialogs }
}
