import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  CheckCircle2,
  CircleAlert,
  Coffee,
  Download,
  ExternalLink,
  FolderOpen,
  Gauge,
  Info,
  KeyRound,
  Monitor,
  Package,
  Palette,
  RefreshCw,
  RotateCcw,
  Rocket,
  ScrollText,
  ShieldCheck,
  Sparkles
} from 'lucide-react'
import type { AppSettings, SystemInfo } from '@shared/types'
import { Logo } from '../components/Logo'
import {
  Button,
  Callout,
  ConfirmDialog,
  Progress,
  Segmented,
  Select,
  Slider,
  Switch,
  TextField
} from '../components/ui'
import { formatBytes } from '../lib/format'
import { navigate } from '../lib/router'
import { api, reportError, toast, useOrbit } from '../state/store'

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={15} /> },
  { id: 'launch', label: 'Launch', icon: <Rocket size={15} /> },
  { id: 'performance', label: 'Downloads', icon: <Gauge size={15} /> },
  { id: 'integrations', label: 'Integrations', icon: <KeyRound size={15} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={15} /> },
  { id: 'updates', label: 'Updates', icon: <Download size={15} /> },
  { id: 'folders', label: 'Folders', icon: <FolderOpen size={15} /> },
  { id: 'about', label: 'About', icon: <Info size={15} /> }
] as const

type SectionId = (typeof SECTIONS)[number]['id']

const ACCENTS = [
  '#6C7BFF',
  '#7C5CFF',
  '#B15CFF',
  '#35E0F0',
  '#2FCF82',
  '#FFB84D',
  '#FF6B7A',
  '#FF6BA8',
  '#5AA9FF',
  '#8FB45B'
]

export function SettingsPage({ section }: { section: string }): React.JSX.Element {
  const settings = useOrbit((state) => state.settings)
  const updateSettings = useOrbit((state) => state.updateSettings)
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [active, setActive] = useState<SectionId>((section as SectionId) ?? 'appearance')
  const containerRef = useRef<HTMLDivElement>(null)
  const suppressScrollSpy = useRef(false)

  useEffect(() => {
    void api.app.getSystemInfo().then(setSystem)
  }, [])


  useEffect(() => {
    const target = SECTIONS.find((entry) => entry.id === section)
    if (!target) return
    setActive(target.id)
    const node = document.getElementById(`settings-${target.id}`)
    if (node) {
      suppressScrollSpy.current = true
      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTimeout(() => (suppressScrollSpy.current = false), 600)
    }
  }, [section])


  useEffect(() => {
    const page = containerRef.current?.closest('.page')
    if (!page) return

    const onScroll = (): void => {
      if (suppressScrollSpy.current) return
      let current: SectionId = SECTIONS[0].id
      for (const entry of SECTIONS) {
        const node = document.getElementById(`settings-${entry.id}`)
        if (node && node.getBoundingClientRect().top <= 160) current = entry.id
      }
      setActive(current)
    }

    page.addEventListener('scroll', onScroll, { passive: true })
    return () => page.removeEventListener('scroll', onScroll)
  }, [])

  if (!settings) return <div className="page__inner" />

  const patch = (changes: Partial<AppSettings>): void => {
    void updateSettings(changes)
  }

  return (
    <div className="page__inner" ref={containerRef}>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Settings</h1>
          <p className="page-header__sub">Preferences apply everywhere; instances can override the ones that matter.</p>
        </div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              className="settings-nav__item"
              data-active={active === entry.id}
              onClick={() => navigate(`/settings/${entry.id}`)}
              type="button"
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
        </nav>

        <div>
          <AppearanceSection settings={settings} patch={patch} />
          <LaunchSection settings={settings} patch={patch} />
          <DownloadsSection settings={settings} patch={patch} system={system} />
          <IntegrationsSection settings={settings} patch={patch} />
          <NotificationsSection settings={settings} patch={patch} />
          <UpdatesSection />
          <FoldersSection settings={settings} patch={patch} />
          <AboutSection system={system} />
        </div>
      </div>
    </div>
  )
}





