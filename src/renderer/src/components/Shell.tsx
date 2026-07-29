import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Bell,
  Boxes,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  Coffee,
  Compass,
  Download,
  Home,
  Info,
  LayoutGrid,
  LogIn,
  Maximize2,
  Minus,
  Newspaper,
  Settings,
  Square,
  UserRound,
  X,
  XCircle
} from 'lucide-react'
import { Link, navigate, useRoute } from '../lib/router'
import { api, useActiveTasks, useOrbit, useToasts, useUnreadCount } from '../state/store'
import { Logo } from './Logo'
import { IconButton, ProgressRing, Tooltip, useAnchoredMenu } from './ui'
import { NotificationPanel } from './NotificationPanel'
import { AccountSwitcher } from './AccountSwitcher'





export function Ambient(): React.JSX.Element {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient__accent" />
      <div className="ambient__grain" />
    </div>
  )
}





export function TitleBar({ onOpenSearch }: { onOpenSearch: () => void }): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const unread = useUnreadCount()
  const tasks = useActiveTasks()

  useEffect(() => {
    void api.app.windowIsMaximized().then(setMaximized)
  }, [])

  const overallProgress = useMemo(() => {
    if (!tasks.length) return 0
    const known = tasks.filter((task) => task.progress >= 0)
    if (!known.length) return -1
    return known.reduce((sum, task) => sum + task.progress, 0) / known.length
  }, [tasks])

  return (
    <header className="titlebar">
      <Link to="/" className="titlebar__brand">
        <Logo size={24} />
        <span className="titlebar__wordmark">Orbit</span>
      </Link>

      <div className="titlebar__center">
        <button className="omni" onClick={onOpenSearch} type="button">
          <Compass size={14} />
          <span className="grow" style={{ textAlign: 'left', fontSize: 12.5 }}>
            Search instances, mods and settings
          </span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>

      <div className="titlebar__actions">
        {tasks.length > 0 && (
          <Tooltip content={`${tasks.length} task${tasks.length === 1 ? '' : 's'} running`}>
            <button
              className="iconbtn"
              onClick={() => navigate('/downloads')}
              aria-label="Active downloads"
              type="button"
              style={{ position: 'relative' }}
            >
              <ProgressRing value={overallProgress} size={26} stroke={2.5} />
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: 'var(--accent)'
                }}
              >
                {tasks.length}
              </span>
            </button>
          </Tooltip>
        )}

        <div style={{ position: 'relative' }}>
          <IconButton
            label="Notifications"
            active={notificationsOpen}
            onClick={() => setNotificationsOpen((open) => !open)}
          >
            <Bell size={16} />
            {unread > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  boxShadow: '0 0 0 2px var(--bg-canvas)'
                }}
              />
            )}
          </IconButton>
          <NotificationPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
        </div>

        <div className="window-controls">
          <button onClick={() => void api.app.windowMinimize()} aria-label="Minimise" type="button">
            <Minus size={14} />
          </button>
          <button
            onClick={async () => setMaximized(await api.app.windowMaximizeToggle())}
            aria-label={maximized ? 'Restore' : 'Maximise'}
            type="button"
          >
            {maximized ? <Maximize2 size={12} /> : <Square size={11} />}
          </button>
          <button className="close" onClick={() => void api.app.windowClose()} aria-label="Close" type="button">
            <X size={15} />
          </button>
        </div>
      </div>
    </header>
  )
}





interface NavEntry {
  to: string
  label: string
  icon: React.JSX.Element
  match: (path: string) => boolean
  badge?: number
}

