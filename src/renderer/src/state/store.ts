import { useMemo } from 'react'
import { create } from 'zustand'
import type {
  Account,
  AppNotification,
  AppSettings,
  InstanceStatus,
  InstanceSummary,
  JavaRuntime,
  MinecraftVersionSummary,
  TaskInfo,
  UpdateState
} from '@shared/types'

const api = window.orbit





export interface Toast {
  id: string
  title: string
  body?: string
  level: 'info' | 'success' | 'warning' | 'error'
  duration: number
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => void
  dismiss: (id: string) => void
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const duration = toast.duration ?? (toast.level === 'error' ? 9_000 : 4_500)
    set({ toasts: [...get().toasts, { ...toast, id, duration }].slice(-4) })
    setTimeout(() => get().dismiss(id), duration)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) })
}))


export function reportError(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[${scope}]`, error)
  useToasts.getState().push({ title: scope, body: message, level: 'error' })
}

export function toast(title: string, body?: string, level: Toast['level'] = 'success'): void {
  useToasts.getState().push({ title, body, level })
}





interface OrbitState {
  ready: boolean
  settings: AppSettings | null
  accounts: Account[]
  activeAccount: Account | null
  instances: InstanceSummary[]
  statuses: Record<string, InstanceStatus>
  tasks: TaskInfo[]
  notifications: AppNotification[]
  updateState: UpdateState | null
  javaRuntimes: JavaRuntime[]
  minecraftVersions: MinecraftVersionSummary[]
  sidebarCollapsed: boolean

  bootstrap: () => Promise<void>
  refreshInstances: () => Promise<void>
  refreshAccounts: () => Promise<void>
  refreshJava: () => Promise<void>
  refreshVersions: (force?: boolean) => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  setSidebarCollapsed: (value: boolean) => void
}

export const useOrbit = create<OrbitState>((set, get) => ({
  ready: false,
  settings: null,
  accounts: [],
  activeAccount: null,
  instances: [],
  statuses: {},
  tasks: [],
  notifications: [],
  updateState: null,
  javaRuntimes: [],
  minecraftVersions: [],
  sidebarCollapsed: localStorage.getItem('orbit.sidebar') === 'collapsed',

  async bootstrap() {
    const [settings, accounts, activeAccount, instances, statuses, tasks, notifications, updateState] =
      await Promise.all([
        api.settings.get(),
        api.accounts.list(),
        api.accounts.getActive(),
        api.instances.list(),
        api.instances.statuses(),
        api.tasks.list(),
        api.notifications.list(),
        api.updater.state()
      ])

    set({
      ready: true,
      settings,
      accounts,
      activeAccount,
      instances,
      statuses,
      tasks,
      notifications,
      updateState
    })

    applyTheme(settings)


    void get().refreshVersions()
    void get().refreshJava()
  },

  async refreshInstances() {
    const [instances, statuses] = await Promise.all([api.instances.list(), api.instances.statuses()])
    set({ instances, statuses })
  },

  async refreshAccounts() {
    const [accounts, activeAccount] = await Promise.all([api.accounts.list(), api.accounts.getActive()])
    set({ accounts, activeAccount })
  },

  async refreshJava() {
    try {
      set({ javaRuntimes: await api.java.list() })
    } catch (err) {
      console.warn('Could not load Java runtimes', err)
    }
  },

  async refreshVersions(force = false) {
    try {
      set({ minecraftVersions: await api.versions.minecraft(force) })
    } catch (err) {
      console.warn('Could not load the Minecraft version manifest', err)
    }
  },

  async updateSettings(patch) {
    const settings = await api.settings.update(patch)
    set({ settings })
    applyTheme(settings)
  },

  setSidebarCollapsed(value) {
    localStorage.setItem('orbit.sidebar', value ? 'collapsed' : 'expanded')
    set({ sidebarCollapsed: value })
  }
}))





function shift(hex: string, amount: number): string {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const num = Number.parseInt(full, 16)
  const clamp = (n: number): number => Math.max(0, Math.min(255, n))
  const r = clamp(((num >> 16) & 255) + amount)
  const g = clamp(((num >> 8) & 255) + amount)
  const b = clamp((num & 255) + amount)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function rgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const num = Number.parseInt(full, 16)
  return `rgb(${(num >> 16) & 255} ${(num >> 8) & 255} ${num & 255} / ${alpha}%)`
}


function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const num = Number.parseInt(full, 16)
  const channel = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((num >> 16) & 255) + 0.7152 * channel((num >> 8) & 255) + 0.0722 * channel(num & 255)
}

export function applyTheme(settings: AppSettings): void {
  const root = document.documentElement
  root.dataset.theme = settings.theme
  root.dataset.reduceMotion = String(settings.reduceMotion)

  const accent = /^#[0-9a-f]{3,8}$/i.test(settings.accentColor) ? settings.accentColor : '#6C7BFF'
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-hover', shift(accent, 22))
  root.style.setProperty('--accent-press', shift(accent, -18))
  root.style.setProperty('--accent-contrast', luminance(accent) > 0.55 ? '#0A0B14' : '#FFFFFF')
  root.style.setProperty('--accent-a08', rgba(accent, 8))
  root.style.setProperty('--accent-a14', rgba(accent, 14))
  root.style.setProperty('--accent-a24', rgba(accent, 24))
  root.style.setProperty('--accent-a40', rgba(accent, 40))
  root.style.setProperty('--accent-glow', rgba(accent, 32))
  root.style.setProperty('--aurora-1', rgba(accent, 20))

  root.style.fontSize = `${Math.round(16 * Math.min(1.3, Math.max(0.85, settings.uiScale)))}px`
}





let wired = false

export function wireEvents(): void {
  if (wired) return
  wired = true

  api.on('settings:changed', (settings) => {
    useOrbit.setState({ settings })
    applyTheme(settings)
  })

  api.on('accounts:changed', (accounts) => {
    useOrbit.setState({ accounts })
    void api.accounts.getActive().then((activeAccount) => useOrbit.setState({ activeAccount }))
  })

  api.on('instances:changed', () => {
    void useOrbit.getState().refreshInstances()
  })

  api.on('instance:status', ({ instanceId, status }) => {
    useOrbit.setState((state) => ({ statuses: { ...state.statuses, [instanceId]: status } }))
  })

  api.on('tasks:changed', (tasks) => useOrbit.setState({ tasks }))

  api.on('notifications:changed', (notifications) => useOrbit.setState({ notifications }))

  api.on('notification:new', (notification) => {
    useToasts.getState().push({
      title: notification.title,
      body: notification.body,
      level: notification.level
    })
  })

  api.on('updater:state', (updateState) => useOrbit.setState({ updateState }))
}










export function useActiveTasks(): TaskInfo[] {
  const tasks = useOrbit((state) => state.tasks)
  return useMemo(
    () => tasks.filter((task) => task.status === 'running' || task.status === 'queued'),
    [tasks]
  )
}

export function useRunningTasks(): TaskInfo[] {
  const tasks = useOrbit((state) => state.tasks)
  return useMemo(() => tasks.filter((task) => task.status === 'running'), [tasks])
}

export function useUnreadCount(): number {
  const notifications = useOrbit((state) => state.notifications)
  return useMemo(() => notifications.reduce((count, item) => count + (item.read ? 0 : 1), 0), [notifications])
}

export { api }
