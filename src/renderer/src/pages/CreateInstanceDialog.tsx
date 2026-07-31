import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CircleAlert, ImagePlus, Loader2, Sparkles } from 'lucide-react'
import type { LoaderType, LoaderVersion, MinecraftVersionType } from '@shared/types'
import { LetterTile } from '../components/InstanceCard'
import { Button, Callout, Checkbox, Combobox, Dialog, Segmented, TextField } from '../components/ui'
import { LOADER_NAME, shortLoaderVersion } from '../lib/format'
import { navigate } from '../lib/router'
import { api, reportError, toast, useOrbit } from '../state/store'

const LOADERS: LoaderType[] = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge']

const LOADER_BLURB: Record<LoaderType, string> = {
  vanilla: 'Pure Minecraft, exactly as Mojang ships it.',
  fabric: 'Lightweight and fast-moving. The usual home for performance mods.',
  quilt: 'A Fabric-compatible fork with a richer mod API.',
  forge: 'The long-standing loader behind most large modpacks.',
  neoforge: 'The community continuation of Forge for 1.20.2 and newer.'
}

export function CreateInstanceDialog({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const versions = useOrbit((state) => state.minecraftVersions)
  const refreshInstances = useOrbit((state) => state.refreshInstances)

  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [channel, setChannel] = useState<'release' | 'snapshot' | 'old'>('release')
  const [minecraftVersion, setMinecraftVersion] = useState('')
  const [loader, setLoader] = useState<LoaderType>('vanilla')
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[] | null>(null)
  const [loaderVersion, setLoaderVersion] = useState<string | null>(null)
  const [supported, setSupported] = useState<Set<string> | null>(null)
  const [iconPath, setIconPath] = useState<string | null>(null)
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  const [installNow, setInstallNow] = useState(true)
  const [busy, setBusy] = useState(false)


  useEffect(() => {
    if (!open) return
    setName('')
    setNameTouched(false)
    setChannel('release')
    setLoader('vanilla')
    setLoaderVersion(null)
    setIconPath(null)
    setIconPreview(null)
    setInstallNow(true)
    const latest = versions.find((version) => version.type === 'release')
    setMinecraftVersion(latest?.id ?? versions[0]?.id ?? '')
  }, [open, versions])


  useEffect(() => {
    if (!open || loader === 'vanilla') {
      setSupported(null)
      return
    }
    let alive = true
    setSupported(null)
    void api.versions
      .loaderSupportedMinecraft(loader)
      .then((list) => alive && setSupported(new Set(list)))
      .catch(() => alive && setSupported(new Set()))
    return () => {
      alive = false
    }
  }, [open, loader])


  useEffect(() => {
    if (!open || loader === 'vanilla' || !minecraftVersion) {
      setLoaderVersions(null)
      setLoaderVersion(null)
      return
    }
    let alive = true
    setLoaderVersions(null)
    void api.versions
      .loader(loader, minecraftVersion)
      .then((list) => {
        if (!alive) return
        setLoaderVersions(list)
        setLoaderVersion(list.find((entry) => entry.recommended)?.id ?? list[0]?.id ?? null)
      })
      .catch(() => {
        if (alive) {
          setLoaderVersions([])
          setLoaderVersion(null)
        }
      })
    return () => {
      alive = false
    }
  }, [open, loader, minecraftVersion])

  const versionOptions = useMemo(
    () =>
      versions
        .filter((version) => {
          if (channel === 'release') return version.type === 'release'
          if (channel === 'snapshot') return version.type === 'snapshot'
          return version.type === 'old_beta' || version.type === 'old_alpha'
        })
        .map((version) => ({
          value: version.id,
          label: version.id,
          hint:
            loader !== 'vanilla' && supported && !supported.has(version.id)
              ? `no ${LOADER_NAME[loader]}`
              : new Date(version.releaseTime).getFullYear().toString(),
          disabled: loader !== 'vanilla' && Boolean(supported) && !supported!.has(version.id)
        })),
    [versions, channel, loader, supported]
  )

  const versionSupported = loader === 'vanilla' || !supported || supported.has(minecraftVersion)
  const suggestedName = useMemo(() => {
    if (!minecraftVersion) return ''
    return loader === 'vanilla' ? minecraftVersion : `${LOADER_NAME[loader]} ${minecraftVersion}`
  }, [loader, minecraftVersion])

  const effectiveName = nameTouched && name.trim() ? name.trim() : suggestedName

  const pickIcon = async (): Promise<void> => {
    const path = await api.app.pickFile(
      [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      'Choose an instance image'
    )
    if (!path) return
    setIconPath(path)
    setIconPreview(await api.app.readImageAsDataUrl(path))
  }

  const create = async (): Promise<void> => {
    if (!effectiveName || !minecraftVersion) return
    setBusy(true)
    try {
      const selected = versions.find((version) => version.id === minecraftVersion)
      const instance = await api.instances.create({
        name: effectiveName,
        minecraftVersion,
        minecraftVersionType: (selected?.type ?? 'release') as MinecraftVersionType,
        loader,
        loaderVersion
      })
      if (iconPath) await api.instances.setIconFromFile(instance.id, iconPath)
      await refreshInstances()
      onClose()
      toast('Instance created', effectiveName)
      navigate(`/instances/${instance.id}`)
      if (installNow) {
        api.instances.ensureInstalled(instance.id).catch((err) => reportError('Install failed', err))
      }
    } catch (err) {
      reportError('Could not create the instance', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New instance"
      description="Pick a Minecraft version and a mod loader. Everything else can be changed later."
      width="wide"
      icon={<Sparkles size={18} />}
      footer={
        <>
          <Checkbox checked={installNow} onChange={setInstallNow} label="Download files now" />
          <span className="grow" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!minecraftVersion || !versionSupported}
            onClick={() => void create()}
          >
            Create instance
          </Button>
        </>
      }
    >
      <div className="col gap-5" style={{ paddingBottom: 8 }}>
        { }
        <div className="row gap-4" style={{ alignItems: 'flex-end' }}>
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: 'var(--r-md)',
              overflow: 'hidden',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              flexShrink: 0
            }}
          >
            {iconPath ? (
              <img src={iconPreview ?? undefined} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <LetterTile name={effectiveName || 'New instance'} size={62} />
            )}
          </div>

          <TextField
            className="grow"
            label="Name"
            placeholder={suggestedName || 'My instance'}
            value={nameTouched ? name : ''}
            onChange={(event) => {
              setName(event.target.value)
              setNameTouched(true)
            }}
          />

          <div className="row gap-2">
            <Button icon={<ImagePlus size={15} />} onClick={() => void pickIcon()}>
              {iconPath ? 'Change' : 'Choose image'}
            </Button>
            {iconPath && (
              <Button
                variant="ghost"
                onClick={() => {
                  setIconPath(null)
                  setIconPreview(null)
                }}
              >
                Remove
              </Button>
            )}
          </div>
        </div>

        {!iconPath && (
          <p className="field__hint" style={{ marginTop: -12 }}>
            No image chosen — the instance will use the first letter of its name.
          </p>
        )}

        { }
        <div>
          <div className="filter-group__title">Mod loader</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 8 }}>
            {LOADERS.map((option) => (
              <button
                key={option}
                onClick={() => setLoader(option)}
                type="button"
                style={{
                  padding: '11px 12px',
                  borderRadius: 'var(--r-md)',
                  textAlign: 'left',
                  background: loader === option ? 'var(--accent-a08)' : 'var(--surface-1)',
                  border: `1px solid ${loader === option ? 'var(--accent-a40)' : 'var(--border-subtle)'}`,
                  transition: 'all var(--d-fast) var(--ease-out)'
                }}
              >
                <div className="row between gap-2">
                  <span
                    className="t-small"
                    style={{ fontWeight: 600, color: `var(--loader-${option})` }}
                  >
                    {LOADER_NAME[option]}
                  </span>
                  {loader === option && <Check size={14} style={{ color: 'var(--accent)' }} />}
                </div>
              </button>
            ))}
          </div>
          <p className="field__hint" style={{ marginTop: 8 }}>
            {LOADER_BLURB[loader]}
          </p>
        </div>

        { }
        <div>
          <div className="row between gap-3" style={{ marginBottom: 10 }}>
            <div className="filter-group__title" style={{ margin: 0 }}>
              Minecraft version
            </div>
            <Segmented
              value={channel}
              onChange={setChannel}
              options={[
                { value: 'release', label: 'Releases' },
                { value: 'snapshot', label: 'Snapshots' },
                { value: 'old', label: 'Historic' }
              ]}
            />
          </div>

          <Combobox
            value={minecraftVersion}
            onChange={setMinecraftVersion}
            options={versionOptions}
            placeholder="Choose a version"
            searchPlaceholder="Search versions…"
            emptyText="No versions match"
          />
        </div>

        <AnimatePresence initial={false}>
          {loader !== 'vanilla' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div className="filter-group__title">{LOADER_NAME[loader]} build</div>
              {loaderVersions === null ? (
                <div className="row gap-2 dimmer t-small" style={{ padding: '8px 0' }}>
                  <Loader2 size={14} className="spin" />
                  Loading builds for {minecraftVersion}…
                </div>
              ) : loaderVersions.length === 0 ? (
                <Callout tone="warning" icon={<CircleAlert size={15} />}>
                  {LOADER_NAME[loader]} has no build for Minecraft {minecraftVersion}. Pick another version.
                </Callout>
              ) : (
                <Combobox
                  value={loaderVersion ?? ''}
                  onChange={setLoaderVersion}
                  placeholder={`Choose a ${LOADER_NAME[loader]} build`}
                  searchPlaceholder="Search builds…"
                  options={loaderVersions.map((version) => ({
                    value: version.id,
                    label: shortLoaderVersion(loader, minecraftVersion, version.id),
                    hint: version.recommended ? 'recommended' : version.stable ? undefined : 'beta'
                  }))}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!versionSupported && (
          <Callout tone="warning" icon={<CircleAlert size={15} />}>
            {LOADER_NAME[loader]} does not support Minecraft {minecraftVersion}.
          </Callout>
        )}
      </div>
    </Dialog>
  )
}
