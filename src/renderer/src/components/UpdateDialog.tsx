import { useMemo, useState } from 'react'
import { ArrowUpCircle, ExternalLink, RotateCw } from 'lucide-react'
import { api, reportError, useOrbit } from '../state/store'
import { Button, Callout, ConfirmDialog, Dialog, Progress } from './ui'

export function UpdateDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const state = useOrbit((store) => store.updateState)
  const statuses = useOrbit((store) => store.statuses)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const gamesRunning = useMemo(
    () => Object.values(statuses).filter((status) => status === 'running').length,
    [statuses]
  )

  const version = state?.version ?? ''
  const ready = state?.status === 'ready'
  const downloading = state?.status === 'downloading'

  const install = (): void => {
    if (gamesRunning > 0) {
      setConfirmOpen(true)
      return
    }
    void api.updater.installNow()
  }

  const download = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.updater.download()
    } catch (err) {
      reportError('Could not download the update', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        width="narrow"
        icon={ready ? <RotateCw size={18} /> : <ArrowUpCircle size={18} />}
        title={ready ? `Orbit ${version} is ready` : `Orbit ${version} is available`}
        description={
          ready
            ? 'The update has been downloaded. Restarting takes a few seconds.'
            : `You are on ${state?.currentVersion ?? ''}. Downloading happens in the background — you can keep playing.`
        }
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Later
            </Button>
            {ready ? (
              <Button variant="primary" icon={<RotateCw size={15} />} onClick={install}>
                Restart &amp; install
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={<ArrowUpCircle size={15} />}
                loading={busy || downloading}
                disabled={busy || downloading}
                onClick={() => void download()}
              >
                {downloading ? 'Downloading…' : 'Download update'}
              </Button>
            )}
          </>
        }
      >
        <div className="col gap-4" style={{ paddingBottom: 8 }}>
          {downloading && (
            <div className="col gap-2">
              <Progress value={state?.progress ?? 0} />
              <span className="t-small dim">{Math.round((state?.progress ?? 0) * 100)}% downloaded</span>
            </div>
          )}

          {state?.error && <Callout tone="danger">{state.error}</Callout>}

          {state?.notes && (
            <div className="col gap-2">
              <span className="t-small" style={{ fontWeight: 560 }}>
                What&apos;s new
              </span>
              <div
                className="t-small dim selectable"
                style={{ maxHeight: 220, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
              >
                {state.notes}
              </div>
            </div>
          )}

          {state?.releaseUrl && (
            <button
              className="row gap-2 t-small"
              style={{ color: 'var(--accent)', alignSelf: 'flex-start' }}
              onClick={() => void api.app.openExternal(state.releaseUrl!)}
              type="button"
            >
              <ExternalLink size={14} />
              View this release on GitHub
            </button>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void api.updater.installNow()}
        title="Minecraft is still running"
        description={
          gamesRunning === 1
            ? 'Restarting Orbit now will leave the running game without launcher features like playtime tracking and crash reports.'
            : `Restarting Orbit now will leave ${gamesRunning} running games without launcher features like playtime tracking and crash reports.`
        }
        confirmLabel="Restart anyway"
        icon={<RotateCw size={18} />}
      />
    </>
  )
}