export function Sidebar(): React.JSX.Element {
  const route = useRoute()
  const collapsed = useOrbit((state) => state.sidebarCollapsed)
  const setCollapsed = useOrbit((state) => state.setSidebarCollapsed)
  const instances = useOrbit((state) => state.instances)
  const activeAccount = useOrbit((state) => state.activeAccount)
  const tasks = useActiveTasks()
  const [switcherOpen, setSwitcherOpen] = useState(false)

  const primary: NavEntry[] = [
    { to: '/', label: 'Home', icon: <Home size={17} />, match: (p) => p === '/' },
    {
      to: '/instances',
      label: 'Instances',
      icon: <LayoutGrid size={17} />,
      match: (p) => p.startsWith('/instances'),
      badge: instances.length || undefined
    },
    { to: '/discover', label: 'Discover', icon: <Compass size={17} />, match: (p) => p.startsWith('/discover') },
    {
      to: '/downloads',
      label: 'Downloads',
      icon: <Download size={17} />,
      match: (p) => p.startsWith('/downloads'),
      badge: tasks.length || undefined
    }
  ]

  const secondary: NavEntry[] = [
    { to: '/accounts', label: 'Accounts', icon: <UserRound size={17} />, match: (p) => p.startsWith('/accounts') },
    { to: '/java', label: 'Java', icon: <Coffee size={17} />, match: (p) => p.startsWith('/java') },
    { to: '/news', label: 'News', icon: <Newspaper size={17} />, match: (p) => p.startsWith('/news') },
    { to: '/settings', label: 'Settings', icon: <Settings size={17} />, match: (p) => p.startsWith('/settings') }
  ]

  const renderItem = (entry: NavEntry): React.JSX.Element => {
    const active = entry.match(route.path)
    const node = (
      <Link key={entry.to} to={entry.to} className="nav-item" aria-current={active ? 'page' : undefined}>
        {active && (
          <motion.span
            className="nav-item__marker"
            layoutId="nav-marker"
            transition={{ type: 'spring', stiffness: 520, damping: 40 }}
          />
        )}
        <span className="nav-item__icon">{entry.icon}</span>
        <span className="nav-item__label">{entry.label}</span>
        {entry.badge !== undefined && <span className="nav-item__badge">{entry.badge}</span>}
      </Link>
    )

    return collapsed ? (
      <Tooltip key={entry.to} content={entry.label} side="right" delay={120}>
        {node}
      </Tooltip>
    ) : (
      node
    )
  }

  return (
    <nav className="sidebar" data-collapsed={collapsed}>
      <div className="sidebar__nav">
        {primary.map(renderItem)}
        <div className="sidebar__section">Library</div>
        {secondary.map(renderItem)}
      </div>

      <div style={{ position: 'relative' }}>
        <AccountSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
        <button className="account-chip" onClick={() => setSwitcherOpen((open) => !open)} type="button">
          {activeAccount ? (
            <>
              <img
                className="avatar"
                width={32}
                height={32}
                src={`https://mc-heads.net/avatar/${activeAccount.uuid}/64`}
                alt=""
                onError={(event) => {
                  ;(event.currentTarget as HTMLImageElement).style.visibility = 'hidden'
                }}
              />
              <span className="account-chip__meta">
                <span className="account-chip__name">{activeAccount.username}</span>
                <span className="account-chip__sub">
                  {activeAccount.needsReauth ? 'Sign-in expired' : 'Microsoft account'}
                </span>
              </span>
            </>
          ) : (
            <>
              <span
                className="avatar"
                style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)' }}
              >
                <LogIn size={15} />
              </span>
              <span className="account-chip__meta">
                <span className="account-chip__name">Sign in</span>
                <span className="account-chip__sub">No account yet</span>
              </span>
            </>
          )}
        </button>
      </div>

      <button
        className="nav-item"
        onClick={() => setCollapsed(!collapsed)}
        style={{ marginTop: 4 }}
        type="button"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span className="nav-item__icon">{collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}</span>
        <span className="nav-item__label">Collapse</span>
      </button>
    </nav>
  )
}





const TOAST_ICONS = {
  info: <Info size={16} />,
  success: <CheckCircle2 size={16} />,
  warning: <AlertTriangle size={16} />,
  error: <XCircle size={16} />
}

