import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookmarkPlus,
  FolderOpen,
  Import,
  RotateCcw,
  Shirt,
  Trash2,
  Upload,
  UserRound
} from 'lucide-react'
import type { Account, SkinLibraryEntry, SkinVariant } from '@shared/types'
import { formatRelative } from '../lib/format'
import { api, reportError, toast, useOrbit } from '../state/store'
import { CapePreview, SkinPreview } from './SkinPreview'
import {
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  IconButton,
  Segmented,
  Skeleton,
  TextField,
  Tooltip,
  useContextMenu
} from './ui'

export function SkinManager({
  account,
  open,
  onClose
}: {
  account: Account | null
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const refreshAccounts = useOrbit((state) => state.refreshAccounts)
  const openMenu = useContextMenu()

  const [library, setLibrary] = useState<SkinLibraryEntry[] | null>(null)
  const [pending, setPending] = useState<{ path: string; url: string } | null>(null)
  const [variant, setVariant] = useState<SkinVariant>('CLASSIC')
  const [busy, setBusy] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [removing, setRemoving] = useState<SkinLibraryEntry | null>(null)

  const activeSkin = useMemo(
    () => account?.skins.find((skin) => skin.state === 'ACTIVE') ?? account?.skins[0] ?? null,
    [account]
  )
  const activeCape = useMemo(() => account?.capes.find((cape) => cape.state === 'ACTIVE') ?? null, [account])

  const loadLibrary = useCallback(async () => {
    try {
      setLibrary(await api.skins.library())
    } catch (err) {
      reportError('Could not read your skin library', err)
      setLibrary([])
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadLibrary()
    setPending(null)
    setVariant(activeSkin?.variant ?? 'CLASSIC')
    setSaveName('')
  }, [open, loadLibrary, activeSkin?.variant])

  if (!account) return <></>

  const run = async (successMessage: string, action: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await action()
      await refreshAccounts()
      toast(successMessage)
    } catch (err) {
      reportError('Could not change the skin', err)
    } finally {
      setBusy(false)
    }
  }

  const chooseFile = async (): Promise<void> => {
    const path = await api.app.pickFile([{ name: 'Skin texture', extensions: ['png'] }], 'Choose a skin PNG')
    if (!path) return
    const url = await api.app.readImageAsDataUrl(path)
    setPending(url ? { path, url } : null)
    if (!url) toast('Could not read that image', undefined, 'error')
  }

  const previewSrc = pending?.url ?? activeSkin?.url ?? null

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Skin & cape"
        description={`Signed in as ${account.username}`}
        width="wide"
        icon={<Shirt size={18} />}
        footer={
          <>
            <Button
              variant="ghost"
              icon={<FolderOpen size={14} />}
              onClick={() => void api.skins.openLibraryFolder()}
            >
              Library folder
            </Button>
            <span className="grow" />
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {pending && (
              <Button
                variant="primary"
                loading={busy}
                icon={<Upload size={15} />}
                onClick={() =>
                  void run('Skin applied', async () => {
                    await api.skins.upload(account.id, pending.path, variant)
                    setPending(null)
                  })
                }
              >
                Apply skin
              </Button>
            )}
          </>
        }
      >
        <div className="skin-layout">
          <div className="skin-stage">
            <SkinPreview src={previewSrc} variant={variant} scale={7} />
            {pending && <span className="chip chip--accent">Preview — not applied yet</span>}
          </div>

          <div className="col gap-5" style={{ minWidth: 0 }}>
            <div>
              <div className="filter-group__title">Model</div>
              <Segmented
                value={variant}
                onChange={(next) => setVariant(next)}
                options={[
                  { value: 'CLASSIC', label: 'Classic' },
                  { value: 'SLIM', label: 'Slim' }
                ]}
              />
              <p className="field__hint" style={{ marginTop: 8 }}>
                Classic has 4px arms, Slim has 3px. Applied together with the skin.
              </p>
            </div>

            <div className="row wrap gap-2">
              <Button icon={<Import size={15} />} onClick={() => void chooseFile()}>
                Choose PNG…
              </Button>
              {pending && (
                <Button variant="ghost" onClick={() => setPending(null)}>
                  Cancel
                </Button>
              )}
              <Button
                icon={<BookmarkPlus size={15} />}
                disabled={!activeSkin?.url}
                onClick={() =>
                  void run('Saved to library', async () => {
                    setLibrary(
                      await api.skins.saveCurrentToLibrary(account.id, saveName || `${account.username}'s skin`)
                    )
                  })
                }
              >
                Save current
              </Button>
              <Button
                variant="ghost"
                icon={<RotateCcw size={15} />}
                disabled={!activeSkin}
                onClick={() => setConfirmReset(true)}
              >
                Reset to default
              </Button>
            </div>

            <div>
              <div className="filter-group__title">Capes</div>
              {account.capes.length === 0 ? (
                <p className="field__hint">This account does not own any capes.</p>
              ) : (
                <div className="cape-row">
                  <Tooltip content="No cape">
                    <button
                      className="cape"
                      data-active={!activeCape || undefined}
                      onClick={() => void run('Cape hidden', () => api.skins.setCape(account.id, null))}
                      type="button"
                    >
                      <span className="cape__none">None</span>
                    </button>
                  </Tooltip>

                  {account.capes.map((cape) => (
                    <Tooltip key={cape.id} content={cape.alias}>
                      <button
                        className="cape"
                        data-active={activeCape?.id === cape.id || undefined}
                        onClick={() => void run(`${cape.alias} equipped`, () => api.skins.setCape(account.id, cape.id))}
                        type="button"
                      >
                        <CapePreview src={cape.url} scale={4} />
                      </button>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'var(--s-6)' }}>
          <div className="row between gap-3" style={{ marginBottom: 'var(--s-3)' }}>
            <div className="filter-group__title" style={{ margin: 0 }}>
              Your library
            </div>
            <div className="row gap-2">
              <TextField
                placeholder="Name for saved skins"
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
              />
              <Button
                size="sm"
                icon={<Import size={13} />}
                onClick={async () => {
                  const path = await api.app.pickFile(
                    [{ name: 'Skin texture', extensions: ['png'] }],
                    'Add a skin to your library'
                  )
                  if (!path) return
                  try {
                    setLibrary(await api.skins.addToLibrary(path, saveName, variant))
                    toast('Added to library')
                  } catch (err) {
                    reportError('Could not add that skin', err)
                  }
                }}
              >
                Add file
              </Button>
            </div>
          </div>

          {library === null ? (
            <div className="skin-grid">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} height={132} radius={13} />
              ))}
            </div>
          ) : library.length === 0 ? (
            <EmptyState
              icon={<UserRound size={24} />}
              title="No saved skins"
              description="Save the skin you are wearing, or add PNG files to build a collection you can switch between."
            />
          ) : (
            <div className="skin-grid">
              {library.map((entry) => (
                <div
                  className="skin-card"
                  key={entry.id}
                  onContextMenu={(event) =>
                    openMenu(event, [
                      {
                        label: 'Apply to this account',
                        onSelect: () =>
                          void run(`${entry.name} applied`, () =>
                            api.skins.applyFromLibrary(account.id, entry.id)
                          )
                      },
                      { separator: true, label: 'sep' },
                      { label: 'Remove', danger: true, onSelect: () => setRemoving(entry) }
                    ])
                  }
                >
                  <SkinPreview src={entry.url} variant={entry.variant} scale={3} />
                  <div className="skin-card__meta">
                    <span className="truncate" title={entry.name}>
                      {entry.name}
                    </span>
                    <span className="dimmer" style={{ fontSize: 10.5 }}>
                      {entry.variant === 'SLIM' ? 'Slim' : 'Classic'} · {formatRelative(entry.addedAt)}
                    </span>
                  </div>
                  <div className="skin-card__actions">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={busy}
                      onClick={() =>
                        void run(`${entry.name} applied`, () => api.skins.applyFromLibrary(account.id, entry.id))
                      }
                    >
                      Apply
                    </Button>
                    <IconButton label="Remove" danger onClick={() => setRemoving(entry)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset to the default skin?"
        description="Your account goes back to the default Steve or Alex model. Save the current skin first if you want it back later."
        confirmLabel="Reset skin"
        danger
        icon={<RotateCcw size={18} />}
        onConfirm={() => run('Skin reset', () => api.skins.reset(account.id))}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        description="The saved PNG is deleted from your library. Your account's current skin is not affected."
        confirmLabel="Remove"
        danger
        icon={<Trash2 size={18} />}
        onConfirm={async () => {
          if (!removing) return
          setLibrary(await api.skins.removeFromLibrary(removing.id))
          toast('Removed from library')
        }}
      />
    </>
  )
}
