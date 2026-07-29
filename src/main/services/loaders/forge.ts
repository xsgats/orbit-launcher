import { execFile } from 'node:child_process'
import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LoaderVersion } from '../../../shared/types'
import { ensureDir, exists, hashFile, removePath } from '../../core/fsx'
import { log } from '../../core/logger'
import { cached, getJson } from '../../core/net'
import { paths } from '../../core/paths'
import { extractZip, readZipEntry, readZipJson } from '../../core/zip'
import { downloadAll, downloadFile } from '../downloads'
import { java } from '../java'
import { mavenPath, type Library, type VersionJson } from '../minecraft/schema'
import { saveVersionJson, versionJarPath } from '../minecraft/versions'
import { TaskCancelledError, type TaskHandle } from '../tasks'

/* ------------------------------------------------------------------ */
/* Flavour configuration                                               */
/* ------------------------------------------------------------------ */

export type ForgeFlavour = 'forge' | 'neoforge'

const FORGE_MAVEN = 'https://maven.minecraftforge.net'
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases'
const TTL = 15 * 60 * 1000

/* ------------------------------------------------------------------ */
/* Version listing                                                     */
/* ------------------------------------------------------------------ */

interface ForgePromotions {
  promos: Record<string, string>
}

async function forgeMetadata(): Promise<Record<string, string[]>> {
  return cached('forge-maven-metadata', TTL, () =>
    getJson<Record<string, string[]>>(
      'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json',
      { timeoutMs: 25_000 }
    )
  )
}

async function forgePromotions(): Promise<ForgePromotions> {
  return cached('forge-promotions', TTL, () =>
    getJson<ForgePromotions>(
      'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
      { timeoutMs: 25_000 }
    )
  )
}

interface NeoVersionList {
  isSnapshot: boolean
  versions: string[]
}

async function neoforgeVersions(): Promise<string[]> {
  return cached('neoforge-versions', TTL, async () => {
    const [modern, legacy] = await Promise.all([
      getJson<NeoVersionList>('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge', {
        timeoutMs: 25_000
      }).catch(() => ({ versions: [] as string[] })),
      getJson<NeoVersionList>('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/forge', {
        timeoutMs: 25_000
      }).catch(() => ({ versions: [] as string[] }))
    ])
    return [...modern.versions, ...legacy.versions]
  })
}

/** NeoForge encodes the game version in its own: `20.4.190` -> `1.20.4`. */
export function neoforgeMinecraftVersion(version: string): string | null {
  // The 1.20.1 line kept Forge's `1.20.1-47.x` scheme.
  const legacy = /^(\d+\.\d+(?:\.\d+)?)-/.exec(version)
  if (legacy) return legacy[1]

  const modern = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version)
  if (!modern) return null
  const minor = Number(modern[2])
  return minor === 0 ? `1.${modern[1]}` : `1.${modern[1]}.${minor}`
}

function isNeoStable(version: string): boolean {
  return !/(beta|alpha|rc|pre)/i.test(version)
}

export async function listSupportedMinecraft(flavour: ForgeFlavour): Promise<string[]> {
  if (flavour === 'forge') {
    return Object.keys(await forgeMetadata()).sort(compareMinecraftVersionsDesc)
  }
  const seen = new Set<string>()
  for (const version of await neoforgeVersions()) {
    const mc = neoforgeMinecraftVersion(version)
    if (mc) seen.add(mc)
  }
  return [...seen].sort(compareMinecraftVersionsDesc)
}

function compareMinecraftVersionsDesc(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (diff) return diff
  }
  return 0
}

export async function listLoaderVersions(
  flavour: ForgeFlavour,
  minecraftVersion: string
): Promise<LoaderVersion[]> {
  if (flavour === 'forge') {
    const [metadata, promos] = await Promise.all([forgeMetadata(), forgePromotions()])
    const all = metadata[minecraftVersion] ?? []
    const recommended = promos.promos[`${minecraftVersion}-recommended`]
    const latest = promos.promos[`${minecraftVersion}-latest`]

    return all
      .slice()
      .reverse()
      .map((full) => {
        const short = shortForgeVersion(minecraftVersion, full)
        return {
          id: full,
          stable: short === recommended || !/(beta|alpha|pre)/i.test(full),
          recommended: short === recommended,
          latest: short === latest
        }
      })
  }

  const versions = (await neoforgeVersions())
    .filter((version) => neoforgeMinecraftVersion(version) === minecraftVersion)
    .sort(compareNeoDesc)

  let markedLatest = false
  return versions.map((version) => {
    const stable = isNeoStable(version)
    const latest = stable && !markedLatest
    if (latest) markedLatest = true
    return { id: version, stable, recommended: latest, latest }
  })
}