export function ToastHost(): React.JSX.Element {
  const toasts = useToasts((state) => state.toasts)
  const dismiss = useToasts((state) => state.dismiss)

  return (
    <div className="toasts">
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            className="toast"
            data-level={item.level}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 32, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 460, damping: 38 }}
          >
            <span className="toast__icon">{TOAST_ICONS[item.level]}</span>
            <div className="grow">
              <div className="toast__title">{item.title}</div>
              {item.body && <div className="toast__body">{item.body}</div>}
            </div>
            <button className="iconbtn" onClick={() => dismiss(item.id)} aria-label="Dismiss" type="button">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}





interface Command {
  id: string
  label: string
  hint?: string
  icon: React.JSX.Element
  run: () => void
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element | null {
  const instances = useOrbit((state) => state.instances)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<Command[]>(() => {
    const pages: Command[] = [
      { id: 'p-home', label: 'Home', icon: <Home size={15} />, run: () => navigate('/') },
      { id: 'p-instances', label: 'Instances', icon: <LayoutGrid size={15} />, run: () => navigate('/instances') },
      { id: 'p-discover', label: 'Discover mods & modpacks', icon: <Compass size={15} />, run: () => navigate('/discover') },
      { id: 'p-downloads', label: 'Downloads', icon: <Download size={15} />, run: () => navigate('/downloads') },
      { id: 'p-accounts', label: 'Accounts', icon: <UserRound size={15} />, run: () => navigate('/accounts') },
      { id: 'p-java', label: 'Java runtimes', icon: <Coffee size={15} />, run: () => navigate('/java') },
      { id: 'p-news', label: 'News', icon: <Newspaper size={15} />, run: () => navigate('/news') },
      { id: 'p-settings', label: 'Settings', icon: <Settings size={15} />, run: () => navigate('/settings') }
    ]

    const instanceCommands: Command[] = instances.map((instance) => ({
      id: `i-${instance.id}`,
      label: instance.name,
      hint: `${instance.minecraftVersion} · ${instance.loader}`,
      icon: <Boxes size={15} />,
      run: () => navigate(`/instances/${instance.id}`)
    }))

    return [...instanceCommands, ...pages]
  }, [instances])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 9)
    const needle = query.toLowerCase()
    return commands
      .filter((command) => `${command.label} ${command.hint ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 9)
  }, [commands, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => setIndex(0), [query])

  if (!open) return null

  return (
    <motion.div
      className="overlay"
      style={{ alignItems: 'flex-start', paddingTop: '14vh' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.div
        className="dialog"
        style={{ maxWidth: 580 }}
        initial={{ opacity: 0, scale: 0.97, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 440, damping: 34 }}
      >
        <div className="row gap-3" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <Compass size={17} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            className="grow"
            value={query}
            placeholder="Jump to an instance or page…"
            style={{ fontSize: 15, background: 'none' }}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIndex((current) => Math.min(current + 1, filtered.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setIndex((current) => Math.max(current - 1, 0))
              } else if (event.key === 'Enter') {
                filtered[index]?.run()
                onClose()
              } else if (event.key === 'Escape') {
                onClose()
              }
            }}
          />
          <kbd className="kbd">Esc</kbd>
        </div>

        <div style={{ padding: 6, maxHeight: 380, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div className="dimmer t-small" style={{ padding: '20px 14px', textAlign: 'center' }}>
              Nothing matches “{query}”.
            </div>
          )}
          {filtered.map((command, position) => (
            <button
              key={command.id}
              className="menu__item"
              style={{
                height: 40,
                background: position === index ? 'var(--surface-2)' : undefined,
                color: position === index ? 'var(--text-primary)' : undefined
              }}
              onMouseEnter={() => setIndex(position)}
              onClick={() => {
                command.run()
                onClose()
              }}
              type="button"
            >
              {command.icon}
              <span className="grow truncate">{command.label}</span>
              {command.hint && <span className="menu__item__shortcut">{command.hint}</span>}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

export { useAnchoredMenu }
