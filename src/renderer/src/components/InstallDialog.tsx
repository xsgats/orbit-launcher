import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleAlert, Package, PlusCircle } from 'lucide-react'
import type { ContentKind, ContentProvider, InstanceSummary, StoreVersion } from '@shared/types'
import { LOADER_NAME, formatBytes, formatDate } from '../lib/format'
import { navigate } from '../lib/router'
import { api, reportError, toast, useOrbit } from '../state/store'
import { Button, Callout, Checkbox, Chip, Combobox, Dialog, Select, Skeleton } from './ui'

const CHANNEL_TONE = {
  release: undefined,
  beta: 'warning',
  alpha: 'danger'
} as const

export interface InstallTarget {
  provider: ContentProvider
  projectId: string
  projectName: string
  kind: ContentKind
  iconUrl?: string | null
}

function fits(version: StoreVersion, instance: InstanceSummary | null, kind: ContentKind): boolean {
  if (!instance) return true
  const loaderMatters = kind === 'mod'
  return (
    version.gameVersions.includes(instance.minecraftVersion) &&
    (!loaderMatters ||
      instance.loader === 'vanilla' ||
      !version.loaders.length ||
      version.loaders.includes(instance.loader))
  )
}

/**
 * One dialog for every "add this to an instance" flow, so the version choice
 * works the same whether it started from a card or a project page.
 */
