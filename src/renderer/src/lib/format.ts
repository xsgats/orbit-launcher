import type { LoaderType } from '@shared/types'

export function formatBytes(bytes: number, precise = false): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  const digits = precise ? 2 : value >= 100 || index === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[index]}`
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond < 1) return '—'
  return `${formatBytes(bytesPerSecond)}/s`
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (value >= 10_000) return `${Math.round(value / 1000)}K`
  if (value >= 1_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return String(value)
}


export function formatDuration(ms: number, style: 'short' | 'long' = 'short'): string {
  if (!ms || ms < 0) return style === 'short' ? '0m' : 'never'
  const minutes = Math.floor(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (style === 'long') {
    if (days > 0) return `${days} day${days === 1 ? '' : 's'}, ${hours % 24}h`
    if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'}, ${minutes % 60}m`
    if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`
    return 'less than a minute'
  }

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${Math.max(1, Math.round(ms / 1000))}s`
}

export function formatPlaytime(ms: number): { value: string; unit: string } {
  const hours = ms / 3_600_000
  if (hours >= 1) return { value: hours >= 100 ? Math.round(hours).toString() : hours.toFixed(1), unit: 'hours' }
  const minutes = Math.round(ms / 60_000)
  return { value: String(minutes), unit: minutes === 1 ? 'minute' : 'minutes' }
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatRelative(timestamp: number | string | null): string {
  if (!timestamp) return 'never'
  const time = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp
  if (!Number.isFinite(time)) return 'unknown'

  const delta = time - Date.now()
  const abs = Math.abs(delta)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000]
  ]

  for (const [unit, size] of units) {
    if (abs >= size) return RELATIVE.format(Math.round(delta / size), unit)
  }
  return 'just now'
}

export function formatDate(timestamp: number | string | null): string {
  if (!timestamp) return '—'
  const time = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp
  if (!Number.isFinite(time)) return '—'
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(timestamp: number | string | null): string {
  if (!timestamp) return '—'
  const time = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp
  if (!Number.isFinite(time)) return '—'
  return new Date(time).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

export const LOADER_NAME: Record<LoaderType, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}


export function shortLoaderVersion(
  loader: LoaderType,
  minecraftVersion: string,
  loaderVersion: string | null
): string {
  if (!loaderVersion) return ''
  if ((loader === 'forge' || loader === 'neoforge') && loaderVersion.startsWith(`${minecraftVersion}-`)) {
    return loaderVersion.slice(minecraftVersion.length + 1)
  }
  return loaderVersion
}

export const GAME_MODES: Record<number, string> = {
  0: 'Survival',
  1: 'Creative',
  2: 'Adventure',
  3: 'Spectator'
}

export const DIFFICULTIES: Record<number, string> = {
  0: 'Peaceful',
  1: 'Easy',
  2: 'Normal',
  3: 'Hard'
}


export function artworkColors(seed: string): { a: string; b: string } {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const hue = hash % 360
  const second = (hue + 48 + (hash % 60)) % 360
  return {
    a: `hsl(${hue} 74% 58% / 0.42)`,
    b: `hsl(${second} 78% 62% / 0.30)`
  }
}

export function letterTileColors(seed: string): { from: string; to: string } {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const hue = hash % 360
  return {
    from: `hsl(${hue} 62% 52%)`,
    to: `hsl(${(hue + 42 + (hash % 40)) % 360} 58% 38%)`
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : (plural ?? `${singular}s`)}`
}


export function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true
  const target = haystack.toLowerCase()
  const query = needle.toLowerCase()
  if (target.includes(query)) return true

  let index = 0
  for (const char of query) {
    index = target.indexOf(char, index)
    if (index === -1) return false
    index += 1
  }
  return true
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
