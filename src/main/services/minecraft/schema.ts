/** Mojang / mod-loader version manifest shapes, plus rule evaluation. */
import { release } from 'node:os'

export interface ArtifactDownload {
  path?: string
  sha1: string
  size: number
  url: string
}

export interface RuleOs {
  name?: string
  version?: string
  arch?: string
}

export interface Rule {
  action: 'allow' | 'disallow'
  os?: RuleOs
  features?: Record<string, boolean>
}

export interface Library {
  name: string
  downloads?: {
    artifact?: ArtifactDownload
    classifiers?: Record<string, ArtifactDownload>
  }
  /** Maven repository root used by loader manifests that omit `downloads`. */
  url?: string
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
  rules?: Rule[]
  /** Present on some Forge manifests. */
  clientreq?: boolean
  serverreq?: boolean
  checksums?: string[]
}

export type ArgumentEntry = string | { rules?: Rule[]; value: string | string[] }

export interface LoggingConfig {
  argument: string
  file: { id: string; sha1: string; size: number; url: string }
  type: string
}

export interface VersionJson {
  id: string
  inheritsFrom?: string
  type: string
  time?: string
  releaseTime?: string
  mainClass: string
  /** Pre-1.13 argument format. */
  minecraftArguments?: string
  arguments?: { game?: ArgumentEntry[]; jvm?: ArgumentEntry[] }
  assetIndex?: { id: string; sha1: string; size: number; totalSize: number; url: string }
  assets?: string
  downloads?: Record<string, ArtifactDownload>
  libraries?: Library[]
  logging?: { client?: LoggingConfig }
  javaVersion?: { component: string; majorVersion: number }
  complianceLevel?: number
  minimumLauncherVersion?: number
  /** Orbit marker so we know which loader produced a synthetic version. */
  orbitLoader?: string
}

export interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>
  virtual?: boolean
  map_to_resources?: boolean
}

export interface FeatureFlags {
  is_demo_user?: boolean
  has_custom_resolution?: boolean
  has_quick_plays_support?: boolean
  is_quick_play_singleplayer?: boolean
  is_quick_play_multiplayer?: boolean
  is_quick_play_realms?: boolean
}

const OS_NAME = 'windows'

function osVersionMatches(pattern: string): boolean {
  try {
    // Node reports "10.0.26100" for Windows 11; Mojang matches on "^10\\."
    return new RegExp(pattern).test(release())
  } catch {
    return true
  }
}

function ruleMatches(rule: Rule, features: FeatureFlags): boolean {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== OS_NAME) return false
    if (rule.os.arch) {
      const arch = process.arch === 'x64' ? 'x86_64' : process.arch === 'ia32' ? 'x86' : process.arch
      if (rule.os.arch !== arch && !(rule.os.arch === 'x86' && process.arch === 'ia32')) return false
    }
    if (rule.os.version && !osVersionMatches(rule.os.version)) return false
  }

  if (rule.features) {
    for (const [key, expected] of Object.entries(rule.features)) {
      const actual = Boolean(features[key as keyof FeatureFlags])
      if (actual !== expected) return false
    }
  }

  return true
}

/** Mojang semantics: no rules means allowed; otherwise the last match wins. */
export function rulesAllow(rules: Rule[] | undefined, features: FeatureFlags = {}): boolean {
  if (!rules?.length) return true
  let allowed = false
  for (const rule of rules) {
    if (ruleMatches(rule, features)) allowed = rule.action === 'allow'
  }
  return allowed
}

export interface MavenCoordinate {
  group: string
  artifact: string
  version: string
  classifier: string | null
  extension: string
}

/** Parses `group:artifact:version[:classifier][@ext]`. */
export function parseMaven(name: string): MavenCoordinate {
  let extension = 'jar'
  let base = name
  const at = base.lastIndexOf('@')
  if (at > -1) {
    extension = base.slice(at + 1)
    base = base.slice(0, at)
  }
  const parts = base.split(':')
  return {
    group: parts[0] ?? '',
    artifact: parts[1] ?? '',
    version: parts[2] ?? '',
    classifier: parts[3] ?? null,
    extension
  }
}

/** Relative repository path for a Maven coordinate, using `/` separators. */
export function mavenPath(name: string): string {
  const { group, artifact, version, classifier, extension } = parseMaven(name)
  const fileName = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${extension}`
  return [...group.split('.'), artifact, version, fileName].join('/')
}

/** `group:artifact` — the identity used when de-duplicating libraries. */
export function mavenKey(name: string): string {
  const { group, artifact, classifier } = parseMaven(name)
  return `${group}:${artifact}${classifier ? `:${classifier}` : ''}`
}

/** Resolves the natives classifier for this platform, if the library has one. */
export function nativesClassifier(library: Library): string | null {
  if (!library.natives) return null
  const template = library.natives[OS_NAME]
  if (!template) return null
  return template.replace('${arch}', process.arch === 'ia32' ? '32' : '64')
}

/** Flattens Mojang's conditional argument lists into a plain string array. */
export function resolveArguments(entries: ArgumentEntry[] | undefined, features: FeatureFlags): string[] {
  if (!entries) return []
  const out: string[] = []
  for (const entry of entries) {
    if (typeof entry === 'string') {
      out.push(entry)
      continue
    }
    if (!rulesAllow(entry.rules, features)) continue
    if (Array.isArray(entry.value)) out.push(...entry.value)
    else out.push(entry.value)
  }
  return out
}

/**
 * Merges a child version manifest onto the parent it inherits from.
 * Loader manifests (Fabric/Forge/…) rely on this to add libraries and
 * override the main class while reusing vanilla assets.
 */
export function mergeVersions(parent: VersionJson, child: VersionJson): VersionJson {
  const merged: VersionJson = {
    ...parent,
    ...child,
    id: child.id,
    inheritsFrom: undefined,
    mainClass: child.mainClass || parent.mainClass,
    assetIndex: child.assetIndex ?? parent.assetIndex,
    assets: child.assets ?? parent.assets,
    downloads: { ...parent.downloads, ...child.downloads },
    logging: child.logging ?? parent.logging,
    javaVersion: child.javaVersion ?? parent.javaVersion
  }

  // Child libraries win over the parent's for the same group:artifact.
  const byKey = new Map<string, Library>()
  for (const library of parent.libraries ?? []) byKey.set(mavenKey(library.name), library)
  for (const library of child.libraries ?? []) byKey.set(mavenKey(library.name), library)
  merged.libraries = [...byKey.values()]

  if (child.arguments || parent.arguments) {
    merged.arguments = {
      game: [...(parent.arguments?.game ?? []), ...(child.arguments?.game ?? [])],
      jvm: [...(parent.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])]
    }
  }

  // Legacy manifests use a single argument string; the child replaces it wholesale.
  if (child.minecraftArguments) merged.minecraftArguments = child.minecraftArguments
  else if (parent.minecraftArguments) merged.minecraftArguments = parent.minecraftArguments

  return merged
}