function compareNeoDesc(a: string, b: string): number {
  const clean = (v: string): number[] => v.split(/[.-]/).map((p) => Number(p) || 0)
  const pa = clean(a)
  const pb = clean(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (diff) return diff
  }
  return 0
}

/** `1.20.1-47.2.20` -> `47.2.20` for display and promotion lookups. */
export function shortForgeVersion(minecraftVersion: string, full: string): string {
  return full.startsWith(`${minecraftVersion}-`) ? full.slice(minecraftVersion.length + 1) : full
}

export async function latestLoaderVersion(
  flavour: ForgeFlavour,
  minecraftVersion: string
): Promise<string> {
  const versions = await listLoaderVersions(flavour, minecraftVersion)
  const chosen = versions.find((v) => v.recommended) ?? versions.find((v) => v.stable) ?? versions[0]
  if (!chosen) {
    throw new Error(
      `${flavour === 'forge' ? 'Forge' : 'NeoForge'} has no build for Minecraft ${minecraftVersion}.`
    )
  }
  return chosen.id
}

/* ------------------------------------------------------------------ */
/* Installer manifests                                                 */
/* ------------------------------------------------------------------ */

interface Processor {
  sides?: string[]
  jar: string
  classpath: string[]
  args: string[]
  outputs?: Record<string, string>
}

interface InstallProfile {
  spec?: number
  profile?: string
  version?: string
  minecraft?: string
  json?: string
  path?: string
  libraries?: Library[]
  processors?: Processor[]
  data?: Record<string, { client: string; server: string }>
  /** Pre-1.13 installers embed everything in these two fields. */
  install?: {
    profileName?: string
    target?: string
    path?: string
    version?: string
    filePath?: string
    minecraft?: string
  }
  versionInfo?: VersionJson
}

function installerUrl(flavour: ForgeFlavour, minecraftVersion: string, loaderVersion: string): string {
  if (flavour === 'forge') {
    const full = loaderVersion.startsWith(`${minecraftVersion}-`)
      ? loaderVersion
      : `${minecraftVersion}-${loaderVersion}`
    return `${FORGE_MAVEN}/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`
  }
  // NeoForge kept the old coordinates for the 1.20.1 line.
  const artifact = /^\d+\.\d+(\.\d+)?-/.test(loaderVersion) ? 'forge' : 'neoforge'
  return `${NEOFORGE_MAVEN}/net/neoforged/${artifact}/${loaderVersion}/${artifact}-${loaderVersion}-installer.jar`
}

/* ------------------------------------------------------------------ */
/* Processor execution                                                 */
/* ------------------------------------------------------------------ */

function libraryPathFor(coordinate: string): string {
  return join(paths.librariesDir, ...mavenPath(coordinate).split('/'))
}

/** `[net.minecraftforge:forge:1.20.1-47.2.20:client]` -> absolute jar path. */
function resolveToken(token: string, data: Map<string, string>): string {
  if (token.startsWith('[') && token.endsWith(']')) {
    return libraryPathFor(token.slice(1, -1))
  }
  return token.replace(/\{([A-Z0-9_]+)\}/g, (match, key: string) => data.get(key) ?? match)
}

async function readMainClass(jarPath: string): Promise<string> {
  const manifest = await readZipEntry(jarPath, 'META-INF/MANIFEST.MF')
  if (!manifest) throw new Error(`No manifest in ${jarPath}`)

  // Unfold the 72-byte line wrapping the jar spec mandates.
  const unfolded = manifest.toString('utf8').replace(/\r\n/g, '\n').replace(/\n /g, '')
  const match = /^Main-Class:\s*(.+)$/m.exec(unfolded)
  if (!match) throw new Error(`No Main-Class in ${jarPath}`)
  return match[1].trim()
}

