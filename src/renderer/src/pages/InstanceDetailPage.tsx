import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  Boxes,
  Camera,
  Clock3,
  Ellipsis,
  FolderOpen,
  Globe2,
  Image,
  Layers,
  Play,
  ScrollText,
  Settings2,
  Square,
  Star,
  Sun,
  Timer
} from 'lucide-react'
import type { ContentKind, InstanceSummary } from '@shared/types'
import { InstanceIcon, isBusy, statusLabel, useInstanceImages } from '../components/InstanceCard'
import { Button, Chip, IconButton, Progress, Skeleton, Tabs, useAnchoredMenu } from '../components/ui'
import { LOADER_NAME, artworkColors, formatDuration, formatRelative, shortLoaderVersion } from '../lib/format'
import { useInstanceActions } from '../lib/instanceActions'
import { navigate, setQueryParam, useQueryParam } from '../lib/router'
import { api, useOrbit } from '../state/store'
import { OverviewTab } from './instance/OverviewTab'
import { ContentTab } from './instance/ContentTab'
import { WorldsTab } from './instance/WorldsTab'
import { ScreenshotsTab } from './instance/ScreenshotsTab'
import { LogsTab } from './instance/LogsTab'
import { InstanceSettingsTab } from './instance/InstanceSettingsTab'
import { BackupsTab } from './instance/BackupsTab'

type TabKey =
  | 'overview'
  | 'mods'
  | 'resourcepacks'
  | 'shaders'
  | 'datapacks'
  | 'worlds'
  | 'screenshots'
  | 'logs'
  | 'backups'
  | 'settings'

