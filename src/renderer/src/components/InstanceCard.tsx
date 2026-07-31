import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock3, Play, Square, Star, Timer } from 'lucide-react'
import type { InstanceStatus, InstanceSummary } from '@shared/types'
import {
  LOADER_NAME,
  artworkColors,
  formatPlaytime,
  formatRelative,
  letterTileColors,
  shortLoaderVersion
} from '../lib/format'
import { api, useOrbit } from '../state/store'
import { Progress, Tooltip } from './ui'





export function instanceInitial(name: string): string {
  const first = [...name.trim()].find((character) => /[\p{L}\p{N}]/u.test(character))
  return (first ?? '?').toUpperCase()
}


export function useInstanceImages(instance: InstanceSummary): {
  iconUrl: string | null
  backgroundUrl: string | null
} {
  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const showBackgrounds = useOrbit((state) => state.settings?.showInstanceBackgrounds ?? true)

  useEffect(() => {
    let alive = true
    if (instance.icon.type === 'file') {
      void api.instances.getImageUrl(instance.id, 'icon').then((url) => alive && setIconUrl(url))
    } else if (instance.icon.type === 'url') {
      setIconUrl(instance.icon.url)
    } else {
      setIconUrl(null)
    }
    return () => {
      alive = false
    }
  }, [instance.id, instance.icon, instance.updatedAt])

  useEffect(() => {
    let alive = true
    if (instance.background && showBackgrounds) {
      void api.instances.getImageUrl(instance.id, 'background').then((url) => alive && setBackgroundUrl(url))
    } else {
      setBackgroundUrl(null)
    }
    return () => {
      alive = false
    }
  }, [instance.id, instance.background, instance.updatedAt, showBackgrounds])

  return { iconUrl, backgroundUrl }
}

export function InstanceIcon({
  instance,
  iconUrl,
  size = 52,
  className = 'icard__icon'
}: {
  instance: InstanceSummary
  iconUrl: string | null
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <div className={className} style={{ width: size, height: size }}>
      {iconUrl ? (
        <img src={iconUrl} alt="" />
      ) : (
        <LetterTile name={instance.name} seed={instance.id + instance.name} size={size} />
      )}
    </div>
  )
}

export function LetterTile({
  name,
  seed,
  size = 52
}: {
  name: string
  seed?: string
  size?: number
}): React.JSX.Element {
  const art = letterTileColors(seed ?? name)
  return (
    <div
      className="icon-tile"
      style={{
        width: '100%',
        height: '100%',
        fontSize: Math.round(size * 0.42),
        background: `linear-gradient(145deg, ${art.from}, ${art.to})`
      }}
    >
      {instanceInitial(name)}
    </div>
  )
}





const STATUS_LABEL: Record<InstanceStatus, string> = {
  idle: 'Ready',
  preparing: 'Preparing',
  downloading: 'Downloading',
  installing: 'Installing',
  launching: 'Launching',
  running: 'Running',
  crashed: 'Crashed',
  error: 'Error'
}

const BUSY: InstanceStatus[] = ['preparing', 'downloading', 'installing', 'launching']

export function statusLabel(status: InstanceStatus): string {
  return STATUS_LABEL[status]
}

export function isBusy(status: InstanceStatus): boolean {
  return BUSY.includes(status)
}





export function InstanceCard({
  instance,
  onOpen,
  onPlay,
  onStop,
  onContextMenu,
  onToggleFavorite
}: {
  instance: InstanceSummary
  onOpen: () => void
  onPlay: () => void
  onStop: () => void
  onContextMenu: (event: React.MouseEvent) => void
  onToggleFavorite: () => void
}): React.JSX.Element {
  const { iconUrl, backgroundUrl } = useInstanceImages(instance)
  const art = artworkColors(instance.id + instance.name)
  const status = instance.status
  const running = status === 'running'
  const busy = isBusy(status)
  const playtime = formatPlaytime(instance.totalPlaytimeMs)
  const task = useOrbit((state) => state.tasks.find((entry) => entry.instanceId === instance.id && entry.status === 'running'))

  return (
    <motion.article
      className="icard"
      data-running={running}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      onClick={onOpen}
      onContextMenu={onContextMenu}
    >
      <div
        className={`icard__art ${backgroundUrl ? '' : 'icard__art--generated'}`}
        style={backgroundUrl ? undefined : ({ '--art-a': art.a, '--art-b': art.b } as React.CSSProperties)}
      >
        {backgroundUrl && <img src={backgroundUrl} alt="" loading="lazy" />}

        <div className="icard__badges">
          <div className="row gap-2">
            {(running || busy || status === 'crashed') && (
              <span
                className="chip"
                style={{
                  background: 'color-mix(in srgb, var(--bg-base) 62%, transparent)',
                  backdropFilter: 'blur(10px)'
                }}
              >
                <span className="status-dot" data-status={running ? 'running' : status === 'crashed' ? 'crashed' : 'idle'} />
                {STATUS_LABEL[status]}
              </span>
            )}
          </div>

          <button
            className="icard__fav"
            data-on={instance.favorite}
            onClick={(event) => {
              event.stopPropagation()
              onToggleFavorite()
            }}
            aria-label={instance.favorite ? 'Remove from favourites' : 'Add to favourites'}
            type="button"
          >
            <Star size={14} fill={instance.favorite ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      <Tooltip content={running ? 'Stop the game' : busy ? STATUS_LABEL[status] : 'Play'}>
        <button
          className="icard__play"
          data-running={running || undefined}
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation()
            if (running) onStop()
            else onPlay()
          }}
          aria-label={running ? 'Stop' : 'Play'}
          type="button"
        >
          {running ? <Square size={15} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
      </Tooltip>

      <div className="icard__body">
        <InstanceIcon instance={instance} iconUrl={iconUrl} />
        <div className="icard__text">
          <h3 className="icard__name" title={instance.name}>
            {instance.name}
          </h3>
          <div className="icard__meta">
            <b>{instance.minecraftVersion}</b>
            <span>·</span>
            <span className="chip chip--loader" data-loader={instance.loader} style={{ height: 18, padding: '0 7px' }}>
              {LOADER_NAME[instance.loader]}
              {instance.loaderVersion && instance.loader !== 'vanilla'
                ? ` ${shortLoaderVersion(instance.loader, instance.minecraftVersion, instance.loaderVersion)}`
                : ''}
            </span>
          </div>
        </div>
      </div>

      {busy && task ? (
        <div style={{ padding: '0 var(--s-4) var(--s-3)' }}>
          <Progress value={task.progress} />
          <div className="dimmer truncate" style={{ fontSize: 11, marginTop: 6 }}>
            {task.detail || STATUS_LABEL[status]}
          </div>
        </div>
      ) : (
        <div className="icard__foot">
          <span className="icard__stat">
            <Clock3 size={12} />
            {instance.lastPlayed ? formatRelative(instance.lastPlayed) : 'Never played'}
          </span>
          <span className="grow" />
          <span className="icard__stat nums">
            <Timer size={12} />
            {instance.totalPlaytimeMs > 0 ? `${playtime.value}${playtime.unit === 'hours' ? 'h' : 'm'}` : '—'}
          </span>
        </div>
      )}
    </motion.article>
  )
}
