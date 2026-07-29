import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Coffee,
  Cpu,
  Download,
  FolderSearch,
  HardDriveDownload,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2
} from 'lucide-react'
import type { JavaDownloadOption, JavaRuntime, SystemInfo } from '@shared/types'
import {
  Button,
  Callout,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Skeleton,
  Slider,
  Switch,
  TextArea
} from '../components/ui'
import { api, reportError, toast, useOrbit } from '../state/store'

export function JavaPage(): React.JSX.Element {
  const runtimes = useOrbit((state) => state.javaRuntimes)
  const settings = useOrbit((state) => state.settings)
  const updateSettings = useOrbit((state) => state.updateSettings)
  const refreshJava = useOrbit((state) => state.refreshJava)

  const [downloadable, setDownloadable] = useState<JavaDownloadOption[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [installing, setInstalling] = useState<number | null>(null)
  const [removing, setRemoving] = useState<JavaRuntime | null>(null)
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [javaArgs, setJavaArgs] = useState(settings?.javaArgs ?? '')

  useEffect(() => {
    void api.java.downloadable().then(setDownloadable).catch(() => setDownloadable([]))
    void api.app.getSystemInfo().then(setSystem)
  }, [runtimes.length])

  useEffect(() => setJavaArgs(settings?.javaArgs ?? ''), [settings?.javaArgs])

  const maxMemoryCeiling = system ? Math.max(2048, Math.floor(system.totalMemoryMb * 0.85)) : 16384

  const scan = async (): Promise<void> => {
    setScanning(true)
    try {
      const found = await api.java.scan()
      await refreshJava()
      toast(`Found ${found.length} Java runtime${found.length === 1 ? '' : 's'}`)
    } catch (err) {
      reportError('Scan failed', err)
    } finally {
      setScanning(false)
    }
  }

  const install = async (major: number): Promise<void> => {
    setInstalling(major)
    try {
      const runtime = await api.java.install(major)
      await refreshJava()
      setDownloadable(await api.java.downloadable())
      toast('Java installed', `${runtime.vendor} ${runtime.version}`)
    } catch (err) {
      reportError(`Could not install Java ${major}`, err)
    } finally {
      setInstalling(null)
    }
  }

  const addManual = async (): Promise<void> => {
    try {
      const path = await api.app.pickFile(
        [{ name: 'Java executable', extensions: ['exe'] }],
        'Select javaw.exe or java.exe'
      )
      if (!path) return
      const test = await api.java.test(path)
      if (!test.ok) {
        toast('That is not a usable runtime', test.error, 'error')
        return
      }
      await api.java.addManual(path)
      await refreshJava()
      toast('Runtime added', test.version)
    } catch (err) {
      reportError('Could not add that runtime', err)
    }
  }

  return (
    <div className="page__inner">
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Java</h1>
          <p className="page-header__sub">
            Orbit picks the right runtime for each instance automatically. Managed runtimes are downloaded from Eclipse
            Temurin.
          </p>
        </div>
        <div className="row gap-2">
          <Button icon={<FolderSearch size={15} />} onClick={() => void addManual()}>
            Add manually
          </Button>
          <Button
            variant="secondary"
            icon={<RefreshCw size={15} className={scanning ? 'spin' : undefined} />}
            loading={scanning}
            onClick={() => void scan()}
          >
            Rescan
          </Button>
        </div>
      </header>

      <div className="col gap-6" style={{ maxWidth: 940 }}>
        <section className="panel">
          <div className="panel__head">
            <Coffee size={16} style={{ color: 'var(--text-tertiary)' }} />
            <span className="panel__title">Installed runtimes</span>
            <span className="section-title__count">{runtimes.length}</span>
          </div>
          <div className="panel__body">
            {runtimes.length === 0 ? (
              <EmptyState
                icon={<Coffee size={26} />}
                title="No Java found"
                description="Install one below and Orbit will use it automatically, or point Orbit at an existing installation."
              />
            ) : (
              <div className="col gap-1">
                {runtimes.map((runtime) => {
                  const isDefault = settings?.defaultJavaRuntimeId === runtime.id
                  return (
                    <div className="crow" key={runtime.id}>
                      <div className="crow__icon" style={{ color: 'var(--accent)' }}>
                        <Coffee size={17} />
                      </div>
                      <div className="crow__text">
                        <div className="crow__name">
                          <span>
                            {runtime.vendor} {runtime.version}
                          </span>
                          <span className="chip">Java {runtime.majorVersion}</span>
                          {runtime.managed && <span className="chip chip--accent">Managed by Orbit</span>}
                          {runtime.arch !== 'x64' && <span className="chip chip--warning">32-bit</span>}
                          {isDefault && (
                            <span className="chip chip--success">
                              <Star size={10} fill="currentColor" /> Default
                            </span>
                          )}
                        </div>
                        <div className="crow__desc t-mono">{runtime.path}</div>
                      </div>
                      <div className="crow__actions">
                        <IconButton
                          label={isDefault ? 'Clear default' : 'Set as default'}
                          active={isDefault}
                          onClick={() => void updateSettings({ defaultJavaRuntimeId: isDefault ? null : runtime.id })}
                        >
                          <Star size={15} fill={isDefault ? 'currentColor' : 'none'} />
                        </IconButton>
                        <IconButton label="Show in Explorer" onClick={() => void api.app.showItemInFolder(runtime.path)}>
                          <FolderSearch size={15} />
                        </IconButton>
                        <IconButton label={runtime.managed ? 'Uninstall' : 'Forget'} danger onClick={() => setRemoving(runtime)}>
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <HardDriveDownload size={16} style={{ color: 'var(--text-tertiary)' }} />
            <span className="panel__title">Install a runtime</span>
          </div>
          <div className="panel__body col gap-2">
            {downloadable === null
              ? [0, 1, 2].map((index) => <Skeleton key={index} height={54} radius={13} />)
              : downloadable.map((option) => (
                  <div className="crow" key={option.majorVersion}>
                    <div className="crow__icon" style={{ color: option.installed ? 'var(--success)' : undefined }}>
                      {option.installed ? <CheckCircle2 size={17} /> : <Download size={17} />}
                    </div>
                    <div className="crow__text">
                      <div className="crow__name">{option.label}</div>
                      <div className="crow__desc">{option.description}</div>
                    </div>
                    <Button
                      size="sm"
                      variant={option.installed ? 'ghost' : 'secondary'}
                      disabled={option.installed}
                      loading={installing === option.majorVersion}
                      onClick={() => void install(option.majorVersion)}
                    >
                      {option.installed ? 'Installed' : 'Install'}
                    </Button>
                  </div>
                ))}

            <Callout icon={<ShieldCheck size={15} />}>
              Runtimes come from the official Adoptium API and are verified against the published SHA-256 checksum
              before use.
            </Callout>
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <Cpu size={16} style={{ color: 'var(--text-tertiary)' }} />
            <span className="panel__title">Default memory &amp; arguments</span>
          </div>
          <div className="panel__body col gap-5">
            <div className="setting-row" style={{ borderBottom: 'none', paddingTop: 0 }}>
              <div className="setting-row__text">
                <div className="setting-row__title">Maximum memory</div>
                <div className="setting-row__desc">
                  How much RAM Minecraft may use by default. Individual instances can override this.
                  {system && ` Your PC has ${(system.totalMemoryMb / 1024).toFixed(1)} GB.`}
                </div>
              </div>
              <div className="setting-row__control" style={{ minWidth: 300 }}>
                <Slider
                  min={1024}
                  max={maxMemoryCeiling}
                  step={512}
                  value={settings?.memoryMaxMb ?? 4096}
                  onChange={(value) => void updateSettings({ memoryMaxMb: value })}
                  format={(value) => `${(value / 1024).toFixed(1)} GB`}
                />
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-row__text">
                <div className="setting-row__title">Minimum memory</div>
                <div className="setting-row__desc">Allocated up front. Leave low unless you know you need more.</div>
              </div>
              <div className="setting-row__control" style={{ minWidth: 300 }}>
                <Slider
                  min={256}
                  max={Math.min(8192, settings?.memoryMaxMb ?? 4096)}
                  step={256}
                  value={Math.min(settings?.memoryMinMb ?? 1024, settings?.memoryMaxMb ?? 4096)}
                  onChange={(value) => void updateSettings({ memoryMinMb: value })}
                  format={(value) => `${(value / 1024).toFixed(1)} GB`}
                />
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-row__text">
                <div className="setting-row__title">Download Java automatically</div>
                <div className="setting-row__desc">
                  When an instance needs a Java version you do not have, Orbit fetches it instead of failing.
                </div>
              </div>
              <div className="setting-row__control">
                <Switch
                  checked={settings?.autoDownloadJava ?? true}
                  onChange={(value) => void updateSettings({ autoDownloadJava: value })}
                  label="Download Java automatically"
                />
              </div>
            </div>

            <TextArea
              label="Default JVM arguments"
              hint="Applied to every instance that does not override them. Memory flags are managed by the sliders above."
              rows={4}
              value={javaArgs}
              onChange={(event) => setJavaArgs(event.target.value)}
              onBlur={() => {
                if (javaArgs !== settings?.javaArgs) void updateSettings({ javaArgs })
              }}
            />
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={removing?.managed ? 'Uninstall this runtime?' : 'Forget this runtime?'}
        description={
          removing?.managed
            ? 'The downloaded files are deleted from the Orbit Java folder. Instances using it will fall back to another runtime.'
            : 'Orbit stops listing this runtime. The installation on your PC is left untouched.'
        }
        confirmLabel={removing?.managed ? 'Uninstall' : 'Forget'}
        danger
        icon={<Trash2 size={18} />}
        onConfirm={async () => {
          if (!removing) return
          await api.java.remove(removing.id)
          await refreshJava()
          setDownloadable(await api.java.downloadable())
          toast(removing.managed ? 'Runtime uninstalled' : 'Runtime forgotten')
        }}
      />
    </div>
  )
}