export function InstanceDetailPage({ instanceId }: { instanceId: string }): React.JSX.Element {
  const instances = useOrbit((state) => state.instances)
  const statuses = useOrbit((state) => state.statuses)
  const actions = useInstanceActions()
  const anchorMenu = useAnchoredMenu()
  const tabParam = useQueryParam('tab', 'overview') as TabKey
  const [modCount, setModCount] = useState<number | null>(null)

  const instance = useMemo<InstanceSummary | null>(() => {
    const found = instances.find((entry) => entry.id === instanceId)
    return found ? { ...found, status: statuses[instanceId] ?? 'idle' } : null
  }, [instances, statuses, instanceId])

  const { iconUrl, backgroundUrl } = useInstanceImages(
    instance ?? ({ id: instanceId, icon: { type: 'preset', key: 'orbit' }, background: null } as never)
  )

  const task = useOrbit((state) =>
    state.tasks.find((entry) => entry.instanceId === instanceId && entry.status === 'running')
  )

  useEffect(() => {
    if (!instance) return
    void api.content
      .list(instanceId, 'mod')
      .then((mods) => setModCount(mods.length))
      .catch(() => setModCount(null))
  }, [instanceId, instance?.updatedAt])

  if (!instance) {
    return (
      <div className="page__inner">
        <div className="col gap-4">
          <Skeleton height={220} radius={28} />
          <Skeleton height={40} />
          <Skeleton height={300} radius={18} />
        </div>
      </div>
    )
  }

  const running = instance.status === 'running'
  const busy = isBusy(instance.status)
  const art = artworkColors(instance.id + instance.name)

  const tabs: { value: TabKey; label: string; icon: React.JSX.Element; count?: number }[] = [
    { value: 'overview', label: 'Overview', icon: <Boxes size={14} /> },
    { value: 'mods', label: 'Mods', icon: <Layers size={14} />, count: modCount ?? undefined },
    { value: 'resourcepacks', label: 'Resource packs', icon: <Image size={14} /> },
    { value: 'shaders', label: 'Shaders', icon: <Sun size={14} /> },
    { value: 'datapacks', label: 'Datapacks', icon: <Archive size={14} /> },
    { value: 'worlds', label: 'Worlds', icon: <Globe2 size={14} /> },
    { value: 'screenshots', label: 'Screenshots', icon: <Camera size={14} /> },
    { value: 'logs', label: 'Logs', icon: <ScrollText size={14} /> },
    { value: 'backups', label: 'Backups', icon: <Archive size={14} /> },
    { value: 'settings', label: 'Settings', icon: <Settings2 size={14} /> }
  ]

  const contentKind: ContentKind | null =
    tabParam === 'mods'
      ? 'mod'
      : tabParam === 'resourcepacks'
        ? 'resourcepack'
        : tabParam === 'shaders'
          ? 'shader'
          : tabParam === 'datapacks'
            ? 'datapack'
            : null

  return (
    <div className="page__inner page__inner--wide">
      <button
        className="btn btn--ghost btn--sm"
        style={{ marginBottom: 'var(--s-4)', marginLeft: -8 }}
        onClick={() => navigate('/instances')}
        type="button"
      >
        <ArrowLeft size={14} /> All instances
      </button>

      <section className="hero" style={{ marginBottom: 'var(--s-5)' }}>
        <div
          className="hero__art"
          style={
            backgroundUrl
              ? undefined
              : ({
                  background: `radial-gradient(120% 90% at 14% 8%, ${art.a}, transparent 62%),
                               radial-gradient(110% 100% at 84% 32%, ${art.b}, transparent 60%),
                               linear-gradient(150deg, var(--bg-elevated), var(--bg-base))`
                } as React.CSSProperties)
          }
        >
          {backgroundUrl && <img src={backgroundUrl} alt="" />}
        </div>

        <div className="hero__content">
          <InstanceIcon instance={instance} iconUrl={iconUrl} size={88} className="hero__icon" />

          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row gap-2" style={{ marginBottom: 4 }}>
              {instance.favorite && <Star size={14} fill="#FFC94D" color="#FFC94D" />}
              {instance.group && <span className="t-tiny dimmer">{instance.group}</span>}
            </div>
            <h1 className="hero__title truncate">{instance.name}</h1>
            <div className="hero__chips">
              <Chip>{instance.minecraftVersion}</Chip>
              <Chip loader={instance.loader}>
                {LOADER_NAME[instance.loader]}
                {instance.loaderVersion && instance.loader !== 'vanilla'
                  ? ` ${shortLoaderVersion(instance.loader, instance.minecraftVersion, instance.loaderVersion)}`
                  : ''}
              </Chip>
              <Chip>
                <Clock3 size={11} />
                {instance.lastPlayed ? formatRelative(instance.lastPlayed) : 'Never played'}
              </Chip>
              <Chip>
                <Timer size={11} />
                {formatDuration(instance.totalPlaytimeMs)}
              </Chip>
              {instance.modpack && (
                <Chip tone="accent" title={`From ${instance.modpack.projectName}`}>
                  {instance.modpack.projectName} {instance.modpack.versionName}
                </Chip>
              )}
              {(running || busy || instance.status === 'crashed') && (
                <Chip tone={instance.status === 'crashed' ? 'danger' : running ? 'success' : 'accent'}>
                  <span className="status-dot" data-status={running ? 'running' : instance.status} />
                  {statusLabel(instance.status)}
                </Chip>
              )}
              {instance.tags.map((tag) => (
                <Chip key={tag}>{tag}</Chip>
              ))}
            </div>
          </div>

          <div className="hero__actions">
            <IconButton
              large
              label={instance.favorite ? 'Remove from favourites' : 'Add to favourites'}
              active={instance.favorite}
              onClick={() => void actions.toggleFavorite(instance)}
            >
              <Star size={16} fill={instance.favorite ? 'currentColor' : 'none'} />
            </IconButton>
            <IconButton large label="Open folder" onClick={() => void api.instances.openFolder(instance.id)}>
              <FolderOpen size={16} />
            </IconButton>
            <IconButton
              large
              label="More actions"
              onClick={(event) => anchorMenu(event.currentTarget, actions.buildMenu(instance))}
            >
              <Ellipsis size={16} />
            </IconButton>

            {running ? (
              <Button
                variant="danger"
                size="lg"
                icon={<Square size={15} fill="currentColor" />}
                onClick={() => void actions.stop(instance)}
              >
                Stop
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                loading={busy}
                icon={<Play size={17} fill="currentColor" />}
                onClick={() => void actions.play(instance)}
              >
                {busy ? statusLabel(instance.status) : 'Play'}
              </Button>
            )}
          </div>
        </div>

        {busy && task && (
          <div className="icard__status" style={{ padding: '0 var(--s-7) var(--s-4)' }}>
            <Progress value={task.progress} />
            <div className="dimmer truncate" style={{ fontSize: 11.5, marginTop: 7 }}>
              {task.detail || statusLabel(instance.status)}
            </div>
          </div>
        )}
      </section>

      <div style={{ marginBottom: 'var(--s-5)' }}>
        <Tabs value={tabParam} onChange={(next) => setQueryParam('tab', next)} tabs={tabs} />
      </div>

      <div className="page-enter" key={tabParam}>
        {tabParam === 'overview' && <OverviewTab instance={instance} />}
        {contentKind && <ContentTab instance={instance} kind={contentKind} onCountChange={setModCount} />}
        {tabParam === 'worlds' && <WorldsTab instance={instance} />}
        {tabParam === 'screenshots' && <ScreenshotsTab instance={instance} />}
        {tabParam === 'logs' && <LogsTab instance={instance} />}
        {tabParam === 'backups' && <BackupsTab instance={instance} />}
        {tabParam === 'settings' && <InstanceSettingsTab instance={instance} />}
      </div>

      {actions.dialogs}
    </div>
  )
}
