import { useCallback, useEffect, useState } from 'react'
import { Camera, Copy, FolderOpen, Image as ImageIcon, Trash2 } from 'lucide-react'
import type { InstanceSummary, ScreenshotInfo } from '@shared/types'
import {
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Lightbox,
  Skeleton,
  useContextMenu
} from '../../components/ui'
import { formatBytes, formatDateTime, pluralize } from '../../lib/format'
import { api, reportError, toast } from '../../state/store'

export function ScreenshotsTab({ instance }: { instance: InstanceSummary }): React.JSX.Element {
  const openMenu = useContextMenu()
  const [shots, setShots] = useState<ScreenshotInfo[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await api.content.screenshots(instance.id)
      setShots(list)
      setSelected(new Set())


      const entries = await Promise.all(
        list.slice(0, 60).map(async (shot) => [shot.id, await api.app.readImageAsDataUrl(shot.path)] as const)
      )
      setUrls(Object.fromEntries(entries.filter((entry): entry is [string, string] => Boolean(entry[1]))))
    } catch (err) {
      reportError('Could not read the screenshots folder', err)
      setShots([])
    }
  }, [instance.id])

  useEffect(() => {
    void load()
  }, [load])

  const remove = async (ids: string[]): Promise<void> => {
    await api.content.deleteScreenshots(instance.id, ids)
    await load()
    toast(`Deleted ${pluralize(ids.length, 'screenshot')}`)
  }

  return (
    <div className="col gap-4">
      <div className="row gap-3">
        <div className="grow">
          {shots && shots.length > 0 && (
            <span className="t-small dim">{pluralize(shots.length, 'screenshot')}</span>
          )}
        </div>

        {selected.size > 0 && (
          <>
            <span className="t-small" style={{ fontWeight: 550 }}>
              {selected.size} selected
            </span>
            <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => setConfirmDelete([...selected])}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </>
        )}

        <Button
          icon={<FolderOpen size={15} />}
          onClick={() => void api.instances.openFolder(instance.id, 'screenshots')}
        >
          Open folder
        </Button>
      </div>

      {shots === null ? (
        <div className="shot-grid">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} height={132} radius={13} />
          ))}
        </div>
      ) : shots.length === 0 ? (
        <EmptyState
          icon={<Camera size={26} />}
          title="No screenshots yet"
          description="Press F2 in game and your shots will show up here, ready to view, copy or share."
        />
      ) : (
        <div className="shot-grid">
          {shots.map((shot) => (
            <div
              className="shot"
              key={shot.id}
              data-selected={selected.has(shot.id) || undefined}
              onClick={(event) => {
                if (event.shiftKey || event.ctrlKey || selected.size > 0) {
                  setSelected((current) => {
                    const next = new Set(current)
                    if (next.has(shot.id)) next.delete(shot.id)
                    else next.add(shot.id)
                    return next
                  })
                } else if (urls[shot.id]) {
                  setPreview(urls[shot.id])
                }
              }}
              onContextMenu={(event) =>
                openMenu(event, [
                  {
                    label: 'Copy image',
                    icon: <Copy size={15} />,
                    onSelect: async () => {
                      await api.content.copyScreenshot(instance.id, shot.id)
                      toast('Copied to clipboard')
                    }
                  },
                  {
                    label: 'Show in Explorer',
                    icon: <FolderOpen size={15} />,
                    onSelect: () => void api.app.showItemInFolder(shot.path)
                  },
                  { separator: true, label: 'sep' },
                  { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onSelect: () => setConfirmDelete([shot.id]) }
                ])
              }
            >
              {urls[shot.id] ? (
                <img src={urls[shot.id]} alt={shot.fileName} loading="lazy" />
              ) : (
                <div className="center" style={{ height: '100%', color: 'var(--text-tertiary)' }}>
                  <ImageIcon size={22} />
                </div>
              )}

              <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}>
                <Checkbox
                  checked={selected.has(shot.id)}
                  onChange={(value) =>
                    setSelected((current) => {
                      const next = new Set(current)
                      if (value) next.add(shot.id)
                      else next.delete(shot.id)
                      return next
                    })
                  }
                />
              </div>

              <div className="shot__overlay">
                <div className="truncate">{shot.fileName}</div>
                <div style={{ opacity: 0.7, marginTop: 2 }}>
                  {formatDateTime(shot.createdAt)}
                  {shot.width ? ` · ${shot.width}×${shot.height}` : ''} · {formatBytes(shot.sizeBytes)}
                </div>
              </div>

              <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
                <IconButton
                  label="Copy"
                  onClick={async (event) => {
                    event.stopPropagation()
                    await api.content.copyScreenshot(instance.id, shot.id)
                    toast('Copied to clipboard')
                  }}
                >
                  <Copy size={13} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      <Lightbox src={preview} onClose={() => setPreview(null)} />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${pluralize(confirmDelete?.length ?? 0, 'screenshot')}?`}
        description="The image files are permanently removed from the instance folder."
        confirmLabel="Delete"
        danger
        icon={<Trash2 size={18} />}
        onConfirm={() => remove(confirmDelete ?? [])}
      />
    </div>
  )
}
