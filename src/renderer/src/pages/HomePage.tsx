import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Blocks,
  Boxes,
  CircleAlert,
  Clock3,
  Compass,
  Cpu,
  Download,
  Gauge,
  Newspaper,
  Play,
  Plus,
  Sparkles,
  Square,
  Timer,
  TrendingUp
} from 'lucide-react'
import type { NewsItem, SystemInfo } from '@shared/types'
import { InstanceIcon, isBusy, statusLabel, useInstanceImages } from '../components/InstanceCard'
import { Button, Chip, EmptyState, Progress, Skeleton } from '../components/ui'
import { useContextMenu } from '../components/ui'
import {
  LOADER_NAME,
  artworkColors,
  formatCount,
  formatDuration,
  formatRelative,
  pluralize
} from '../lib/format'
import { useInstanceActions } from '../lib/instanceActions'
import { Link, navigate } from '../lib/router'
import { api, useOrbit, useRunningTasks } from '../state/store'
import { CreateInstanceDialog } from './CreateInstanceDialog'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}





function FeatureCard(): React.JSX.Element | null {
  const instances = useOrbit((state) => state.instances)
  const statuses = useOrbit((state) => state.statuses)
  const { play, stop, buildMenu } = useInstanceActions()
  const openMenu = useContextMenu()

  const featured = useMemo(() => {
    const played = instances.filter((instance) => instance.lastPlayed)
    const pool = played.length ? played : instances
    return pool[0] ?? null
  }, [instances])

  const decorated = featured ? { ...featured, status: statuses[featured.id] ?? 'idle' } : null
  const images = useInstanceImages(
    decorated ?? ({ id: '', icon: { type: 'preset', key: 'orbit' }, background: null } as never)
  )

  if (!decorated) return null

  const art = artworkColors(decorated.id + decorated.name)
  const running = decorated.status === 'running'
  const busy = isBusy(decorated.status)

  return (
    <motion.section
      className="hero"
      style={{ minHeight: 232 }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      onContextMenu={(event) => openMenu(event, buildMenu(decorated))}
    >
      <div
        className="hero__art"
        style={
          images.backgroundUrl
            ? undefined
            : ({
                background: `radial-gradient(120% 90% at 12% 10%, ${art.a}, transparent 62%),
                             radial-gradient(110% 100% at 86% 34%, ${art.b}, transparent 60%),
                             linear-gradient(150deg, var(--bg-elevated), var(--bg-base))`
              } as React.CSSProperties)
        }
      >
        {images.backgroundUrl && <img src={images.backgroundUrl} alt="" />}
      </div>

      <div className="hero__content">
        <InstanceIcon instance={decorated} iconUrl={images.iconUrl} size={88} className="hero__icon" />

        <div className="grow" style={{ minWidth: 0 }}>
          <div className="t-tiny dimmer" style={{ marginBottom: 6 }}>
            {decorated.lastPlayed ? 'Continue playing' : 'Ready when you are'}
          </div>
          <h2 className="hero__title truncate">{decorated.name}</h2>
          <div className="hero__chips">
            <Chip>{decorated.minecraftVersion}</Chip>
            <Chip loader={decorated.loader}>{LOADER_NAME[decorated.loader]}</Chip>
            {decorated.lastPlayed && (
              <Chip>
                <Clock3 size={11} />
                {formatRelative(decorated.lastPlayed)}
              </Chip>
            )}
            {decorated.totalPlaytimeMs > 0 && (
              <Chip>
                <Timer size={11} />
                {formatDuration(decorated.totalPlaytimeMs)} played
              </Chip>
            )}
          </div>
        </div>

        <div className="hero__actions">
          <Button variant="secondary" size="lg" onClick={() => navigate(`/instances/${decorated.id}`)}>
            Manage
          </Button>
          {running ? (
            <Button variant="danger" size="lg" icon={<Square size={16} fill="currentColor" />} onClick={() => void stop(decorated)}>
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              loading={busy}
              icon={<Play size={17} fill="currentColor" />}
              onClick={() => void play(decorated)}
            >
              {busy ? statusLabel(decorated.status) : 'Play'}
            </Button>
          )}
        </div>
      </div>
    </motion.section>
  )
}





function Stats({ system }: { system: SystemInfo | null }): React.JSX.Element {
  const instances = useOrbit((state) => state.instances)

  const totals = useMemo(() => {
    const playtime = instances.reduce((sum, instance) => sum + instance.totalPlaytimeMs, 0)
    const launches = instances.reduce((sum, instance) => sum + instance.launchCount, 0)
    const modded = instances.filter((instance) => instance.loader !== 'vanilla').length
    return { playtime, launches, modded }
  }, [instances])

  const hours = totals.playtime / 3_600_000

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(196px, 1fr))', gap: 'var(--s-4)' }}>
      <div className="stat">
        <span className="stat__label">
          <Boxes size={12} /> Instances
        </span>
        <span className="stat__value">{instances.length}</span>
        <span className="stat__sub">{totals.modded} modded</span>
      </div>

      <div className="stat">
        <span className="stat__label">
          <Timer size={12} /> Total playtime
        </span>
        <span className="stat__value">
          {hours >= 1 ? (hours >= 100 ? Math.round(hours) : hours.toFixed(1)) : Math.round(totals.playtime / 60_000)}
          <span className="stat__unit">{hours >= 1 ? 'h' : 'm'}</span>
        </span>
        <span className="stat__sub">{pluralize(totals.launches, 'session')}</span>
      </div>

      <div className="stat">
        <span className="stat__label">
          <Cpu size={12} /> Memory
        </span>
        <span className="stat__value">
          {system ? Math.round(system.totalMemoryMb / 1024) : '—'}
          <span className="stat__unit">GB</span>
        </span>
        <span className="stat__sub truncate">{system?.cpuCores ?? 0} cores available</span>
      </div>

      <div className="stat">
        <span className="stat__label">
          <Gauge size={12} /> Orbit
        </span>
        <span className="stat__value" style={{ fontSize: 22 }}>
          {system?.appVersion ?? '—'}
        </span>
        <span className="stat__sub">Electron {system?.electronVersion?.split('.')[0] ?? '—'}</span>
      </div>
    </div>
  )
}





