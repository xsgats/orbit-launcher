import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CircleAlert, Loader2, Package, Search, Sparkles } from 'lucide-react'
import type { LoaderType, LoaderVersion, MinecraftVersionType } from '@shared/types'
import { PRESET_ICON_GLYPHS, PRESET_ICON_KEYS } from '../components/InstanceCard'
import { Logo } from '../components/Logo'
import { Button, Callout, Checkbox, Dialog, Segmented, TextField } from '../components/ui'
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
  const [versionQuery, setVersionQuery] = useState('')
  const [minecraftVersion, setMinecraftVersion] = useState('')
  const [loader, setLoader] = useState<LoaderType>('vanilla')
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[] | null>(null)
  const [loaderVersion, setLoaderVersion] = useState<string | null>(null)
  const [supported, setSupported] = useState<Set<string> | null>(null)
  const [icon, setIcon] = useState('orbit')
  const [installNow, setInstallNow] = useState(true)
  const [busy, setBusy] = useState(false)


  useEffect(() => {
    if (!open) return
    setName('')
    setNameTouched(false)
    setChannel('release')
    setVersionQuery('')
    setLoader('vanilla')
    setLoaderVersion(null)
    setIcon(PRESET_ICON_KEYS[Math.floor(Math.random() * PRESET_ICON_KEYS.length)])
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

  const filteredVersions = useMemo(() => {
    const query = versionQuery.trim().toLowerCase()
    return versions
      .filter((version) => {
        if (channel === 'release' && version.type !== 'release') return false
        if (channel === 'snapshot' && version.type !== 'snapshot') return false
        if (channel === 'old' && version.type !== 'old_beta' && version.type !== 'old_alpha') return false
        if (query && !version.id.toLowerCase().includes(query)) return false
        return true
      })
      .slice(0, 400)
  }, [versions, channel, versionQuery])

  const versionSupported = loader === 'vanilla' || !supported || supported.has(minecraftVersion)
  const suggestedName = useMemo(() => {
    if (!minecraftVersion) return ''
    return loader === 'vanilla' ? minecraftVersion : `${LOADER_NAME[loader]} ${minecraftVersion}`
  }, [loader, minecraftVersion])

  const effectiveName = nameTouched && name.trim() ? name.trim() : suggestedName

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
        loaderVersion,
        icon: { type: 'preset', key: icon }
      })
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
              display: 'grid',
              placeItems: 'center',
              fontSize: 28,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              flexShrink: 0
            }}
          >
            {PRESET_ICON_GLYPHS[icon] || <Logo size={34} glow={false} />}
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
        </div>

        <div>
          <div className="filter-group__title">Icon</div>
          <div className="row wrap gap-2">
            {PRESET_ICON_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setIcon(key)}
                title={key}
                type="button"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 'var(--r-sm)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 18,
                  background: icon === key ? 'var(--accent-a14)' : 'var(--surface-1)',
                  border: `1px solid ${icon === key ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  transition: 'all var(--d-fast) var(--ease-out)'
                }}
              >
                {PRESET_ICON_GLYPHS[key] || <Logo size={21} glow={false} />}
              </button>
            ))}
          </div>
        </div>

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

          <div className="input" style={{ marginBottom: 10 }}>
            <span className="input__affix">
              <Search size={14} />
            </span>
            <input
              value={versionQuery}
              placeholder="Filter versions…"
              onChange={(event) => setVersionQuery(event.target.value)}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
              gap: 6,
              maxHeight: 186,
              overflowY: 'auto',
              padding: 3,
              borderRadius: 'var(--r-md)',
              background: 'var(--surface-inset)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            {filteredVersions.length === 0 && (
              <div className="dimmer t-small" style={{ gridColumn: '1 / -1', padding: 16, textAlign: 'center' }}>
                No versions match that filter.
              </div>
            )}
            {filteredVersions.map((version) => {
              const usable = loader === 'vanilla' || !supported || supported.has(version.id)
              return (
                <button
                  key={version.id}
                  onClick={() => setMinecraftVersion(version.id)}
                  disabled={!usable}
                  title={usable ? version.id : `${LOADER_NAME[loader]} does not support ${version.id}`}
                  type="button"
                  style={{
                    height: 32,
                    borderRadius: 'var(--r-sm)',
                    fontSize: 12,
                    fontWeight: 550,
                    fontVariantNumeric: 'tabular-nums',
                    opacity: usable ? 1 : 0.32,
                    cursor: usable ? 'pointer' : 'not-allowed',
                    color: minecraftVersion === version.id ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                    background: minecraftVersion === version.id ? 'var(--accent)' : 'var(--surface-2)',
                    border: '1px solid var(--border-subtle)',
                    transition: 'all var(--d-fast) var(--ease-out)'
                  }}
                >
                  {version.id}
                </button>
              )
            })}
          </div>
        </div>

        { }
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
                <div className="select">
                  <select value={loaderVersion ?? ''} onChange={(event) => setLoaderVersion(event.target.value)}>
                    {loaderVersions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {shortLoaderVersion(loader, minecraftVersion, version.id)}
                        {version.recommended ? '  ·  recommended' : version.stable ? '' : '  ·  beta'}
                      </option>
                    ))}
                  </select>
                  <span className="select__chevron">
                    <Package size={13} />
                  </span>
                </div>
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
