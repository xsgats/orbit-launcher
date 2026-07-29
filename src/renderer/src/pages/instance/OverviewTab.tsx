import { useEffect, useState } from 'react'
import {
  CircleAlert,
  FileWarning,
  FolderOpen,
  HardDrive,
  History,
  Layers,
  Play,
  Trash2
} from 'lucide-react'
import type { CrashReport, InstanceSummary, LocalContent } from '@shared/types'
import { Button, Callout, Chip, Dialog, EmptyState, IconButton, Skeleton } from '../../components/ui'
import { formatBytes, formatDateTime, formatDuration, formatRelative, pluralize } from '../../lib/format'
import { setQueryParam } from '../../lib/router'
import { api, reportError, toast, useOrbit } from '../../state/store'

export function OverviewTab({ instance }: { instance: InstanceSummary }): React.JSX.Element {
  const updateInstance = useOrbit((state) => state.refreshInstances)
  const [size, setSize] = useState<number | null>(null)
  const [mods, setMods] = useState<LocalContent[] | null>(null)
  const [crashes, setCrashes] = useState<CrashReport[]>([])
  const [openCrash, setOpenCrash] = useState<{ report: CrashReport; text: string } | null>(null)
  const [notes, setNotes] = useState(instance.notes)

  useEffect(() => {
    void api.instances.computeSize(instance.id).then(setSize).catch(() => setSize(null))
    void api.content.list(instance.id, 'mod').then(setMods).catch(() => setMods([]))
    void api.logs.crashReports(instance.id).then(setCrashes).catch(() => setCrashes([]))
  }, [instance.id, instance.updatedAt])

  useEffect(() => setNotes(instance.notes), [instance.notes])

  const problems = (mods ?? []).filter((mod) => mod.problems.length > 0)
  const disabled = (mods ?? []).filter((mod) => !mod.enabled)
  const recentHistory = instance.history.slice(0, 8)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 'var(--s-5)' }}>
      <div className="col gap-5">
        {crashes.length > 0 && instance.history[0]?.crashed && (
          <Callout tone="danger" icon={<CircleAlert size={16} />}>
            <strong>The last session crashed.</strong> A crash report was written{' '}
            {formatRelative(crashes[0].createdAt)}.
            <div className="row gap-2" style={{ marginTop: 10 }}>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const text = await api.logs.readCrashReport(crashes[0].path)
                  setOpenCrash({ report: crashes[0], text })
                }}
              >
                Read the report
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setQueryParam('tab', 'logs')}>
                Open the log
              </Button>
            </div>
          </Callout>
        )}

        {problems.length > 0 && (
          <Callout tone="warning" icon={<FileWarning size={16} />}>
            <strong>
              {pluralize(problems.length, 'mod')} may not load.
            </strong>
            <ul style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {problems.slice(0, 4).map((mod) => (
                <li key={mod.id} className="truncate">
                  {mod.name} — {mod.problems[0]}
                </li>
              ))}
            </ul>
          </Callout>
        )}

        <div className="panel">
          <div className="panel__head">
            <History size={16} style={{ color: 'var(--text-tertiary)' }} />
            <span className="panel__title">Launch history</span>
            <span className="section-title__count">{instance.launchCount} total</span>
          </div>
          <div className="panel__body">
            {recentHistory.length === 0 ? (
              <div className="dimmer t-small" style={{ padding: '12px 0', textAlign: 'center' }}>
                This instance has not been launched yet.
              </div>
            ) : (
              <div className="timeline">
                {recentHistory.map((record) => (
                  <div className="tl-item" key={record.startedAt}>
                    <span
                      className="tl-item__dot"
                      style={record.crashed ? { color: 'var(--danger)', borderColor: 'var(--danger-a24)' } : undefined}
                    >
                      {record.crashed ? <CircleAlert size={14} /> : <Play size={13} />}
                    </span>
                    <div className="grow">
                      <div className="row between gap-3">
                        <span className="t-small" style={{ fontWeight: 540 }}>
                          {record.crashed
                            ? 'Crashed'
                            : record.endedAt
                              ? `Played ${formatDuration(record.durationMs)}`
                              : 'Running'}
                        </span>
                        <span className="dimmer" style={{ fontSize: 11 }}>
                          {formatDateTime(record.startedAt)}
                        </span>
                      </div>
                      <div className="dimmer" style={{ fontSize: 12, marginTop: 2 }}>
                        {record.accountName ?? 'Unknown account'}
                        {record.exitCode !== null && record.exitCode !== 0 ? ` · exit code ${record.exitCode}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">Notes</span>
            {notes !== instance.notes && (
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  await api.instances.update(instance.id, { notes })
                  await updateInstance()
                  toast('Notes saved')
                }}
              >
                Save
              </Button>
            )}
          </div>
          <div className="panel__body">
            <div className="input input--textarea">
              <textarea
                rows={5}
                value={notes}
                placeholder="Keep track of the mods you want to try, server addresses, coordinates…"
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="col gap-5">
        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">At a glance</span>
          </div>
          <div className="panel__body col gap-4">
            <Row label="Mods installed" value={mods === null ? <Skeleton width={40} height={13} /> : String(mods.length)} />
            <Row label="Disabled mods" value={String(disabled.length)} />
            <Row
              label="Disk usage"
              value={size === null ? <Skeleton width={56} height={13} /> : formatBytes(size)}
            />
            <Row label="Created" value={formatDateTime(instance.createdAt)} />
            <Row label="Total playtime" value={formatDuration(instance.totalPlaytimeMs, 'long')} />
            <Row label="Sessions" value={String(instance.launchCount)} />
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__title">Quick actions</span>
          </div>
          <div className="panel__body col gap-2">
            <Button block icon={<Layers size={15} />} onClick={() => setQueryParam('tab', 'mods')}>
              Manage mods
            </Button>
            <Button
              block
              icon={<FolderOpen size={15} />}
              onClick={() => void api.instances.openFolder(instance.id, '')}
            >
              Open instance folder
            </Button>
            <Button
              block
              icon={<HardDrive size={15} />}
              onClick={() =>
                api.instances
                  .ensureInstalled(instance.id)
                  .then(() => toast('Game files verified'))
                  .catch((err) => reportError('Verification failed', err))
              }
            >
              Verify game files
            </Button>
          </div>
        </div>

        {crashes.length > 0 && (
          <div className="panel">
            <div className="panel__head">
              <CircleAlert size={16} style={{ color: 'var(--danger)' }} />
              <span className="panel__title">Crash reports</span>
              <span className="section-title__count">{crashes.length}</span>
            </div>
            <div className="panel__body col gap-1">
              {crashes.slice(0, 6).map((report) => (
                <div className="crow" key={report.id} style={{ padding: 8 }}>
                  <div className="crow__text">
                    <div className="crow__name truncate">{formatDateTime(report.createdAt)}</div>
                    <div className="crow__desc">{report.summary}</div>
                  </div>
                  <div className="crow__actions">
                    <IconButton
                      label="Read"
                      onClick={async () => {
                        const text = await api.logs.readCrashReport(report.path)
                        setOpenCrash({ report, text })
                      }}
                    >
                      <FileWarning size={14} />
                    </IconButton>
                    <IconButton
                      label="Delete"
                      danger
                      onClick={async () => {
                        await api.logs.deleteCrashReport(report.path)
                        setCrashes(await api.logs.crashReports(instance.id))
                      }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(openCrash)}
        onClose={() => setOpenCrash(null)}
        title="Crash report"
        description={openCrash?.report.fileName}
        width="wide"
        icon={<CircleAlert size={18} />}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                if (openCrash) void navigator.clipboard.writeText(openCrash.text)
                toast('Copied to clipboard')
              }}
            >
              Copy
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (openCrash) void api.app.showItemInFolder(openCrash.report.path)
              }}
            >
              Show file
            </Button>
            <Button variant="primary" onClick={() => setOpenCrash(null)}>
              Close
            </Button>
          </>
        }
      >
        <pre
          className="t-mono selectable"
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: 'var(--surface-inset)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)',
            padding: 'var(--s-4)',
            maxHeight: '52vh',
            overflow: 'auto',
            lineHeight: 1.6
          }}
        >
          {openCrash?.text}
        </pre>
      </Dialog>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="row between gap-3">
      <span className="t-small dim">{label}</span>
      <span className="t-small nums" style={{ fontWeight: 550 }}>
        {value}
      </span>
    </div>
  )
}

export { Chip }
