import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Archive,
  CheckCircle2,
  CircleSlash,
  Download,
  FolderInput,
  Package,
  RefreshCw,
  Share,
  Trash2,
  TriangleAlert,
  X
} from 'lucide-react'
import type { TaskInfo } from '@shared/types'
import { Button, EmptyState, IconButton, Progress } from '../components/ui'
import { formatBytes, formatDuration, formatRelative, formatSpeed } from '../lib/format'
import { Link } from '../lib/router'
import { api, useOrbit } from '../state/store'

const KIND_ICON: Record<TaskInfo['kind'], React.JSX.Element> = {
  install: <Package size={17} />,
  download: <Download size={17} />,
  update: <RefreshCw size={17} />,
  backup: <Archive size={17} />,
  import: <FolderInput size={17} />,
  export: <Share size={17} />,
  java: <Download size={17} />,
  other: <Package size={17} />
}

export function DownloadsPage(): React.JSX.Element {
  const tasks = useOrbit((state) => state.tasks)
  const instances = useOrbit((state) => state.instances)

  const active = useMemo(
    () => tasks.filter((task) => task.status === 'running' || task.status === 'queued'),
    [tasks]
  )
  const finished = useMemo(
    () => tasks.filter((task) => task.status !== 'running' && task.status !== 'queued'),
    [tasks]
  )

  const totals = useMemo(() => {
    const bytes = active.reduce((sum, task) => sum + task.bytesDone, 0)
    const total = active.reduce((sum, task) => sum + task.bytesTotal, 0)
    const speed = active.reduce((sum, task) => sum + task.speed, 0)
    return { bytes, total, speed }
  }, [active])

  const instanceName = (id: string | null): string | null =>
    id ? (instances.find((instance) => instance.id === id)?.name ?? null) : null

  return (
    <div className="page__inner">
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Downloads</h1>
          <p className="page-header__sub">
            {active.length
              ? `${active.length} running · ${formatSpeed(totals.speed)}${
                  totals.total ? ` · ${formatBytes(totals.bytes)} of ${formatBytes(totals.total)}` : ''
                }`
              : 'Everything that installs, updates or backs up shows up here.'}
          </p>
        </div>
        {finished.length > 0 && (
          <Button icon={<Trash2 size={15} />} onClick={() => void api.tasks.clearFinished()}>
            Clear finished
          </Button>
        )}
      </header>

      {tasks.length === 0 ? (
        <EmptyState
          icon={<Download size={26} />}
          title="Nothing in the queue"
          description="Installs, mod updates, Java downloads and backups all report their progress here — and keep running while you browse."
        />
      ) : (
        <div className="col gap-6">
          {active.length > 0 && (
            <section>
              <h2 className="section-title">
                Active
                <span className="section-title__count">{active.length}</span>
              </h2>
              <div className="col gap-3">
                <AnimatePresence initial={false}>
                  {active.map((task) => (
                    <motion.div
                      key={task.id}
                      className="task"
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                    >
                      <div className="task__icon">{KIND_ICON[task.kind]}</div>

                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="row between gap-3">
                          <span className="t-small truncate" style={{ fontWeight: 560 }}>
                            {task.title}
                          </span>
                          <span className="dimmer nums" style={{ fontSize: 12, flexShrink: 0 }}>
                            {task.progress >= 0 ? `${Math.round(task.progress * 100)}%` : 'Working…'}
                          </span>
                        </div>

                        <div style={{ margin: '9px 0 0' }}>
                          <Progress value={task.progress} />
                        </div>

                        <div className="task__meta">
                          {task.detail && <span className="truncate">{task.detail}</span>}
                          {task.bytesTotal > 0 && (
                            <span>
                              {formatBytes(task.bytesDone)} / {formatBytes(task.bytesTotal)}
                            </span>
                          )}
                          {task.speed > 0 && <span>{formatSpeed(task.speed)}</span>}
                          {instanceName(task.instanceId) && (
                            <Link to={`/instances/${task.instanceId}`} style={{ color: 'var(--accent)' }}>
                              {instanceName(task.instanceId)}
                            </Link>
                          )}
                        </div>
                      </div>

                      {task.cancellable && (
                        <IconButton label="Cancel" danger onClick={() => void api.tasks.cancel(task.id)}>
                          <X size={16} />
                        </IconButton>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {finished.length > 0 && (
            <section>
              <h2 className="section-title">
                Recent
                <span className="section-title__count">{finished.length}</span>
              </h2>
              <div className="surface" style={{ padding: 6 }}>
                {finished.map((task) => (
                  <div className="crow" key={task.id}>
                    <div
                      className="crow__icon"
                      style={{
                        color:
                          task.status === 'success'
                            ? 'var(--success)'
                            : task.status === 'error'
                              ? 'var(--danger)'
                              : 'var(--text-tertiary)'
                      }}
                    >
                      {task.status === 'success' ? (
                        <CheckCircle2 size={17} />
                      ) : task.status === 'error' ? (
                        <TriangleAlert size={17} />
                      ) : (
                        <CircleSlash size={17} />
                      )}
                    </div>

                    <div className="crow__text">
                      <div className="crow__name truncate">{task.title}</div>
                      <div className="crow__desc">
                        {task.status === 'error'
                          ? task.error
                          : task.status === 'cancelled'
                            ? 'Cancelled'
                            : `${task.detail || 'Completed'}${
                                task.endedAt ? ` · took ${formatDuration(task.endedAt - task.startedAt)}` : ''
                              }`}
                      </div>
                    </div>

                    <span className="dimmer" style={{ fontSize: 11.5, flexShrink: 0 }}>
                      {formatRelative(task.endedAt ?? task.startedAt)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
