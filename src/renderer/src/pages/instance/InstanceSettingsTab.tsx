import { useEffect, useMemo, useState } from 'react'
import { Cpu, Image, ImageOff, RotateCcw, Save, Sparkles, Terminal, Wrench } from 'lucide-react'
import type { InstanceSettings, InstanceSummary, LoaderType, LoaderVersion } from '@shared/types'
import { LetterTile, useInstanceImages } from '../../components/InstanceCard'
import {
  Button,
  Callout,
  Chip,
  Select,
  Slider,
  Switch,
  TextArea,
  TextField
} from '../../components/ui'
import { LOADER_NAME, shortLoaderVersion } from '../../lib/format'
import { api, reportError, toast, useOrbit } from '../../state/store'

const LOADERS: LoaderType[] = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge']

export function InstanceSettingsTab({ instance }: { instance: InstanceSummary }): React.JSX.Element {
  const globals = useOrbit((state) => state.settings)
  const javaRuntimes = useOrbit((state) => state.javaRuntimes)
  const refreshInstances = useOrbit((state) => state.refreshInstances)

  const [name, setName] = useState(instance.name)
  const [group, setGroup] = useState(instance.group ?? '')
  const [tags, setTags] = useState(instance.tags.join(', '))
  const { iconUrl } = useInstanceImages(instance)
  const [settings, setSettings] = useState<InstanceSettings>(instance.settings)
  const [dirty, setDirty] = useState(false)

  const [loader, setLoader] = useState<LoaderType>(instance.loader)
  const [loaderVersion, setLoaderVersion] = useState<string | null>(instance.loaderVersion)
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[] | null>(null)
  const [savingVersion, setSavingVersion] = useState(false)

  useEffect(() => {
    setName(instance.name)
    setGroup(instance.group ?? '')
    setTags(instance.tags.join(', '))
    setSettings(instance.settings)
    setLoader(instance.loader)
    setLoaderVersion(instance.loaderVersion)
    setDirty(false)
  }, [instance.id, instance.updatedAt])

  useEffect(() => {
    if (loader === 'vanilla') {
      setLoaderVersions([])
      return
    }
    let alive = true
    setLoaderVersions(null)
    void api.versions
      .loader(loader, instance.minecraftVersion)
      .then((list) => {
        if (!alive) return
        setLoaderVersions(list)
        if (!list.some((entry) => entry.id === loaderVersion)) {
          setLoaderVersion(list.find((entry) => entry.recommended)?.id ?? list[0]?.id ?? null)
        }
      })
      .catch(() => alive && setLoaderVersions([]))
    return () => {
      alive = false
    }
  }, [loader, instance.minecraftVersion])

  const patch = <K extends keyof InstanceSettings>(key: K, value: InstanceSettings[K]): void => {
    setSettings((current) => ({ ...current, [key]: value }))
    setDirty(true)
  }

  const maxMemoryCeiling = useMemo(() => 32768, [])

  const save = async (): Promise<void> => {
    try {
      await api.instances.update(instance.id, {
        name: name.trim() || instance.name,
        group: group.trim() || null,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        settings
      })
      await refreshInstances()
      setDirty(false)
      toast('Instance updated')
    } catch (err) {
      reportError('Could not save', err)
    }
  }

  const changeLoader = async (): Promise<void> => {
    setSavingVersion(true)
    try {
      await api.instances.changeVersion(instance.id, instance.minecraftVersion, loader, loaderVersion)
      await refreshInstances()
      toast('Loader changed', 'Game files will be prepared on the next launch.')
    } catch (err) {
      reportError('Could not change the loader', err)
    } finally {
      setSavingVersion(false)
    }
  }

  const loaderChanged = loader !== instance.loader || loaderVersion !== instance.loaderVersion

  return (
    <div className="col gap-6" style={{ maxWidth: 880 }}>
      { }
      <section className="panel">
        <div className="panel__head">
          <Sparkles size={16} style={{ color: 'var(--text-tertiary)' }} />
          <span className="panel__title">Identity</span>
          {dirty && (
            <Button size="sm" variant="primary" icon={<Save size={13} />} onClick={() => void save()}>
              Save changes
            </Button>
          )}
        </div>
        <div className="panel__body col gap-5">
          <div className="row gap-4" style={{ alignItems: 'flex-end' }}>
            <TextField
              className="grow"
              label="Name"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setDirty(true)
              }}
            />
            <TextField
              className="grow"
              label="Group"
              placeholder="Ungrouped"
              value={group}
              onChange={(event) => {
                setGroup(event.target.value)
                setDirty(true)
              }}
            />
          </div>

          <TextField
            label="Tags"
            hint="Comma separated. Tags show up as filters on the Instances page."
            placeholder="performance, survival, with friends"
            value={tags}
            onChange={(event) => {
              setTags(event.target.value)
              setDirty(true)
            }}
          />

          <div>
            <div className="field__label" style={{ marginBottom: 8 }}>
              Icon
            </div>
            <div className="row gap-3">
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 'var(--r-md)',
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                  flexShrink: 0
                }}
              >
                {iconUrl ? (
                  <img src={iconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <LetterTile name={name || instance.name} seed={instance.id + instance.name} size={56} />
                )}
              </div>

              <div className="col gap-2">
                <div className="row gap-2">
                  <Button
                    size="sm"
                    icon={<Image size={14} />}
                    onClick={async () => {
                      const path = await api.app.pickFile(
                        [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
                        'Choose an image'
                      )
                      if (!path) return
                      await api.instances.setIconFromFile(instance.id, path)
                      await refreshInstances()
                      toast('Icon updated')
                    }}
                  >
                    {iconUrl ? 'Change image' : 'Choose image'}
                  </Button>
                  {iconUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await api.instances.update(instance.id, { icon: { type: 'preset', key: 'letter' } })
                        await refreshInstances()
                        toast('Icon reset')
                      }}
                    >
                      Use letter
                    </Button>
                  )}
                </div>
                <span className="field__hint">
                  {iconUrl ? 'A custom image is in use.' : 'Falls back to the first letter of the name.'}
                </span>
              </div>
            </div>
          </div>

          <div className="row gap-2">
            <Button
              icon={<Image size={14} />}
              onClick={async () => {
                const path = await api.app.pickFile(
                  [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
                  'Choose a background'
                )
                if (!path) return
                await api.instances.setBackgroundFromFile(instance.id, path)
                await refreshInstances()
                toast('Background updated')
              }}
            >
              Set card background
            </Button>
            {instance.background && (
              <Button
                variant="ghost"
                icon={<ImageOff size={14} />}
                onClick={async () => {
                  await api.instances.clearBackground(instance.id)
                  await refreshInstances()
                }}
              >
                Remove background
              </Button>
            )}
          </div>
        </div>
      </section>

      { }
      <section className="panel">
        <div className="panel__head">
          <Wrench size={16} style={{ color: 'var(--text-tertiary)' }} />
          <span className="panel__title">Minecraft &amp; loader</span>
        </div>
        <div className="panel__body col gap-4">
          <div className="row gap-3 wrap">
            <Chip>Minecraft {instance.minecraftVersion}</Chip>
            <Chip loader={instance.loader}>
              {LOADER_NAME[instance.loader]}
              {instance.loaderVersion && instance.loader !== 'vanilla'
                ? ` ${shortLoaderVersion(instance.loader, instance.minecraftVersion, instance.loaderVersion)}`
                : ''}
            </Chip>
          </div>

          <div className="row gap-3 wrap" style={{ alignItems: 'flex-end' }}>
            <Select
              className="grow"
              label="Mod loader"
              value={loader}
              onChange={(value) => setLoader(value as LoaderType)}
              options={LOADERS.map((option) => ({ value: option, label: LOADER_NAME[option] }))}
            />
            {loader !== 'vanilla' && (
              <Select
                className="grow"
                label="Loader build"
                value={loaderVersion ?? ''}
                onChange={setLoaderVersion}
                options={
                  loaderVersions === null
                    ? [{ value: '', label: 'Loading…' }]
                    : loaderVersions.length === 0
                      ? [{ value: '', label: `No builds for ${instance.minecraftVersion}` }]
                      : loaderVersions.map((version) => ({
                          value: version.id,
                          label: `${shortLoaderVersion(loader, instance.minecraftVersion, version.id)}${
                            version.recommended ? '  ·  recommended' : version.stable ? '' : '  ·  beta'
                          }`
                        }))
                }
              />
            )}
            <Button variant="primary" disabled={!loaderChanged} loading={savingVersion} onClick={() => void changeLoader()}>
              Apply
            </Button>
          </div>

          <Callout>
            Changing the loader keeps your worlds and configuration, but mods built for the previous loader will stop
            working. Back up first if you are unsure.
          </Callout>
        </div>
      </section>

      { }
      <section className="panel">
        <div className="panel__head">
          <Cpu size={16} style={{ color: 'var(--text-tertiary)' }} />
          <span className="panel__title">Java &amp; memory</span>
          <span className="t-tiny dimmer">Overrides the global defaults</span>
        </div>
        <div className="panel__body col gap-5">
          <div className="setting-row" style={{ borderBottom: 'none', paddingTop: 0 }}>
            <div className="setting-row__text">
              <div className="setting-row__title">Maximum memory</div>
              <div className="setting-row__desc">
                {settings.memoryMaxMb === null
                  ? `Using the global default of ${globals?.memoryMaxMb ?? 4096} MB`
                  : 'This instance uses its own limit'}
              </div>
            </div>
            <div className="setting-row__control col gap-2" style={{ minWidth: 280 }}>
              <Switch
                checked={settings.memoryMaxMb !== null}
                onChange={(value) => patch('memoryMaxMb', value ? (globals?.memoryMaxMb ?? 4096) : null)}
                label="Override memory"
              />
              {settings.memoryMaxMb !== null && (
                <Slider
                  min={1024}
                  max={maxMemoryCeiling}
                  step={512}
                  value={settings.memoryMaxMb}
                  onChange={(value) => patch('memoryMaxMb', value)}
                  format={(value) => `${(value / 1024).toFixed(1)} GB`}
                />
              )}
            </div>
          </div>

          <Select
            label="Java runtime"
            hint="Orbit picks a compatible runtime automatically unless you choose one here."
            value={settings.javaRuntimeId ?? ''}
            onChange={(value) => patch('javaRuntimeId', value || null)}
            options={[
              { value: '', label: 'Automatic (recommended)' },
              ...javaRuntimes.map((runtime) => ({
                value: runtime.id,
                label: `${runtime.vendor} ${runtime.version}${runtime.managed ? ' (managed)' : ''}`
              }))
            ]}
          />

          <TextArea
            label="Extra JVM arguments"
            hint="Leave empty to inherit the global arguments. Memory flags are managed by the slider."
            placeholder={globals?.javaArgs}
            rows={3}
            value={settings.javaArgs ?? ''}
            onChange={(event) => patch('javaArgs', event.target.value || null)}
          />
        </div>
      </section>

      { }
      <section className="panel">
        <div className="panel__head">
          <Terminal size={16} style={{ color: 'var(--text-tertiary)' }} />
          <span className="panel__title">Window &amp; launch</span>
        </div>
        <div className="panel__body col gap-4">
          <div className="row gap-3">
            <TextField
              className="grow"
              label="Window width"
              type="number"
              placeholder={String(globals?.windowWidth ?? 1280)}
              value={settings.windowWidth ?? ''}
              onChange={(event) => patch('windowWidth', event.target.value ? Number(event.target.value) : null)}
            />
            <TextField
              className="grow"
              label="Window height"
              type="number"
              placeholder={String(globals?.windowHeight ?? 720)}
              value={settings.windowHeight ?? ''}
              onChange={(event) => patch('windowHeight', event.target.value ? Number(event.target.value) : null)}
            />
          </div>

          <OverrideSwitch
            title="Start fullscreen"
            value={settings.fullscreen}
            fallback={globals?.fullscreen ?? false}
            onChange={(value) => patch('fullscreen', value)}
          />
          <OverrideSwitch
            title="Hide Orbit while playing"
            value={settings.closeLauncherOnLaunch}
            fallback={globals?.closeLauncherOnLaunch ?? false}
            onChange={(value) => patch('closeLauncherOnLaunch', value)}
          />

          <TextField
            label="Join a server on launch"
            hint="Quick Play. Needs Minecraft 1.20 or newer."
            placeholder="play.example.net"
            value={settings.quickPlayServer ?? ''}
            onChange={(event) => patch('quickPlayServer', event.target.value || null)}
          />

          <TextField
            label="Pre-launch command"
            hint="Runs in the instance folder before Minecraft starts."
            mono
            value={settings.preLaunchCommand ?? ''}
            onChange={(event) => patch('preLaunchCommand', event.target.value || null)}
          />
          <TextField
            label="Post-exit command"
            hint="Runs after the game closes."
            mono
            value={settings.postExitCommand ?? ''}
            onChange={(event) => patch('postExitCommand', event.target.value || null)}
          />
          <TextField
            label="Wrapper command"
            hint="Advanced: launches Java through another program, e.g. a performance profiler."
            mono
            value={settings.wrapperCommand ?? ''}
            onChange={(event) => patch('wrapperCommand', event.target.value || null)}
          />
        </div>
      </section>

      <div className="row gap-2" style={{ position: 'sticky', bottom: 16, justifyContent: 'flex-end' }}>
        {dirty && (
          <>
            <Button
              variant="ghost"
              icon={<RotateCcw size={14} />}
              onClick={() => {
                setSettings(instance.settings)
                setName(instance.name)
                setGroup(instance.group ?? '')
                setTags(instance.tags.join(', '))
                setDirty(false)
              }}
            >
              Discard
            </Button>
            <Button variant="primary" icon={<Save size={15} />} onClick={() => void save()}>
              Save changes
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function OverrideSwitch({
  title,
  value,
  fallback,
  onChange
}: {
  title: string
  value: boolean | null
  fallback: boolean
  onChange: (value: boolean | null) => void
}): React.JSX.Element {
  const effective = value ?? fallback
  return (
    <div className="switch-row">
      <div className="switch-row__text">
        <div className="switch-row__title">{title}</div>
        <div className="switch-row__desc">
          {value === null ? `Following the global setting (${fallback ? 'on' : 'off'})` : 'Overridden for this instance'}
        </div>
      </div>
      {value !== null && (
        <button className="btn btn--ghost btn--sm" onClick={() => onChange(null)} type="button">
          Reset
        </button>
      )}
      <Switch checked={effective} onChange={(next) => onChange(next)} label={title} />
    </div>
  )
}