function Section({
  id,
  title,
  description,
  children
}: {
  id: SectionId
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="settings-section" id={`settings-${id}`}>
      <h2 className="settings-section__title">{title}</h2>
      <p className="settings-section__desc">{description}</p>
      <div className="surface" style={{ padding: '4px var(--s-5)' }}>
        {children}
      </div>
    </section>
  )
}

function Row({
  title,
  description,
  children
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        <div className="setting-row__title">{title}</div>
        {description && <div className="setting-row__desc">{description}</div>}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  )
}

interface SectionProps {
  settings: AppSettings
  patch: (changes: Partial<AppSettings>) => void
}





function AppearanceSection({ settings, patch }: SectionProps): React.JSX.Element {
  const [custom, setCustom] = useState(settings.accentColor)
  useEffect(() => setCustom(settings.accentColor), [settings.accentColor])

  return (
    <Section
      id="appearance"
      title="Appearance"
      description="Orbit is built for long evenings. Pick the mood that suits your room."
    >
      <Row title="Theme" description="Midnight uses true black, which saves power on OLED displays.">
        <Segmented
          value={settings.theme}
          onChange={(value) => patch({ theme: value })}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'midnight', label: 'Midnight' },
            { value: 'light', label: 'Light' }
          ]}
        />
      </Row>

      <Row title="Accent colour" description="Used for highlights, progress and the launch button.">
        <div className="row wrap gap-2" style={{ justifyContent: 'flex-end', maxWidth: 380 }}>
          {ACCENTS.map((colour) => (
            <button
              key={colour}
              onClick={() => patch({ accentColor: colour })}
              aria-label={colour}
              type="button"
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: colour,
                border:
                  settings.accentColor.toLowerCase() === colour.toLowerCase()
                    ? '2px solid var(--text-primary)'
                    : '2px solid transparent',
                boxShadow: `0 2px 10px ${colour}55`,
                transition: 'transform var(--d-fast) var(--ease-spring)'
              }}
            />
          ))}
          <input
            type="color"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onBlur={() => patch({ accentColor: custom })}
            aria-label="Custom accent colour"
            title="Custom colour"
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              overflow: 'hidden',
              cursor: 'pointer',
              background: 'none',
              border: '2px dashed var(--border-strong)',
              padding: 0,
              appearance: 'none'
            }}
          />
        </div>
      </Row>

      <Row title="Instance card size" description="Applies to the grid on the Instances page.">
        <Segmented
          value={settings.instanceCardSize}
          onChange={(value) => patch({ instanceCardSize: value })}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'regular', label: 'Regular' },
            { value: 'large', label: 'Large' }
          ]}
        />
      </Row>

      <Row title="Show custom artwork" description="Turn off to fall back to Orbit's generated gradients everywhere.">
        <Switch
          checked={settings.showInstanceBackgrounds}
          onChange={(value) => patch({ showInstanceBackgrounds: value })}
          label="Show custom artwork"
        />
      </Row>

      <Row title="Interface scale" description="Makes every element larger or smaller without blurring text.">
        <Slider
          min={0.85}
          max={1.3}
          step={0.05}
          value={settings.uiScale}
          onChange={(value) => patch({ uiScale: value })}
          format={(value) => `${Math.round(value * 100)}%`}
        />
      </Row>

      <Row title="Reduce motion" description="Disables transitions and the drifting background.">
        <Switch
          checked={settings.reduceMotion}
          onChange={(value) => patch({ reduceMotion: value })}
          label="Reduce motion"
        />
      </Row>
    </Section>
  )
}





