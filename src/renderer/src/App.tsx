import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Logo } from './components/Logo'
import { Ambient, CommandPalette, Sidebar, TitleBar, ToastHost } from './components/Shell'
import { MenuProvider } from './components/ui'
import { RouterProvider, matchRoute, navigate, useRoute } from './lib/router'
import { api, useOrbit, wireEvents } from './state/store'

import { HomePage } from './pages/HomePage'
import { InstancesPage } from './pages/InstancesPage'
import { InstanceDetailPage } from './pages/InstanceDetailPage'
import { DiscoverPage } from './pages/DiscoverPage'
import { ProjectPage } from './pages/ProjectPage'
import { AccountsPage } from './pages/AccountsPage'
import { JavaPage } from './pages/JavaPage'
import { DownloadsPage } from './pages/DownloadsPage'
import { NewsPage } from './pages/NewsPage'
import { SettingsPage } from './pages/SettingsPage'

function Boot(): React.JSX.Element {
  return (
    <div className="boot">
      <div className="boot__inner">
        <div style={{ animation: 'orbit-float 3.4s var(--ease-in-out) infinite alternate' }}>
          <Logo size={76} />
        </div>
        <div className="boot__wordmark">Orbit</div>
        <div className="boot__bar" />
      </div>
    </div>
  )
}

function NotFound(): React.JSX.Element {
  return (
    <div className="page">
      <div className="page__inner">
        <div className="empty">
          <div className="empty__glyph">
            <Logo size={34} glow={false} />
          </div>
          <h2 className="empty__title">This page drifted out of orbit</h2>
          <p className="empty__desc">The address you followed does not match anything in the launcher.</p>
          <button className="btn btn--primary" onClick={() => navigate('/')} type="button">
            Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}

function Routes(): React.JSX.Element {
  const route = useRoute()

  const instanceMatch = matchRoute('/instances/:id', route.path)
  const projectMatch = matchRoute('/discover/:provider/:projectId', route.path)
  const settingsMatch = matchRoute('/settings/:section', route.path)

  let element: React.JSX.Element
  let key = route.path

  if (route.path === '/') element = <HomePage />
  else if (route.path === '/instances') element = <InstancesPage />
  else if (instanceMatch) {
    element = <InstanceDetailPage instanceId={instanceMatch.id} />
    key = `instance-${instanceMatch.id}`
  } else if (route.path === '/discover') element = <DiscoverPage />
  else if (projectMatch) {
    element = (
      <ProjectPage
        provider={projectMatch.provider as 'modrinth' | 'curseforge'}
        projectId={projectMatch.projectId}
      />
    )
    key = `project-${projectMatch.projectId}`
  } else if (route.path === '/accounts') element = <AccountsPage />
  else if (route.path === '/java') element = <JavaPage />
  else if (route.path === '/downloads') element = <DownloadsPage />
  else if (route.path === '/news') element = <NewsPage />
  else if (route.path === '/settings' || settingsMatch) {
    element = <SettingsPage section={settingsMatch?.section ?? 'appearance'} />
    key = 'settings'
  } else element = <NotFound />

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        className="page"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        {element}
      </motion.div>
    </AnimatePresence>
  )
}

export function App(): React.JSX.Element {
  const ready = useOrbit((state) => state.ready)
  const bootstrap = useOrbit((state) => state.bootstrap)
  const collapsed = useOrbit((state) => state.sidebarCollapsed)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    wireEvents()
    bootstrap().catch((err) => setBootError(err instanceof Error ? err.message : String(err)))
  }, [bootstrap])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
      if (event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r')) {
        // Reloading mid-download would orphan tasks in the main process.
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Main-process notifications can ask the UI to navigate.
  useEffect(() => api.on('navigate', ({ route }) => navigate(route)), [])

  if (bootError) {
    return (
      <div className="boot">
        <div className="boot__inner" style={{ maxWidth: 460, textAlign: 'center' }}>
          <Logo size={64} />
          <h2 className="t-h1">Orbit could not start</h2>
          <p className="t-small dim" style={{ lineHeight: 1.6 }}>
            {bootError}
          </p>
          <button className="btn btn--secondary" onClick={() => void api.app.relaunch()} type="button">
            Restart Orbit
          </button>
        </div>
      </div>
    )
  }

  if (!ready) return <Boot />

  return (
    <RouterProvider>
      <MenuProvider>
        <Ambient />
        <div className="app">
          <TitleBar onOpenSearch={() => setPaletteOpen(true)} />
          <div className="body" data-collapsed={collapsed}>
            <Sidebar />
            <Routes />
          </div>
        </div>
        <AnimatePresence>
          {paletteOpen && <CommandPalette open onClose={() => setPaletteOpen(false)} />}
        </AnimatePresence>
        <ToastHost />
      </MenuProvider>
    </RouterProvider>
  )
}
