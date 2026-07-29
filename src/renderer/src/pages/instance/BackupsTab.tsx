import { useCallback, useEffect, useState } from 'react'
import { Archive, ArchiveRestore, FolderOpen, Plus, Trash2 } from 'lucide-react'
import type { BackupInfo, InstanceSummary } from '@shared/types'
import { Button, Checkbox, ConfirmDialog, Dialog, EmptyState, IconButton, Skeleton, TextField } from '../../components/ui'
import { formatBytes, formatDateTime, formatRelative } from '../../lib/format'
import { api, reportError, toast } from '../../state/store'

export function BackupsTab({ instance }: { instance: InstanceSummary }): React.JSX.Element {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [options, setOptions] = useState({
    includeSaves: true,
    includeMods: true,
    includeConfig: true,
    includeResourcePacks: false,
    includeShaderPacks: false
  })
  const [restoring, setRestoring] = useState<BackupInfo | null>(null)
  const [deleting, setDeleting] = useState<BackupInfo | null>(null)

  const load = useCallback(async () => {
    try {
      setBackups(await api.instances.listBackups(instance.id))
    } catch (err) {
      reportError('Could not list backups', err)
      setBackups([])
    }
  }, [instance.id])

  useEffect(() => {
    void load()
  }, [load])

  const create = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.instances.createBackup(instance.id, { note, ...options })
      await load()
      setCreateOpen(false)
      setNote('')
      toast('Backup created')
    } catch (err) {
      reportError('Backup failed', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="col gap-4">
      <div className="row gap-3">
        <div className="grow">
          <p className="t-small dim" style={{ maxWidth: '62ch', lineHeight: 1.55 }}>
            Backups are zip archives kept outside the instance folder, so restoring never touches anything you did
            not select.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
          New backup
        </Button>
      </div>

      {backups === null ? (
        <div className="col gap-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} height={62} radius={13} />
          ))}
        </div>
      ) : backups.length === 0 ? (
        <EmptyState
          icon={<Archive size={26} />}
          title="No backups yet"
          description="Take a snapshot before updating mods or trying a risky world change."
          action={
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
              Create the first backup
            </Button>
          }
        />
      ) : (
        <div className="surface" style={{ padding: 6 }}>
          {backups.map((backup) => (
            <div className="crow" key={backup.id}>
              <div className="crow__icon">
                <Archive size={17} />
              </div>
              <div className="crow__text">
                <div className="crow__name">
                  <span>{formatDateTime(backup.createdAt)}</span>
                  <span className="dimmer" style={{ fontSize: 11 }}>
                    {formatRelative(backup.createdAt)}
                  </span>
                </div>
                <div className="crow__desc">
                  {backup.note ? `${backup.note} · ` : ''}
                  {backup.contents.join(', ')} · {formatBytes(backup.sizeBytes)}
                </div>
              </div>
              <div className="crow__actions">
                <IconButton label="Show file" onClick={() => void api.app.showItemInFolder(backup.path)}>
                  <FolderOpen size={14} />
                </IconButton>
                <IconButton label="Restore" onClick={() => setRestoring(backup)}>
                  <ArchiveRestore size={15} />
                </IconButton>
                <IconButton label="Delete" danger onClick={() => setDeleting(backup)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a backup"
        description="Choose what to include. Larger selections take longer but restore more."
        icon={<Archive size={18} />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!Object.values(options).some(Boolean)}
              onClick={() => void create()}
            >
              Create backup
            </Button>
          </>
        }
      >
        <div className="col gap-4" style={{ paddingBottom: 8 }}>
          <TextField
            label="Note (optional)"
            placeholder="Before updating to 1.21"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div>
            <div className="filter-group__title">Include</div>
            {(
              [
                ['includeSaves', 'Worlds'],
                ['includeMods', 'Mods'],
                ['includeConfig', 'Configuration'],
                ['includeResourcePacks', 'Resource packs'],
                ['includeShaderPacks', 'Shader packs']
              ] as const
            ).map(([key, label]) => (
              <Checkbox
                key={key}
                checked={options[key]}
                onChange={(value) => setOptions((current) => ({ ...current, [key]: value }))}
                label={label}
              />
            ))}
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(restoring)}
        onClose={() => setRestoring(null)}
        title="Restore this backup?"
        description="Files in the archive overwrite the matching files in the instance. Anything not in the backup is left alone."
        confirmLabel="Restore"
        icon={<ArchiveRestore size={18} />}
        onConfirm={async () => {
          if (!restoring) return
          try {
            await api.instances.restoreBackup(instance.id, restoring.id)
            toast('Backup restored')
          } catch (err) {
            reportError('Restore failed', err)
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this backup?"
        description="The archive file is permanently removed."
        confirmLabel="Delete"
        danger
        icon={<Trash2 size={18} />}
        onConfirm={async () => {
          if (!deleting) return
          await api.instances.deleteBackup(instance.id, deleting.id)
          await load()
          toast('Backup deleted')
        }}
      />
    </div>
  )
}