function LaunchSection({ settings, patch }: SectionProps): React.JSX.Element {
  return (
    <Section
      id="launch"
      title="Launch"
      description="Defaults for every instance. Any instance can override these in its own settings."
    >
      <Row title="Hide Orbit while playing" description="The launcher returns as soon as the game closes.">
        <Switch
          checked={settings.closeLauncherOnLaunch}
          onChange={(value) => patch({ closeLauncherOnLaunch: value })}
          label="Hide Orbit while playing"
        />
      </Row>

      <Row title="Open the log on launch" description="Handy while debugging a modpack that will not start.">
        <Switch
          checked={settings.openLogsOnLaunch}
          onChange={(value) => patch({ openLogsOnLaunch: value })}
          label="Open the log on launch"
        />
      </Row>

      <Row title="Allow several instances at once" description="Turn off to make sure only one game runs at a time.">
        <Switch
          checked={settings.allowParallelInstances}
          onChange={(value) => patch({ allowParallelInstances: value })}
          label="Allow several instances at once"
        />
      </Row>

      <Row title="Game window size" description="Ignored when an instance starts fullscreen.">
        <div className="row gap-2" style={{ width: 240 }}>
          <TextField
            className="grow"
            type="number"
            min={640}
            value={settings.windowWidth}
            onChange={(event) => patch({ windowWidth: Number(event.target.value) || 1280 })}
          />
          <TextField
            className="grow"
            type="number"
            min={480}
            value={settings.windowHeight}
            onChange={(event) => patch({ windowHeight: Number(event.target.value) || 720 })}
          />
        </div>
      </Row>

      <Row title="Start fullscreen" description="Minecraft opens directly in fullscreen.">
        <Switch checked={settings.fullscreen} onChange={(value) => patch({ fullscreen: value })} label="Start fullscreen" />
      </Row>

      <Row title="Java and memory" description="Runtimes, heap size and JVM arguments live on their own page.">
        <Button icon={<Coffee size={15} />} onClick={() => navigate('/java')}>
          Open Java settings
        </Button>
      </Row>
    </Section>
  )
}





function DownloadsSection({
  settings,
  patch,
  system
}: SectionProps & { system: SystemInfo | null }): React.JSX.Element {
  return (
    <Section
      id="performance"
      title="Downloads"
      description="Orbit fetches thousands of small asset files per install. These control how hard it pushes your connection."
    >
      <Row
        title="Parallel downloads"
        description={`How many files are fetched at once.${
          system ? ` Detected ${system.cpuCores} CPU cores.` : ''
        } Lower this on a metered or unstable connection.`}
      >
        <Slider
          min={2}
          max={32}
          step={1}
          value={settings.maxConcurrentDownloads}
          onChange={(value) => patch({ maxConcurrentDownloads: value })}
          format={(value) => `${value}`}
        />
      </Row>

      <Row
        title="Verify every file"
        description="Checks each download against its published checksum. Leave on unless you are debugging a mirror."
      >
        <Switch
          checked={settings.verifyDownloads}
          onChange={(value) => patch({ verifyDownloads: value })}
          label="Verify every file"
        />
      </Row>

      <Row title="Check for mod updates automatically" description="Runs when you open an instance's mod list.">
        <Switch
          checked={settings.checkModUpdatesOnOpen}
          onChange={(value) => patch({ checkModUpdatesOnOpen: value })}
          label="Check for mod updates automatically"
        />
      </Row>
    </Section>
  )
}





function IntegrationsSection({ settings, patch }: SectionProps): React.JSX.Element {
  const curseforgeAvailable = settings.curseforgeApiKey.trim().length > 0

  return (
    <Section
      id="integrations"
      title="Integrations"
      description="Where Orbit looks for mods, modpacks and packs."
    >
      <Row title="Modrinth" description="Powers search, update checks and .mrpack imports.">
        <Switch
          checked={settings.enableModrinth}
          onChange={(value) => patch({ enableModrinth: value })}
          label="Enable Modrinth"
        />
      </Row>

      <Row
        title="CurseForge"
        description={
          curseforgeAvailable
            ? 'Browse and install CurseForge mods and modpacks alongside Modrinth.'
            : 'Not available in this build. Modrinth covers search, installs and updates on its own.'
        }
      >
        {curseforgeAvailable ? (
          <Switch
            checked={settings.enableCurseForge}
            onChange={(value) => patch({ enableCurseForge: value })}
            label="Enable CurseForge"
          />
        ) : (
          <span className="chip">Unavailable</span>
        )}
      </Row>

      <div style={{ padding: '4px 0 var(--s-4)' }}>
        <Callout icon={<ShieldCheck size={16} />}>
          Orbit only ever authenticates against Microsoft and Mojang&apos;s official endpoints. There is no offline
          mode, no cracked login and no third-party auth server — by design.
        </Callout>
      </div>
    </Section>
  )
}