function RecentStrip(): React.JSX.Element {
  const instances = useOrbit((state) => state.instances)
  const statuses = useOrbit((state) => state.statuses)
  const { play } = useInstanceActions()

  const recent = useMemo(
    () =>
      [...instances]
        .sort((a, b) => (b.lastPlayed ?? b.createdAt) - (a.lastPlayed ?? a.createdAt))
        .slice(1, 7),
    [instances]
  )

  if (!recent.length) return <></>

  return (
    <section>
      <div className="row between" style={{ marginBottom: 'var(--s-4)' }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Jump back in
        </h2>
        <Link to="/instances" className="btn btn--ghost btn--sm">
          All instances <ArrowRight size={13} />
        </Link>
      </div>

      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(228px, 1fr))', gap: 'var(--s-3)' }}>
        {recent.map((instance) => (
          <RecentTile key={instance.id} instance={{ ...instance, status: statuses[instance.id] ?? 'idle' }} onPlay={play} />
        ))}
      </div>
    </section>
  )
}

function RecentTile({
  instance,
  onPlay
}: {
  instance: ReturnType<typeof useOrbit.getState>['instances'][number]
  onPlay: (instance: never) => void
}): React.JSX.Element {
  const { iconUrl } = useInstanceImages(instance)
  const busy = isBusy(instance.status)

  return (
    <button
      className="surface surface--raised"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        textAlign: 'left',
        transition: 'all var(--d-base) var(--ease-out)'
      }}
      onClick={() => navigate(`/instances/${instance.id}`)}
      type="button"
    >
      <InstanceIcon instance={instance} iconUrl={iconUrl} size={40} className="irow__icon" />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="t-small truncate" style={{ fontWeight: 560 }}>
          {instance.name}
        </div>
        <div className="dimmer truncate" style={{ fontSize: 11, marginTop: 2 }}>
          {instance.minecraftVersion} · {LOADER_NAME[instance.loader]}
        </div>
      </div>
      <span
        className="iconbtn"
        onClick={(event) => {
          event.stopPropagation()
          if (!busy) onPlay(instance as never)
        }}
        style={{ color: busy ? 'var(--text-tertiary)' : 'var(--accent)' }}
      >
        <Play size={15} fill="currentColor" />
      </span>
    </button>
  )
}





