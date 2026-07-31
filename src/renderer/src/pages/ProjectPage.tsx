import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bug,
  Check,
  CircleAlert,
  Code2,
  Download,
  ExternalLink,
  Globe,
  Heart,
  Package,
  PlusCircle,
  Scale,
  Users
} from 'lucide-react'
import type {
  ContentProvider,
  InstanceSummary,
  LoaderType,
  StoreProjectDetail,
  StoreVersion
} from '@shared/types'
import {
  Button,
  Callout,
  Checkbox,
  Chip,
  Dialog,
  EmptyState,
  Lightbox,
  Select,
  Skeleton,
  Tabs
} from '../components/ui'
import { InstallDialog } from '../components/InstallDialog'
import { LOADER_NAME, formatBytes, formatCount, formatDate, formatRelative } from '../lib/format'
import { navigate } from '../lib/router'
import { api, reportError, toast, useOrbit } from '../state/store'

type TabKey = 'description' | 'versions' | 'gallery'

const CHANNEL_TONE = {
  release: undefined,
  beta: 'warning',
  alpha: 'danger'
} as const

export function ProjectPage({
  provider,
  projectId
}: {
  provider: ContentProvider
  projectId: string
}): React.JSX.Element {
  const instances = useOrbit((state) => state.instances)
  const refreshInstances = useOrbit((state) => state.refreshInstances)

  const [project, setProject] = useState<StoreProjectDetail | null>(null)
  const [versions, setVersions] = useState<StoreVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('description')
  const [preview, setPreview] = useState<string | null>(null)

  const [installOpen, setInstallOpen] = useState(false)
  const [installVersion, setInstallVersion] = useState<StoreVersion | null>(null)
  const [targetInstanceId, setTargetInstanceId] = useState('')
  const [withDependencies, setWithDependencies] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [onlyCompatible, setOnlyCompatible] = useState(true)

  useEffect(() => {
    setProject(null)
    setVersions(null)
    setError(null)
    setTab('description')

    void api.store
      .project(provider, projectId)
      .then(setProject)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))

    void api.store
      .versions(provider, projectId)
      .then(setVersions)
      .catch(() => setVersions([]))
  }, [provider, projectId])

  const isModpack = project?.kind === 'modpack'

  const target = instances.find((entry) => entry.id === targetInstanceId) ?? null

  useEffect(() => {
    if (!targetInstanceId && instances.length) setTargetInstanceId(instances[0].id)
  }, [instances, targetInstanceId])

  const compatibleVersions = useMemo(() => {
    if (!versions) return []
    if (!onlyCompatible || !target || isModpack) return versions
    return versions.filter(
      (version) =>
        version.gameVersions.includes(target.minecraftVersion) &&
        (target.loader === 'vanilla' || !version.loaders.length || version.loaders.includes(target.loader))
    )
  }, [versions, onlyCompatible, target, isModpack])

  const startInstall = (version: StoreVersion): void => {
    setInstallVersion(version)
    setInstallOpen(true)
  }

  const runInstall = async (): Promise<void> => {
    if (!installVersion || !project) return
    setInstalling(true)
    try {
      if (isModpack) {
        const instance = await api.store.installModpack(provider, projectId, installVersion.id)
        await refreshInstances()
        setInstallOpen(false)
        navigate(`/instances/${instance.id}`)
      } else {
        if (!targetInstanceId) {
          toast('Pick an instance', 'Choose where this should be installed.', 'warning')
          return
        }
        await api.store.install({
          instanceId: targetInstanceId,
          provider,
          projectId,
          versionId: installVersion.id,
          kind: project.kind,
          withDependencies
        })
        setInstallOpen(false)
        toast(`${project.name} installed`, target ? `Added to ${target.name}` : undefined)
      }
    } catch (err) {
      reportError('Install failed', err)
    } finally {
      setInstalling(false)
    }
  }

  if (error) {
    return (
      <div className="page__inner">
        <EmptyState
          icon={<CircleAlert size={26} />}
          title="Could not load that project"
          description={error}
          action={<Button onClick={() => navigate('/discover')}>Back to Discover</Button>}
        />
      </div>
    )
  }

  return (
    <div className="page__inner">
      <button
        className="btn btn--ghost btn--sm"
        style={{ marginBottom: 'var(--s-4)', marginLeft: -8 }}
        onClick={() => navigate('/discover')}
        type="button"
      >
        <ArrowLeft size={14} /> Discover
      </button>

      {!project ? (
        <div className="col gap-5">
          <div className="row gap-5">
            <Skeleton width={96} height={96} radius={18} />
            <div className="col gap-3 grow">
              <Skeleton height={26} width="42%" />
              <Skeleton height={13} width="70%" />
              <Skeleton height={13} width="30%" />
            </div>
          </div>
          <Skeleton height={340} radius={18} />
        </div>
      ) : (
        <>
          <section className="panel" style={{ marginBottom: 'var(--s-5)' }}>
            <div className="project-hero">
              {project.iconUrl ? (
                <img className="project-hero__icon" src={project.iconUrl} alt="" />
              ) : (
                <div className="project-hero__icon center">
                  <Package size={32} style={{ color: 'var(--text-tertiary)' }} />
                </div>
              )}

              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row gap-2" style={{ marginBottom: 6 }}>
                  <span className="provider-mark" data-provider={project.provider}>
                    {project.provider === 'modrinth' ? 'Modrinth' : 'CurseForge'}
                  </span>
                  <span className="t-tiny dimmer">{project.kind}</span>
                </div>

                <h1 className="t-display" style={{ fontSize: 27 }}>
                  {project.name}
                </h1>
                <p className="t-small dim" style={{ marginTop: 6, maxWidth: '72ch', lineHeight: 1.55 }}>
                  {project.summary}
                </p>

                <div className="row wrap gap-4" style={{ marginTop: 14, fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                  <span className="row gap-1 nums">
                    <Download size={13} /> {formatCount(project.downloads)} downloads
                  </span>
                  {project.follows > 0 && (
                    <span className="row gap-1 nums">
                      <Heart size={13} /> {formatCount(project.follows)} followers
                    </span>
                  )}
                  <span className="row gap-1">
                    <Users size={13} /> {project.author}
                  </span>
                  {project.license && (
                    <span className="row gap-1">
                      <Scale size={13} /> {project.license}
                    </span>
                  )}
                  <span>Updated {formatRelative(project.updatedAt)}</span>
                </div>

                <div className="row wrap gap-2" style={{ marginTop: 14 }}>
                  {project.loaders.map((loader) => (
                    <Chip key={loader} loader={loader}>
                      {LOADER_NAME[loader as LoaderType] ?? loader}
                    </Chip>
                  ))}
                  {project.displayCategories.slice(0, 5).map((category) => (
                    <Chip key={category}>{category}</Chip>
                  ))}
                  {project.clientSide === 'required' && <Chip tone="accent">Client side</Chip>}
                  {project.serverSide === 'required' && <Chip>Server side</Chip>}
                </div>
              </div>

              <div className="col gap-2" style={{ flexShrink: 0, width: 200 }}>
                {isModpack ? (
                  <Button
                    variant="primary"
                    size="lg"
                    block
                    icon={<PlusCircle size={16} />}
                    disabled={!versions?.length}
                    onClick={() => {
                      const best = compatibleVersions[0] ?? versions?.[0]
                      if (best) startInstall(best)
                    }}
                  >
                    Install pack
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      size="lg"
                      block
                      icon={<PlusCircle size={16} />}
                      disabled={!versions?.length || instances.length === 0}
                      onClick={() => setAddOpen(Boolean(project))}
                    >
                      Add to instance
                    </Button>
                    <span className="dimmer" style={{ fontSize: 11.5, textAlign: 'center', lineHeight: 1.5 }}>
                      Pick a version and where it goes
                    </span>
                  </>
                )}

                {!isModpack && instances.length === 0 && (
                  <span className="dimmer" style={{ fontSize: 11.5, textAlign: 'center' }}>
                    Create an instance first
                  </span>
                )}

                {project.links.website && (
                  <Button block icon={<Globe size={14} />} onClick={() => void api.app.openExternal(project.links.website!)}>
                    Website
                  </Button>
                )}
                {project.links.source && (
                  <Button block icon={<Code2 size={14} />} onClick={() => void api.app.openExternal(project.links.source!)}>
                    Source
                  </Button>
                )}
                {project.links.issues && (
                  <Button block icon={<Bug size={14} />} onClick={() => void api.app.openExternal(project.links.issues!)}>
                    Report a bug
                  </Button>
                )}
              </div>
            </div>
          </section>

          <div style={{ marginBottom: 'var(--s-5)' }}>
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'description', label: 'Description' },
                { value: 'versions', label: 'Versions', count: versions?.length },
                { value: 'gallery', label: 'Gallery', count: project.gallery.length }
              ]}
            />
          </div>

          {tab === 'description' && (
            <div className="panel">
              <div className="panel__body">
                <div
                  className="markdown-body selectable"
                  dangerouslySetInnerHTML={{ __html: renderBody(project) }}
                  onClick={(event) => {
                    const anchor = (event.target as HTMLElement).closest('a')
                    if (anchor?.getAttribute('href')?.startsWith('http')) {
                      event.preventDefault()
                      void api.app.openExternal(anchor.getAttribute('href')!)
                    }
                  }}
                />
              </div>
            </div>
          )}

          {tab === 'gallery' &&
            (project.gallery.length === 0 ? (
              <EmptyState icon={<Package size={26} />} title="No screenshots" description="This project has not published a gallery." />
            ) : (
              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--s-4)' }}
              >
                {project.gallery.map((image) => (
                  <figure key={image.url} className="surface" style={{ overflow: 'hidden' }}>
                    <img
                      src={image.url}
                      alt={image.title ?? ''}
                      loading="lazy"
                      style={{ width: '100%', height: 182, objectFit: 'cover', cursor: 'zoom-in' }}
                      onClick={() => setPreview(image.url)}
                    />
                    {(image.title || image.description) && (
                      <figcaption style={{ padding: 'var(--s-3) var(--s-4)' }}>
                        {image.title && <div className="t-small" style={{ fontWeight: 550 }}>{image.title}</div>}
                        {image.description && (
                          <div className="dimmer" style={{ fontSize: 12, marginTop: 3 }}>
                            {image.description}
                          </div>
                        )}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            ))}

          {tab === 'versions' && (
            <div className="col gap-4">
              {!isModpack && instances.length > 0 && (
                <div className="row gap-3 wrap surface" style={{ padding: 'var(--s-3) var(--s-4)' }}>
                  <span className="t-small dim">Target instance</span>
                  <Select
                    value={targetInstanceId}
                    onChange={setTargetInstanceId}
                    small
                    options={instances.map((instance) => ({
                      value: instance.id,
                      label: `${instance.name} — ${instance.minecraftVersion} ${LOADER_NAME[instance.loader]}`
                    }))}
                  />
                  <Checkbox checked={onlyCompatible} onChange={setOnlyCompatible} label="Compatible only" />
                </div>
              )}

              {versions === null ? (
                <div className="col gap-2">
                  {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} height={62} radius={13} />
                  ))}
                </div>
              ) : compatibleVersions.length === 0 ? (
                <EmptyState
                  icon={<Package size={26} />}
                  title="No compatible versions"
                  description={
                    target
                      ? `Nothing published for Minecraft ${target.minecraftVersion} with ${LOADER_NAME[target.loader]}. Turn off "Compatible only" to see everything.`
                      : 'This project has no published files.'
                  }
                />
              ) : (
                <div className="surface" style={{ padding: 6 }}>
                  {compatibleVersions.slice(0, 80).map((version) => {
                    const file = version.files.find((entry) => entry.primary) ?? version.files[0]
                    const compatible =
                      !target ||
                      isModpack ||
                      (version.gameVersions.includes(target.minecraftVersion) &&
                        (target.loader === 'vanilla' || !version.loaders.length || version.loaders.includes(target.loader)))

                    return (
                      <div className="crow" key={version.id}>
                        <div className="crow__text">
                          <div className="crow__name">
                            <span className="truncate">{version.name}</span>
                            <Chip tone={CHANNEL_TONE[version.channel]}>{version.channel}</Chip>
                            {!compatible && (
                              <Chip tone="warning">
                                <CircleAlert size={10} /> May not fit
                              </Chip>
                            )}
                          </div>
                          <div className="crow__desc">
                            {version.gameVersions.slice(0, 6).join(', ')}
                            {version.gameVersions.length > 6 ? '…' : ''}
                            {version.loaders.length > 0 &&
                              ` · ${version.loaders.map((loader) => LOADER_NAME[loader] ?? loader).join(', ')}`}
                          </div>
                        </div>

                        <span className="dimmer nums" style={{ fontSize: 11.5, width: 84, textAlign: 'right' }}>
                          {file ? formatBytes(file.sizeBytes) : '—'}
                        </span>
                        <span className="dimmer nums" style={{ fontSize: 11.5, width: 76, textAlign: 'right' }}>
                          {formatCount(version.downloads)}
                        </span>
                        <span className="dimmer" style={{ fontSize: 11.5, width: 96, textAlign: 'right' }}>
                          {formatDate(version.datePublished)}
                        </span>

                        <Button size="sm" variant="secondary" onClick={() => startInstall(version)}>
                          Install
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <InstallDialog
        target={
          project
            ? {
                provider,
                projectId,
                projectName: project.name,
                kind: project.kind,
                iconUrl: project.iconUrl
              }
            : null
        }
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultInstanceId={targetInstanceId || undefined}
      />

      <Lightbox src={preview} onClose={() => setPreview(null)} />

      <Dialog
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        title={isModpack ? 'Install modpack' : `Install ${project?.name ?? ''}`}
        description={
          isModpack
            ? 'Orbit creates a new instance with the right Minecraft version, loader and every mod the pack ships.'
            : 'Pick which instance receives this file.'
        }
        icon={<PlusCircle size={18} />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setInstallOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={installing}
              disabled={!isModpack && !targetInstanceId}
              onClick={() => void runInstall()}
            >
              {isModpack ? 'Create instance' : 'Install'}
            </Button>
          </>
        }
      >
        <div className="col gap-4" style={{ paddingBottom: 8 }}>
          {installVersion && (
            <div className="surface" style={{ padding: 'var(--s-4)' }}>
              <div className="row between gap-3">
                <span className="t-small" style={{ fontWeight: 560 }}>
                  {installVersion.name}
                </span>
                <Chip tone={CHANNEL_TONE[installVersion.channel]}>{installVersion.channel}</Chip>
              </div>
              <div className="dimmer" style={{ fontSize: 12, marginTop: 6 }}>
                {installVersion.gameVersions.slice(0, 5).join(', ')}
                {installVersion.loaders.length > 0 &&
                  ` · ${installVersion.loaders.map((loader) => LOADER_NAME[loader] ?? loader).join(', ')}`}
                {installVersion.files[0] && ` · ${formatBytes(installVersion.files[0].sizeBytes)}`}
              </div>
            </div>
          )}

          {!isModpack && (
            <>
              <Select
                label="Install into"
                value={targetInstanceId}
                onChange={setTargetInstanceId}
                options={instances.map((instance) => ({
                  value: instance.id,
                  label: `${instance.name} — ${instance.minecraftVersion} ${LOADER_NAME[instance.loader]}`
                }))}
              />

              {installVersion && target && !isCompatible(installVersion, target) && (
                <Callout tone="warning" icon={<CircleAlert size={15} />}>
                  This file does not list Minecraft {target.minecraftVersion} with {LOADER_NAME[target.loader]}. It may
                  fail to load.
                </Callout>
              )}

              {installVersion && installVersion.dependencies.some((dependency) => dependency.type === 'required') && (
                <Checkbox
                  checked={withDependencies}
                  onChange={setWithDependencies}
                  label={`Also install ${
                    installVersion.dependencies.filter((dependency) => dependency.type === 'required').length
                  } required dependencies`}
                />
              )}
            </>
          )}

          {installVersion?.changelog && (
            <details>
              <summary className="t-small dim" style={{ cursor: 'pointer', marginBottom: 8 }}>
                Changelog
              </summary>
              <div
                className="markdown-body selectable"
                style={{ maxHeight: 220, overflowY: 'auto', fontSize: 12.5 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(installVersion.changelog) }}
              />
            </details>
          )}
        </div>
      </Dialog>
    </div>
  )
}

function isCompatible(version: StoreVersion, instance: InstanceSummary): boolean {
  return (
    version.gameVersions.includes(instance.minecraftVersion) &&
    (instance.loader === 'vanilla' || !version.loaders.length || version.loaders.includes(instance.loader))
  )
}





function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}





function renderBody(project: StoreProjectDetail): string {
  if (project.provider === 'curseforge') return sanitizeHtml(project.bodyHtml)
  return renderMarkdown(project.bodyHtml)
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/ on\w+="[^"]*"/gi, '')
    .replace(/ on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

function renderMarkdown(markdown: string): string {
  const blocks: string[] = []
  let text = markdown.replace(/```([\s\S]*?)```/g, (_match, code: string) => {
    blocks.push(`<pre><code>${escapeHtml(code.replace(/^\w*\n/, ''))}</code></pre>`)
    return `@@BLOCK${blocks.length - 1}@@`
  })


  const rawHtml: string[] = []
  text = text.replace(/<(img|br|hr|p|div|center|a|h[1-6]|table|tbody|tr|td|th|ul|ol|li|strong|em|b|i)[\s\S]*?>/gi, (match) => {
    rawHtml.push(sanitizeHtml(match))
    return `@@HTML${rawHtml.length - 1}@@`
  })
  text = text.replace(/<\/(img|br|hr|p|div|center|a|h[1-6]|table|tbody|tr|td|th|ul|ol|li|strong|em|b|i)>/gi, (match) => {
    rawHtml.push(match)
    return `@@HTML${rawHtml.length - 1}@@`
  })

  text = escapeHtml(text)

  text = text
    .replace(/^###### (.*)$/gm, '<h6>$1</h6>')
    .replace(/^##### (.*)$/gm, '<h5>$1</h5>')
    .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---+$/gm, '<hr>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^[-*+] (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')

  text = text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const trimmed = paragraph.trim()
      if (!trimmed) return ''
      if (/^<(h\d|ul|ol|pre|blockquote|hr|table|div|p|img|center)/.test(trimmed)) return trimmed
      if (/^@@(BLOCK|HTML)\d+@@$/.test(trimmed)) return trimmed
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`
    })
    .join('\n')

  text = text.replace(/@@BLOCK(\d+)@@/g, (_match, index: string) => blocks[Number(index)] ?? '')
  text = text.replace(/@@HTML(\d+)@@/g, (_match, index: string) => rawHtml[Number(index)] ?? '')

  return text
}

export { Check, ExternalLink }