function NotificationsSection({ settings, patch }: SectionProps): React.JSX.Element {
  return (
    <Section id="notifications" title="Notifications" description="What Orbit tells you about, and where.">
      <Row title="Game crashes" description="Raises a toast and a Windows notification with a link to the log.">
        <Switch
          checked={settings.notifyOnGameCrash}
          onChange={(value) => patch({ notifyOnGameCrash: value })}
          label="Notify on crash"
        />
      </Row>

      <Row title="Finished downloads" description="Tells you when a long install or modpack finishes.">
        <Switch
          checked={settings.notifyOnDownloadComplete}
          onChange={(value) => patch({ notifyOnDownloadComplete: value })}
          label="Notify when downloads finish"
        />
      </Row>

      <Row title="Show Minecraft news on Home" description="Turn off for a purely local dashboard.">
        <Switch
          checked={settings.showNewsOnHome}
          onChange={(value) => patch({ showNewsOnHome: value })}
          label="Show news on Home"
        />
      </Row>

      <Row title="Keep Orbit in the system tray" description="Closing the window minimises instead of quitting.">
        <Switch
          checked={settings.minimizeToTray}
          onChange={(value) => patch({ minimizeToTray: value })}
          label="Minimise to tray"
        />
      </Row>

      <Row title="Start with Windows" description="Orbit launches quietly when you sign in.">
        <Switch
          checked={settings.launchOnStartup}
          onChange={(value) => patch({ launchOnStartup: value })}
          label="Start with Windows"
        />
      </Row>
    </Section>
  )
}





function UpdatesSection(): React.JSX.Element {
  const settings = useOrbit((state) => state.settings)!
  const updateSettings = useOrbit((state) => state.updateSettings)
  const state = useOrbit((store) => store.updateState)
  const [checking, setChecking] = useState(false)

  const statusText = useMemo(() => {
    switch (state?.status) {
      case 'checking':
        return 'Checking for updates…'
      case 'available':
        return `Orbit ${state.version} is available`
      case 'downloading':
        return `Downloading Orbit ${state.version ?? ''}…`
      case 'ready':
        return `Orbit ${state.version} is ready to install`
      case 'up-to-date':
        return 'You are on the latest version'
      case 'error':
        return state.error ?? 'Update check failed'
      default:
        return 'Updates have not been checked yet'
    }
  }, [state])

  return (
    <Section id="updates" title="Updates" description="Orbit updates itself in the background and installs on restart.">
      <div className="setting-row">
        <div className="setting-row__text">
          <div className="row gap-2">
            {state?.status === 'ready' || state?.status === 'up-to-date' ? (
              <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
            ) : state?.status === 'error' ? (
              <CircleAlert size={16} style={{ color: 'var(--danger)' }} />
            ) : (
              <RefreshCw size={16} className={state?.status === 'checking' ? 'spin' : undefined} />
            )}
            <div className="setting-row__title">{statusText}</div>
          </div>
          <div className="setting-row__desc">Installed version {state?.currentVersion ?? '—'}</div>
          {state?.status === 'downloading' && (
            <div style={{ marginTop: 10, maxWidth: 320 }}>
              <Progress value={state.progress} />
            </div>
          )}
          {state?.notes && (
            <div className="setting-row__desc" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>
              {state.notes}
            </div>
          )}
        </div>
        <div className="setting-row__control row gap-2">
          {state?.status === 'available' && (
            <Button variant="primary" onClick={() => void api.updater.download()}>
              Download
            </Button>
          )}
          {state?.status === 'ready' ? (
            <Button variant="primary" onClick={() => void api.updater.installNow()}>
              Restart &amp; install
            </Button>
          ) : (
            <Button
              loading={checking}
              icon={<RefreshCw size={15} />}
              onClick={async () => {
                setChecking(true)
                try {
                  await api.updater.check()
                } catch (err) {
                  reportError('Update check failed', err)
                } finally {
                  setChecking(false)
                }
              }}
            >
              Check now
            </Button>
          )}
        </div>
      </div>

      <Row title="Check automatically" description="Once at start-up, then every six hours.">
        <Switch
          checked={settings.autoCheckUpdates}
          onChange={(value) => void updateSettings({ autoCheckUpdates: value })}
          label="Check automatically"
        />
      </Row>

      <Row title="Download in the background" description="The update installs the next time Orbit restarts.">
        <Switch
          checked={settings.autoDownloadUpdates}
          onChange={(value) => void updateSettings({ autoDownloadUpdates: value })}
          label="Download automatically"
        />
      </Row>

      <Row title="Release channel" description="Beta builds arrive earlier and may be rougher.">
        <Segmented
          value={settings.updateChannel}
          onChange={(value) => void updateSettings({ updateChannel: value })}
          options={[
            { value: 'stable', label: 'Stable' },
            { value: 'beta', label: 'Beta' }
          ]}
        />
      </Row>
    </Section>
  )
}