async function runProcessor(
  processor: Processor,
  data: Map<string, string>,
  javaPath: string,
  signal?: AbortSignal
): Promise<void> {
  if (processor.sides?.length && !processor.sides.includes('client')) return

  const jarPath = libraryPathFor(processor.jar)
  if (!(await exists(jarPath))) throw new Error(`Missing processor jar ${processor.jar}`)

  const classpath = [jarPath, ...processor.classpath.map(libraryPathFor)]
  const mainClass = await readMainClass(jarPath)
  const args = processor.args.map((arg) => resolveToken(arg, data))

  // Skip work that a previous install already produced.
  if (processor.outputs && Object.keys(processor.outputs).length) {
    let allFresh = true
    for (const [rawTarget, rawHash] of Object.entries(processor.outputs)) {
      const target = resolveToken(rawTarget, data)
      const expected = resolveToken(rawHash, data).replace(/'/g, '')
      if (!(await exists(target))) {
        allFresh = false
        break
      }
      if (expected && (await hashFile(target, 'sha1')) !== expected) {
        allFresh = false
        break
      }
    }
    if (allFresh) return
  }

  await new Promise<void>((resolvePromise, reject) => {
    const child = execFile(
      javaPath,
      ['-cp', classpath.join(';'), mainClass, ...args],
      { maxBuffer: 32 * 1024 * 1024, windowsHide: true, timeout: 10 * 60 * 1000 },
      (err, stdout, stderr) => {
        if (err) {
          const detail = `${stdout}\n${stderr}`.trim().split('\n').slice(-12).join('\n')
          reject(new Error(`Processor ${mainClass} failed:\n${detail || err.message}`))
        } else {
          resolvePromise()
        }
      }
    )
    signal?.addEventListener(
      'abort',
      () => {
        child.kill()
        reject(new TaskCancelledError())
      },
      { once: true }
    )
  })

  // Verify what the processor claimed to produce.
  for (const [rawTarget, rawHash] of Object.entries(processor.outputs ?? {})) {
    const target = resolveToken(rawTarget, data)
    const expected = resolveToken(rawHash, data).replace(/'/g, '')
    if (!(await exists(target))) throw new Error(`Processor ${mainClass} did not produce ${target}`)
    if (expected) {
      const actual = await hashFile(target, 'sha1')
      if (actual !== expected) {
        throw new Error(`Processor output ${target} failed verification (expected ${expected}, got ${actual})`)
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Install                                                             */
/* ------------------------------------------------------------------ */

/**
 * Installs Forge or NeoForge by running the official installer's own
 * transformation pipeline, exactly as the vendor's installer would.
 */
export async function installForgeLike(
  flavour: ForgeFlavour,
  minecraftVersion: string,
  loaderVersion: string,
  task?: TaskHandle
): Promise<string> {
  const name = flavour === 'forge' ? 'Forge' : 'NeoForge'
  const url = installerUrl(flavour, minecraftVersion, loaderVersion)
  const installerJar = join(paths.downloadsCacheDir, `${flavour}-${loaderVersion}-installer.jar`)

  task?.setDetail(`Downloading the ${name} installer…`)
  await downloadFile({ url, target: installerJar }, { task: task?.slice(0, 0.15), verify: false })

  const profile = await readZipJson<InstallProfile>(installerJar, 'install_profile.json')
  if (!profile) throw new Error(`The ${name} installer did not contain install_profile.json`)

  const workDir = await mkdtemp(join(tmpdir(), 'orbit-forge-'))

  try {
    /* -------------------------------------------------------------- */
    /* Legacy installers (Minecraft 1.12.2 and older)                  */
    /* -------------------------------------------------------------- */
    if (profile.versionInfo && profile.install) {
      task?.setDetail(`Installing ${name}…`)
      const versionJson = profile.versionInfo
      versionJson.orbitLoader = flavour
      if (!versionJson.inheritsFrom) versionJson.inheritsFrom = minecraftVersion
      await saveVersionJson(versionJson)

      // The universal jar lives at the installer root; move it into the library store.
      const filePath = profile.install.filePath
      const coordinate = profile.install.path
      if (filePath && coordinate) {
        const target = libraryPathFor(coordinate)
        const buffer = await readZipEntry(installerJar, filePath)
        if (buffer) {
          await ensureDir(join(target, '..'))
          await writeFile(target, buffer)
        }
      }

      // Newer 1.12 installers also ship a bundled maven tree.
      await extractZip(installerJar, paths.librariesDir, { stripPrefix: 'maven/' }).catch(() => 0)

      task?.setProgress(1)
      log.info('loaders', `Installed ${name} ${loaderVersion} as ${versionJson.id}`)
      return versionJson.id
    }

    /* -------------------------------------------------------------- */
    /* Modern installers (Minecraft 1.13+)                             */
    /* -------------------------------------------------------------- */
    const versionJson = await readZipJson<VersionJson>(installerJar, (profile.json ?? '/version.json').replace(/^\//, ''))
    if (!versionJson?.id) throw new Error(`The ${name} installer did not contain a version manifest`)

    versionJson.orbitLoader = flavour
    if (!versionJson.inheritsFrom) versionJson.inheritsFrom = profile.minecraft ?? minecraftVersion
    await saveVersionJson(versionJson)

    task?.setDetail('Unpacking bundled libraries…')
    await extractZip(installerJar, paths.librariesDir, { stripPrefix: 'maven/' }).catch(() => 0)
    await extractZip(installerJar, join(workDir, 'data'), { stripPrefix: 'data/' }).catch(() => 0)

    // Installer-only tooling (jarsplitter, ForgeAutoRenamingTool, …).
    task?.setDetail('Downloading installer tools…')
    const toolSpecs = (profile.libraries ?? [])
      .map((library) => {
        const artifact = library.downloads?.artifact
        const relative = artifact?.path ?? mavenPath(library.name)
        const downloadUrl = artifact?.url || (library.url ? `${library.url.replace(/\/$/, '')}/${relative}` : '')
        if (!downloadUrl) return null
        return {
          url: downloadUrl,
          target: join(paths.librariesDir, ...relative.split('/')),
          sha1: artifact?.sha1 ?? null,
          size: artifact?.size ?? null
        }
      })
      .filter((spec): spec is NonNullable<typeof spec> => spec !== null)

    await downloadAll(toolSpecs, { task: task?.slice(0.15, 0.4), signal: task?.signal })

    if (!profile.processors?.length) {
      task?.setProgress(1)
      log.info('loaders', `Installed ${name} ${loaderVersion} as ${versionJson.id} (no processors)`)
      return versionJson.id
    }

    /* Build the substitution table the processors expect. */
    task?.setDetail('Preparing the patch pipeline…')
    const data = new Map<string, string>()
    const vanillaJar = versionJarPath(profile.minecraft ?? minecraftVersion)

    data.set('SIDE', 'client')
    data.set('MINECRAFT_JAR', vanillaJar)
    data.set('MINECRAFT_VERSION', profile.minecraft ?? minecraftVersion)
    data.set('ROOT', workDir)
    data.set('INSTALLER', installerJar)
    data.set('LIBRARY_DIR', paths.librariesDir)

    for (const [key, value] of Object.entries(profile.data ?? {})) {
      const raw = value.client
      if (!raw) continue
      if (raw.startsWith('[') && raw.endsWith(']')) {
        data.set(key, libraryPathFor(raw.slice(1, -1)))
      } else if (raw.startsWith('/')) {
        // Extracted above into <workDir>/data.
        data.set(key, join(workDir, 'data', ...raw.replace(/^\/data\//, '').replace(/^\//, '').split('/')))
      } else {
        data.set(key, raw.replace(/^'|'$/g, ''))
      }
    }

    if (!(await exists(vanillaJar))) {
      throw new Error(
        `${name} needs the vanilla ${profile.minecraft ?? minecraftVersion} client jar, which is not installed yet.`
      )
    }

    /* Processors run on a JVM matching the game's requirement. */
    const requiredMajor = versionJson.javaVersion?.majorVersion ?? java.recommendedMajorFor(minecraftVersion)
    const runtime = await java.resolveFor(requiredMajor)
    // Processors want a console JVM; javaw.exe detaches and loses the exit code.
    const javaExe = runtime.path.replace(/javaw\.exe$/i, 'java.exe')

    const total = profile.processors.length
    for (let index = 0; index < total; index++) {
      task?.throwIfCancelled()
      task?.setDetail(`Patching Minecraft (${index + 1} / ${total})…`)
      task?.setProgress(0.4 + (index / total) * 0.58)
      await runProcessor(profile.processors[index], data, javaExe, task?.signal)
    }

    task?.setProgress(1)
    log.info('loaders', `Installed ${name} ${loaderVersion} as ${versionJson.id}`)
    return versionJson.id
  } finally {
    await removePath(workDir).catch(() => undefined)
  }
}

/** Used by the instance installer to know whether a rerun is needed. */
export async function forgeArtifactsPresent(versionId: string): Promise<boolean> {
  const dir = join(paths.versionsDir, versionId)
  if (!(await exists(dir))) return false
  const entries = await readdir(dir).catch(() => [])
  return entries.some((file) => file.endsWith('.json'))
}
