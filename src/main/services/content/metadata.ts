import { basename } from 'node:path'
import type { LoaderType } from '../../../shared/types'
import { findZipEntry, readZipEntries } from '../../core/zip'

export interface ModMetadata {
  name: string
  description: string | null
  version: string | null
  authors: string[]
  loaders: LoaderType[]
  gameVersions: string[]
  homepage: string | null
  iconDataUrl: string | null
  modId: string | null
  dependencies: string[]
}





interface TomlTable {
  [key: string]: string | string[] | TomlTable | TomlTable[]
}






function parseModsToml(text: string): { top: Record<string, string>; mods: Record<string, string>[]; dependencies: string[] } {
  const top: Record<string, string> = {}
  const mods: Record<string, string>[] = []
  const dependencies: string[] = []

  let current: Record<string, string> = top
  let inDependencies = false

  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim()
    if (!line || line.startsWith('#')) continue

    const table = /^\[\[?([^\]]+)\]?\]$/.exec(line)
    if (table) {
      const name = table[1].trim()
      inDependencies = name.startsWith('dependencies')
      if (name === 'mods') {
        current = {}
        mods.push(current)
      } else if (inDependencies) {
        current = {}
      } else {
        current = {}
      }
      continue
    }

    const pair = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line)
    if (!pair) continue

    const key = pair[1]
    let raw = pair[2].trim()


    if (raw.startsWith('"""')) {
      let value = raw.slice(3)
      if (value.endsWith('"""') && value.length >= 3) {
        value = value.slice(0, -3)
      } else {
        while (++i < lines.length) {
          const next = lines[i]
          if (next.trimEnd().endsWith('"""')) {
            value += `\n${next.trimEnd().slice(0, -3)}`
            break
          }
          value += `\n${next}`
        }
      }
      current[key] = value.trim()
      continue
    }

    if (raw.startsWith('"') || raw.startsWith("'")) {
      const quote = raw[0]
      const end = raw.lastIndexOf(quote)
      raw = end > 0 ? raw.slice(1, end) : raw.slice(1)
    } else {
      raw = raw.replace(/\s*#.*$/, '').trim()
    }

    if (inDependencies && key === 'modId') dependencies.push(raw)
    current[key] = raw
  }

  return { top, mods, dependencies }
}





function toDataUrl(buffer: Buffer, fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase()
  const mime =
    extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'gif'
        ? 'image/gif'
        : extension === 'svg'
          ? 'image/svg+xml'
          : 'image/png'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

function parseManifest(buffer: Buffer | undefined): Record<string, string> {
  if (!buffer) return {}
  const unfolded = buffer.toString('utf8').replace(/\r\n/g, '\n').replace(/\n /g, '')
  const out: Record<string, string> = {}
  for (const line of unfolded.split('\n')) {
    const match = /^([\w-]+):\s*(.*)$/.exec(line)
    if (match) out[match[1]] = match[2].trim()
  }
  return out
}


function resolveVersionPlaceholder(version: string | undefined, manifest: Record<string, string>): string | null {
  if (!version) return null
  if (!version.includes('${')) return version
  return (
    manifest['Implementation-Version'] ??
    manifest['Specification-Version'] ??
    version.replace(/\$\{[^}]+\}/g, '').trim() ??
    null
  )
}

function normalizeAuthors(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry : ((entry as { name?: string })?.name ?? '')))
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/,|;| and /i)
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return []
}





const INTERESTING = new Set([
  'fabric.mod.json',
  'quilt.mod.json',
  'mcmod.info',
  'META-INF/mods.toml',
  'META-INF/neoforge.mods.toml',
  'META-INF/MANIFEST.MF'
])