function FoldersSection({ settings, patch }: SectionProps): React.JSX.Element {
  const [confirmReset, setConfirmReset] = useState(false)
  const [pendingRoot, setPendingRoot] = useState<string | null>(null)

  return (
    <Section
      id="folders"
      title="Folders"
      description="Instances, shared assets, Java runtimes and backups all live under one library root."
    >
      <Row title="Library root" description={<span className="t-mono">{settings.dataRoot}</span>}>
        <div className="row gap-2">
          <Button icon={<FolderOpen size={15} />} onClick={() => void api.settings.openDataFolder()}>
            Open
          </Button>
          <Button
            onClick={async () => {
              const path = await api.app.pickDirectory('Choose a new library root')
              if (path && path !== settings.dataRoot) setPendingRoot(path)
            }}
          >
            Change…
          </Button>
        </div>
      </Row>

      <Row title="Instances" description={<span className="t-mono">{settings.instancesDir}</span>}>
        <Button icon={<FolderOpen size={15} />} onClick={() => void api.app.openPath(settings.instancesDir)}>
          Open
        </Button>
      </Row>

      <Row title="Shared assets and libraries" description={<span className="t-mono">{settings.sharedDir}</span>}>
        <Button icon={<FolderOpen size={15} />} onClick={() => void api.app.openPath(settings.sharedDir)}>
          Open
        </Button>
      </Row>

      <Row title="Java runtimes" description={<span className="t-mono">{settings.javaDir}</span>}>
        <Button icon={<FolderOpen size={15} />} onClick={() => void api.app.openPath(settings.javaDir)}>
          Open
        </Button>
      </Row>

      <Row title="Launcher log" description="The file Orbit writes its own diagnostics to.">
        <Button
          icon={<ScrollText size={15} />}
          onClick={async () => {
            const path = await api.logs.launcherLogPath()
            void api.app.showItemInFolder(path)
          }}
        >
          Show log file
        </Button>
      </Row>

      <Row title="Reset all settings" description="Restores every preference to its default. Instances are untouched.">
        <Button variant="danger" icon={<RotateCcw size={15} />} onClick={() => setConfirmReset(true)}>
          Reset settings
        </Button>
      </Row>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset every setting?"
        description="Your instances, worlds and accounts stay exactly as they are — only preferences go back to their defaults."
        confirmLabel="Reset settings"
        danger
        icon={<RotateCcw size={18} />}
        onConfirm={async () => {
          await api.settings.reset()
          toast('Settings reset')
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingRoot)}
        onClose={() => setPendingRoot(null)}
        title="Move the library root?"
        description={
          <>
            New downloads will go to <span className="t-mono">{pendingRoot}</span>. Orbit does not move your existing
            files — copy them across yourself if you want to keep them, then restart Orbit.
          </>
        }
        confirmLabel="Use this folder"
        icon={<FolderOpen size={18} />}
        onConfirm={() => {
          if (pendingRoot) {
            patch({ dataRoot: pendingRoot })
            toast('Library root changed', 'Restart Orbit to finish switching.')
          }
        }}
      />
    </Section>
  )
}