function Activity(): React.JSX.Element {
  const instances = useOrbit((state) => state.instances)

  const events = useMemo(() => {
    const all = instances.flatMap((instance) =>
      instance.history.slice(0, 6).map((record) => ({ instance, record }))
    )
    return all.sort((a, b) => b.record.startedAt - a.record.startedAt).slice(0, 7)
  }, [instances])

  return (
    <div className="panel">
      <div className="panel__head">
        <TrendingUp size={16} style={{ color: 'var(--text-tertiary)' }} />
        <span className="panel__title">Recent activity</span>
      </div>
      <div className="panel__body">
        {events.length === 0 ? (
          <div className="dimmer t-small" style={{ padding: '14px 0', textAlign: 'center' }}>
            Your play sessions will appear here.
          </div>
        ) : (
          <div className="timeline">
            {events.map(({ instance, record }) => (
              <div className="tl-item" key={`${instance.id}-${record.startedAt}`}>
                <span
                  className="tl-item__dot"
                  style={record.crashed ? { color: 'var(--danger)', borderColor: 'var(--danger-a24)' } : undefined}
                >
                  {record.crashed ? <CircleAlert size={14} /> : <Play size={13} />}
                </span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row between gap-3">
                    <Link to={`/instances/${instance.id}`} className="t-small truncate" style={{ fontWeight: 550 }}>
                      {instance.name}
                    </Link>
                    <span className="dimmer" style={{ fontSize: 11, flexShrink: 0 }}>
                      {formatRelative(record.startedAt)}
                    </span>
                  </div>
                  <div className="dimmer" style={{ fontSize: 12, marginTop: 2 }}>
                    {record.crashed
                      ? `Crashed after ${formatDuration(record.durationMs)}`
                      : record.endedAt
                        ? `Played for ${formatDuration(record.durationMs)}`
                        : 'Session in progress'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}





function NewsStrip(): React.JSX.Element | null {
  const showNews = useOrbit((state) => state.settings?.showNewsOnHome ?? true)
  const [news, setNews] = useState<NewsItem[] | null>(null)

  useEffect(() => {
    if (!showNews) return
    void api.news.list().then(setNews).catch(() => setNews([]))
  }, [showNews])

  if (!showNews) return null

  return (
    <div className="panel">
      <div className="panel__head">
        <Newspaper size={16} style={{ color: 'var(--text-tertiary)' }} />
        <span className="panel__title">From Minecraft</span>
        <Link to="/news" className="btn btn--ghost btn--sm">
          All news
        </Link>
      </div>
      <div className="panel__body col gap-3">
        {news === null &&
          [0, 1, 2].map((index) => (
            <div className="row gap-3" key={index}>
              <Skeleton width={64} height={44} radius={9} />
              <div className="col gap-2 grow">
                <Skeleton height={12} width="80%" />
                <Skeleton height={10} width="50%" />
              </div>
            </div>
          ))}

        {news?.slice(0, 4).map((item) => (
          <button
            key={item.id}
            className="row gap-3"
            style={{ textAlign: 'left', width: '100%' }}
            onClick={() => void api.app.openExternal(item.url)}
            type="button"
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt=""
                style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 9, flexShrink: 0 }}
                loading="lazy"
              />
            ) : (
              <div
                style={{
                  width: 64,
                  height: 44,
                  borderRadius: 9,
                  background: 'var(--surface-2)',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  color: 'var(--text-tertiary)'
                }}
              >
                <Blocks size={16} />
              </div>
            )}
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="t-small clamp-2" style={{ fontWeight: 540 }}>
                {item.title}
              </div>
              <div className="dimmer" style={{ fontSize: 11, marginTop: 3 }}>
                {item.category}
              </div>
            </div>
          </button>
        ))}

        {news?.length === 0 && (
          <div className="dimmer t-small" style={{ textAlign: 'center', padding: '10px 0' }}>
            Could not reach the Minecraft news feed.
          </div>
        )}
      </div>
    </div>
  )
}





export function HomePage(): React.JSX.Element {
  const instances = useOrbit((state) => state.instances)
  const activeAccount = useOrbit((state) => state.activeAccount)
  const tasks = useRunningTasks()
  const { dialogs } = useInstanceActions()
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    void api.app.getSystemInfo().then(setSystem)
  }, [])

  return (
    <div className="page__inner">
      <header className="page-header">
        <div>
          <h1 className="page-header__title">
            {greeting()}
            {activeAccount ? `, ${activeAccount.username}` : ''}
          </h1>
          <p className="page-header__sub">
            {instances.length
              ? `${pluralize(instances.length, 'instance')} in your library`
              : 'Set up your first instance to get playing'}
          </p>
        </div>
        <div className="row gap-2">
          <Button icon={<Compass size={15} />} onClick={() => navigate('/discover')}>
            Discover
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
            New instance
          </Button>
        </div>
      </header>

      {instances.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<Sparkles size={26} />}
            title="Your library is empty"
            description="Create a vanilla instance, add Fabric or Forge, or install a modpack straight from Modrinth or CurseForge."
            action={
              <div className="row gap-2">
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
                  Create an instance
                </Button>
                <Button icon={<Compass size={15} />} onClick={() => navigate('/discover?kind=modpack')}>
                  Browse modpacks
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="col gap-7">
          <FeatureCard />

          {tasks.length > 0 && (
            <div className="panel">
              <div className="panel__head">
                <Download size={16} style={{ color: 'var(--accent)' }} />
                <span className="panel__title">In progress</span>
                <Link to="/downloads" className="btn btn--ghost btn--sm">
                  Details
                </Link>
              </div>
              <div className="panel__body col gap-4">
                {tasks.slice(0, 3).map((task) => (
                  <div key={task.id}>
                    <div className="row between gap-3" style={{ marginBottom: 7 }}>
                      <span className="t-small truncate" style={{ fontWeight: 540 }}>
                        {task.title}
                      </span>
                      <span className="dimmer nums" style={{ fontSize: 11.5, flexShrink: 0 }}>
                        {task.progress >= 0 ? `${Math.round(task.progress * 100)}%` : 'Working…'}
                      </span>
                    </div>
                    <Progress value={task.progress} />
                    {task.detail && (
                      <div className="dimmer truncate" style={{ fontSize: 11, marginTop: 6 }}>
                        {task.detail}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Stats system={system} />
          <RecentStrip />

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 'var(--s-5)' }}>
            <Activity />
            <NewsStrip />
          </div>
        </div>
      )}

      <CreateInstanceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {dialogs}
    </div>
  )
}

export { formatCount }