export async function readModMetadata(jarPath: string): Promise<ModMetadata> {
  const fallback: ModMetadata = {
    name: basename(jarPath).replace(/\.(jar|disabled)$/gi, ''),
    description: null,
    version: null,
    authors: [],
    loaders: [],
    gameVersions: [],
    homepage: null,
    iconDataUrl: null,
    modId: null,
    dependencies: []
  }

  let entries: Map<string, Buffer>
  try {
    entries = await readZipEntries(jarPath, (name) => INTERESTING.has(name))
  } catch {
    return fallback
  }

  const manifest = parseManifest(entries.get('META-INF/MANIFEST.MF'))
  let iconPath: string | null = null
  const result: ModMetadata = { ...fallback }


  const fabricRaw = entries.get('fabric.mod.json')
  if (fabricRaw) {
    try {
      const json = JSON.parse(fabricRaw.toString('utf8')) as Record<string, unknown>
      result.loaders.push('fabric')
      result.modId = (json.id as string) ?? null
      result.name = (json.name as string) || result.name
      result.description = (json.description as string) ?? null
      result.version = resolveVersionPlaceholder(json.version as string, manifest)
      result.authors = normalizeAuthors(json.authors)
      result.homepage =
        ((json.contact as Record<string, string> | undefined)?.homepage ??
          (json.contact as Record<string, string> | undefined)?.sources) ||
        null
      iconPath = typeof json.icon === 'string' ? json.icon : null
      const depends = json.depends as Record<string, unknown> | undefined
      if (depends) {
        result.dependencies = Object.keys(depends).filter((key) => key !== 'minecraft' && key !== 'java')
        const mc = depends.minecraft
        if (typeof mc === 'string') result.gameVersions = [mc]
        else if (Array.isArray(mc)) result.gameVersions = mc.filter((v): v is string => typeof v === 'string')
      }
    } catch {

    }
  }


  const quiltRaw = entries.get('quilt.mod.json')
  if (quiltRaw) {
    try {
      const json = JSON.parse(quiltRaw.toString('utf8')) as Record<string, unknown>
      const loader = json.quilt_loader as Record<string, unknown> | undefined
      const meta = loader?.metadata as Record<string, unknown> | undefined
      result.loaders.push('quilt')
      result.modId = (loader?.id as string) ?? result.modId
      result.name = (meta?.name as string) || result.name
      result.description = (meta?.description as string) ?? result.description
      result.version = resolveVersionPlaceholder(loader?.version as string, manifest) ?? result.version
      const contributors = meta?.contributors as Record<string, string> | undefined
      if (contributors) result.authors = Object.keys(contributors)
      iconPath = typeof meta?.icon === 'string' ? (meta.icon as string) : iconPath
    } catch {

    }
  }


  const tomlRaw = entries.get('META-INF/neoforge.mods.toml') ?? entries.get('META-INF/mods.toml')
  if (tomlRaw) {
    try {
      const toml = parseModsToml(tomlRaw.toString('utf8'))
      result.loaders.push(entries.has('META-INF/neoforge.mods.toml') ? 'neoforge' : 'forge')
      const first = toml.mods[0] ?? {}
      result.modId = first.modId ?? result.modId
      result.name = first.displayName || result.name
      result.description = first.description ?? result.description
      result.version = resolveVersionPlaceholder(first.version, manifest) ?? result.version
      result.authors = normalizeAuthors(first.authors ?? toml.top.authors)
      result.homepage = first.displayURL ?? toml.top.displayURL ?? result.homepage
      iconPath = first.logoFile ?? toml.top.logoFile ?? iconPath
      result.dependencies = toml.dependencies.filter(
        (id) => id !== 'minecraft' && id !== 'forge' && id !== 'neoforge'
      )
    } catch {

    }
  }


  const legacyRaw = entries.get('mcmod.info')
  if (legacyRaw && !tomlRaw) {
    try {
      const parsed = JSON.parse(legacyRaw.toString('utf8')) as unknown
      const list = Array.isArray(parsed)
        ? parsed
        : ((parsed as { modList?: unknown[] }).modList ?? [])
      const first = (list[0] ?? {}) as Record<string, unknown>
      result.loaders.push('forge')
      result.modId = (first.modid as string) ?? result.modId
      result.name = (first.name as string) || result.name
      result.description = (first.description as string) ?? result.description
      result.version = resolveVersionPlaceholder(first.version as string, manifest) ?? result.version
      result.authors = normalizeAuthors(first.authorList ?? first.authors)
      result.homepage = (first.url as string) || result.homepage
      iconPath = (first.logoFile as string) || iconPath
      if (typeof first.mcversion === 'string') result.gameVersions = [first.mcversion]
    } catch {

    }
  }


  if (iconPath) {
    const normalized = iconPath.replace(/^\//, '')
    try {
      const found = await findZipEntry(jarPath, (name) => name === normalized)
      if (found) result.iconDataUrl = toDataUrl(found.buffer, found.fileName)
    } catch {

    }
  }

  result.loaders = [...new Set(result.loaders)]
  if (result.description) result.description = result.description.replace(/\s+/g, ' ').trim().slice(0, 600)
  return result
}





export interface PackMetadata {
  description: string | null
  packFormat: number | null
  iconDataUrl: string | null
}

const PACK_FORMAT_TO_VERSIONS: Record<number, string> = {
  1: '1.6.1 – 1.8.9',
  2: '1.9 – 1.10.2',
  3: '1.11 – 1.12.2',
  4: '1.13 – 1.14.4',
  5: '1.15 – 1.16.1',
  6: '1.16.2 – 1.16.5',
  7: '1.17.x',
  8: '1.18.x',
  9: '1.19 – 1.19.2',
  12: '1.19.3',
  13: '1.19.4',
  15: '1.20 – 1.20.1',
  18: '1.20.2',
  22: '1.20.3 – 1.20.4',
  32: '1.20.5 – 1.20.6',
  34: '1.21 – 1.21.1',
  42: '1.21.4',
  46: '1.21.5'
}

export function packFormatLabel(format: number | null): string | null {
  if (format === null) return null
  return PACK_FORMAT_TO_VERSIONS[format] ?? `pack format ${format}`
}

function flattenDescription(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((part) => flattenDescription(part) ?? '').join('')
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const own = typeof record.text === 'string' ? record.text : ''
    const extra = Array.isArray(record.extra) ? flattenDescription(record.extra) ?? '' : ''
    return `${own}${extra}` || null
  }
  return null
}

export async function readPackMetadata(archivePath: string): Promise<PackMetadata> {
  const result: PackMetadata = { description: null, packFormat: null, iconDataUrl: null }

  try {
    const entries = await readZipEntries(archivePath, (name) => name === 'pack.mcmeta' || name === 'pack.png')
    const metaRaw = entries.get('pack.mcmeta')
    if (metaRaw) {
      const json = JSON.parse(metaRaw.toString('utf8')) as { pack?: { description?: unknown; pack_format?: number } }
      result.description = flattenDescription(json.pack?.description)?.replace(/§./g, '').trim() || null
      result.packFormat = json.pack?.pack_format ?? null
    }
    const icon = entries.get('pack.png')
    if (icon) result.iconDataUrl = toDataUrl(icon, 'pack.png')
  } catch {

  }

  return result
}