function AboutSection({ system }: { system: SystemInfo | null }): React.JSX.Element {
  return (
    <section className="settings-section" id="settings-about">
      <h2 className="settings-section__title">About</h2>
      <p className="settings-section__desc">The bits and pieces that make Orbit run.</p>

      <div className="surface" style={{ padding: 'var(--s-6)' }}>
        <div className="row gap-5" style={{ alignItems: 'flex-start' }}>
          <Logo size={68} />
          <div className="grow">
            <div className="t-display" style={{ fontSize: 24 }}>
              Orbit Launcher
            </div>
            <div className="t-small dim" style={{ marginTop: 4 }}>
              Version {system?.appVersion ?? '—'} · Electron {system?.electronVersion ?? '—'} · Node{' '}
              {system?.platform ?? ''} {system?.arch ?? ''}
            </div>

            <p className="t-small dim" style={{ marginTop: 14, lineHeight: 1.65, maxWidth: '64ch' }}>
              A Minecraft launcher built from scratch for Windows: multiple instances, every loader, a real mod
              browser, and none of the clutter. Not affiliated with Mojang Studios or Microsoft.
            </p>

            <div className="row wrap gap-2" style={{ marginTop: 18 }}>
              <Button
                icon={<ExternalLink size={14} />}
                onClick={() => void api.app.openExternal('https://modrinth.com')}
              >
                Modrinth
              </Button>
              <Button
                icon={<ExternalLink size={14} />}
                onClick={() => void api.app.openExternal('https://www.curseforge.com/minecraft')}
              >
                CurseForge
              </Button>
              <Button
                icon={<ExternalLink size={14} />}
                onClick={() => void api.app.openExternal('https://adoptium.net')}
              >
                Eclipse Temurin
              </Button>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--s-4)' }}>
          <Fact icon={<Monitor size={13} />} label="Operating system" value={`Windows ${system?.osVersion ?? ''}`} />
          <Fact icon={<Package size={13} />} label="Processor" value={system?.cpuModel ?? '—'} />
          <Fact
            icon={<Gauge size={13} />}
            label="Memory"
            value={system ? `${formatBytes(system.totalMemoryMb * 1024 * 1024)} total` : '—'}
          />
          <Fact icon={<Sparkles size={13} />} label="Library root" value={system?.dataRoot ?? '—'} />
        </div>

        <div className="divider" />

        <p className="t-small dimmer" style={{ lineHeight: 1.7 }}>
          Minecraft content and materials are trademarks and copyrights of Mojang Studios. Orbit is an independent
          launcher and is not endorsed by or associated with Mojang Studios or Microsoft. Mod metadata is provided by
          Modrinth and CurseForge under their respective terms; Java runtimes come from the Eclipse Adoptium project.
        </p>
      </div>
    </section>
  )
}

function Fact({
  icon,
  label,
  value
}: {
  icon: React.ReactNode
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div>
      <div className="row gap-2 t-tiny dimmer">
        {icon}
        {label}
      </div>
      <div className="t-small truncate" style={{ marginTop: 5, fontWeight: 520 }} title={value}>
        {value}
      </div>
    </div>
  )
}
