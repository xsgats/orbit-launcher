import { randomUUID } from 'node:crypto'
import { Notification } from 'electron'
import { join } from 'node:path'
import type { AppNotification } from '../../shared/types'
import { emit } from '../core/events'
import { readJson, writeJson } from '../core/fsx'
import { paths } from '../core/paths'
import { settings } from '../core/settings'

const MAX_STORED = 200

class NotificationCenter {
  private items: AppNotification[] = []

  async load(): Promise<void> {
    this.items = (await readJson<AppNotification[]>(paths.notificationsFile)) ?? []
  }

  private async persist(): Promise<void> {
    await writeJson(paths.notificationsFile, this.items.slice(0, MAX_STORED))
    emit('notifications:changed', this.list())
  }

  list(): AppNotification[] {
    return [...this.items].sort((a, b) => b.createdAt - a.createdAt)
  }

  unreadCount(): number {
    return this.items.filter((item) => !item.read).length
  }

  push(options: {
    title: string
    body: string
    level?: AppNotification['level']
    action?: AppNotification['action']
    /** Also raise a native Windows toast. */
    toast?: boolean
  }): AppNotification {
    const item: AppNotification = {
      id: randomUUID(),
      title: options.title,
      body: options.body,
      level: options.level ?? 'info',
      createdAt: Date.now(),
      read: false,
      action: options.action ?? null
    }

    this.items.unshift(item)
    this.items = this.items.slice(0, MAX_STORED)
    void this.persist()
    emit('notification:new', item)

    if (options.toast !== false && Notification.isSupported()) {
      try {
        const toast = new Notification({
          title: item.title,
          body: item.body,
          icon: join(process.resourcesPath ?? '', 'icon.png'),
          silent: item.level === 'info'
        })
        toast.show()
      } catch {
        /* toasts are a nicety, never a failure path */
      }
    }

    return item
  }

  async markRead(id: string): Promise<AppNotification[]> {
    const item = this.items.find((entry) => entry.id === id)
    if (item) item.read = true
    await this.persist()
    return this.list()
  }

  async markAllRead(): Promise<AppNotification[]> {
    for (const item of this.items) item.read = true
    await this.persist()
    return this.list()
  }

  async dismiss(id: string): Promise<AppNotification[]> {
    this.items = this.items.filter((item) => item.id !== id)
    await this.persist()
    return this.list()
  }

  async clear(): Promise<AppNotification[]> {
    this.items = []
    await this.persist()
    return this.list()
  }

  /** Convenience used by the download manager. */
  downloadFinished(title: string, body: string): void {
    if (!settings.get().notifyOnDownloadComplete) return
    this.push({ title, body, level: 'success' })
  }
}

export const notifications = new NotificationCenter()