export function InstallDialog({
  target,
  open,
  onClose,
  defaultInstanceId,
  onInstalled
}: {
  target: InstallTarget | null
  open: boolean
  onClose: () => void
  defaultInstanceId?: string
  onInstalled?: (versionId: string) => void
}): React.JSX.Element {
  const instances = useOrbit((state) => state.instances)

  const [versions, setVersions] = useState<StoreVersion[] | null>(null)
  const [instanceId, setInstanceId] = useState('')
  const [versionId, setVersionId] = useState('')
  const [compatibleOnly, setCompatibleOnly] = useState(true)
  const [withDependencies, setWithDependencies] = useState(true)
  const [busy, setBusy] = useState(false)

  const isModpack = target?.kind === 'modpack'
  const instance = instances.find((entry) => entry.id === instanceId) ?? null

  const load = useCallback(async () => {
    if (!target) return
    setVersions(null)
    try {
      setVersions(await api.store.versions(target.provider, target.projectId))
    } catch (err) {
      reportError('Could not load versions', err)
      setVersions([])
    }
  }, [target?.provider, target?.projectId])

  useEffect(() => {
    if (!open) return
    void load()
    setCompatibleOnly(true)
    setWithDependencies(true)
    setInstanceId(defaultInstanceId || instances[0]?.id || '')
  }, [open, load, defaultInstanceId])

  /* Preselect whatever a one-click install would have chosen. */
  useEffect(() => {
    if (!open || !target || !versions?.length) return
    if (isModpack || !instanceId) {
      setVersionId(versions[0].id)
      return
    }
    let alive = true
    void api.store
      .recommendedVersion(instanceId, target.provider, target.projectId, target.kind)
      .then((recommended) => {
        if (!alive) return
        setVersionId(recommended?.id ?? versions[0].id)
      })
      .catch(() => alive && setVersionId(versions[0].id))
    return () => {
      alive = false
    }
  }, [open, versions, instanceId, isModpack, target?.provider, target?.projectId, target?.kind])

  const shown = useMemo(() => {
    if (!versions) return []
    if (!compatibleOnly || isModpack || !instance) return versions
    const compatible = versions.filter((version) => fits(version, instance, target?.kind ?? 'mod'))
    return compatible.length ? compatible : versions
  }, [versions, compatibleOnly, isModpack, instance, target?.kind])

  const selected = versions?.find((version) => version.id === versionId) ?? null
  const primaryFile = selected?.files.find((file) => file.primary) ?? selected?.files[0] ?? null
  const requiredDeps = selected?.dependencies.filter((dependency) => dependency.type === 'required') ?? []
  const mismatched = selected && instance && !isModpack && !fits(selected, instance, target?.kind ?? 'mod')

  const install = async (): Promise<void> => {
    if (!target || !selected) return
    setBusy(true)
    try {
      if (isModpack) {
        const created = await api.store.installModpack(target.provider, target.projectId, selected.id)
        onClose()
        navigate(`/instances/${created.id}`)
        return
      }
      if (!instanceId) {
        toast('Pick an instance', 'Choose where this should go.', 'warning')
        return
      }
      await api.store.install({
        instanceId,
        provider: target.provider,
        projectId: target.projectId,
        versionId: selected.id,
        kind: target.kind,
        withDependencies
      })
      onInstalled?.(selected.id)
      onClose()
      toast(
        `${target.projectName} installed`,
        `${selected.versionNumber}${instance ? ` → ${instance.name}` : ''}`
      )
    } catch (err) {
      reportError(`Could not install ${target.projectName}`, err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open && Boolean(target)}
      onClose={onClose}
      title={isModpack ? `Install ${target?.projectName ?? ''}` : `Add ${target?.projectName ?? ''}`}
      description={
        isModpack
          ? 'Creates a new instance with the right Minecraft version, loader and every mod the pack ships.'
          : 'Choose a version and where it should go.'
      }
      icon={<PlusCircle size={18} />}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!selected || (!isModpack && !instanceId)}
            onClick={() => void install()}
          >
            {isModpack ? 'Create instance' : 'Install'}
          </Button>
        </>
      }
    >
      <div className="col gap-4" style={{ paddingBottom: 8 }}>
        {!isModpack && instances.length === 0 ? (
          <Callout tone="warning" icon={<CircleAlert size={15} />}>
            You have no instances yet. Create one first, then come back.
          </Callout>
        ) : (
          <>
            {!isModpack && (
              <Select
                label="Install into"
                value={instanceId}
                onChange={setInstanceId}
                options={instances.map((entry) => ({
                  value: entry.id,
                  label: `${entry.name} — ${entry.minecraftVersion} ${LOADER_NAME[entry.loader]}`
                }))}
              />
            )}

            {versions === null ? (
              <div className="col gap-2">
                <Skeleton height={13} width="30%" />
                <Skeleton height={36} />
              </div>
            ) : versions.length === 0 ? (
              <Callout tone="warning" icon={<CircleAlert size={15} />}>
                This project has no published files.
              </Callout>
            ) : (
              <>
                <Combobox
                  label="Version"
                  value={versionId}
                  onChange={setVersionId}
                  searchPlaceholder="Search versions…"
                  options={shown.map((version) => ({
                    value: version.id,
                    label: version.versionNumber || version.name,
                    hint:
                      version.channel === 'release'
                        ? version.gameVersions.slice(0, 2).join(', ')
                        : `${version.channel} · ${version.gameVersions.slice(0, 2).join(', ')}`
                  }))}
                />

                {!isModpack && instance && (
                  <Checkbox
                    checked={compatibleOnly}
                    onChange={setCompatibleOnly}
                    label={`Only show versions for ${instance.minecraftVersion}${
                      instance.loader === 'vanilla' ? '' : ` · ${LOADER_NAME[instance.loader]}`
                    }`}
                  />
                )}
              </>
            )}

            {selected && (
              <div className="surface" style={{ padding: 'var(--s-4)' }}>
                <div className="row between gap-3">
                  <span className="t-small truncate" style={{ fontWeight: 560 }}>
                    {selected.name}
                  </span>
                  <Chip tone={CHANNEL_TONE[selected.channel]}>{selected.channel}</Chip>
                </div>
                <div className="dimmer" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                  {formatDate(selected.datePublished)}
                  {primaryFile ? ` · ${formatBytes(primaryFile.sizeBytes)}` : ''}
                  {selected.loaders.length
                    ? ` · ${selected.loaders.map((loader) => LOADER_NAME[loader] ?? loader).join(', ')}`
                    : ''}
                  <br />
                  {selected.gameVersions.slice(0, 8).join(', ')}
                  {selected.gameVersions.length > 8 ? '…' : ''}
                </div>
              </div>
            )}

            {mismatched && (
              <Callout tone="warning" icon={<CircleAlert size={15} />}>
                This file does not list Minecraft {instance?.minecraftVersion}
                {instance && instance.loader !== 'vanilla' ? ` with ${LOADER_NAME[instance.loader]}` : ''}. It may
                fail to load.
              </Callout>
            )}

            {!isModpack && requiredDeps.length > 0 && (
              <Checkbox
                checked={withDependencies}
                onChange={setWithDependencies}
                label={`Also install ${requiredDeps.length} required ${
                  requiredDeps.length === 1 ? 'dependency' : 'dependencies'
                }`}
              />
            )}

            {selected?.changelog && (
              <details>
                <summary className="t-small dim" style={{ cursor: 'pointer', marginBottom: 8 }}>
                  Changelog
                </summary>
                <div
                  className="t-small dim selectable"
                  style={{ maxHeight: 180, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
                >
                  {selected.changelog.replace(/<[^>]+>/g, '').trim()}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </Dialog>
  )
}

export { Package }
