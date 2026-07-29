import { execFile } from 'node:child_process'
import { readdir, readFile, realpath, rename, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import type { JavaDownloadOption, JavaRuntime } from '../../shared/types'
import { ensureDir, exists, readJson, removePath, writeJson } from '../core/fsx'
import { log } from '../core/logger'
import { getJson } from '../core/net'
import { paths } from '../core/paths'
import { settings } from '../core/settings'
import { extractZip } from '../core/zip'
import { downloadFile } from './downloads'
import { tasks, type TaskHandle } from './tasks'

const execFileAsync = promisify(execFile)


export const SUPPORTED_JAVA_MAJORS = [8, 17, 21] as const

const JAVA_LABELS: Record<number, string> = {
  8: 'Java 8 — Minecraft 1.16.5 and older',
  17: 'Java 17 — Minecraft 1.17 through 1.20.4',
  21: 'Java 21 — Minecraft 1.20.5 and newer'
}

interface JavaIndexFile {
  version: 1
  runtimes: JavaRuntime[]
}





function parseMajor(version: string): number {
  const cleaned = version.trim().replace(/^"|"$/g, '')

  const legacy = /^1\.(\d+)/.exec(cleaned)
  if (legacy) return Number(legacy[1])
  const modern = /^(\d+)/.exec(cleaned)
  return modern ? Number(modern[1]) : 0
}


async function readReleaseFile(home: string): Promise<{ version: string; vendor: string; arch: string } | null> {
  try {
    const raw = await readFile(join(home, 'release'), 'utf8')
    const get = (key: string): string => {
      const match = new RegExp(`^${key}="?([^"\\n\\r]+)"?`, 'm').exec(raw)
      return match ? match[1].trim() : ''
    }
    const version = get('JAVA_VERSION')
    if (!version) return null
    return {
      version,
      vendor: get('IMPLEMENTOR') || 'Unknown',
      arch: get('OS_ARCH') || 'x86_64'
    }
  } catch {
    return null
  }
}


async function probeExecutable(javaExe: string): Promise<{ version: string; vendor: string; arch: string } | null> {
  try {
    const { stderr, stdout } = await execFileAsync(javaExe, ['-XshowSettings:properties', '-version'], {
      timeout: 12_000,
      windowsHide: true
    })
    const text = `${stderr}\n${stdout}`
    const version =
      /java\.version\s*=\s*([^\s]+)/.exec(text)?.[1] ?? /version "([^"]+)"/.exec(text)?.[1] ?? ''
    if (!version) return null
    return {
      version,
      vendor: /java\.vendor\s*=\s*(.+)/.exec(text)?.[1]?.trim() ?? 'Unknown',
      arch: /os\.arch\s*=\s*([^\s]+)/.exec(text)?.[1] ?? 'x86_64'
    }
  } catch {
    return null
  }
}


async function resolveJavaExecutable(home: string): Promise<string | null> {
  for (const name of ['javaw.exe', 'java.exe']) {
    const candidate = join(home, 'bin', name)
    if (await exists(candidate)) return candidate
  }
  return null
}

function runtimeIdFor(path: string): string {
  return createHash('sha1').update(path.toLowerCase()).digest('hex').slice(0, 16)
}


function guessVendor(home: string): string {
  const lower = home.toLowerCase()
  if (lower.includes('adoptium') || lower.includes('temurin')) return 'Eclipse Temurin'
  if (lower.includes('corretto')) return 'Amazon Corretto'
  if (lower.includes('zulu')) return 'Azul Zulu'
  if (lower.includes('microsoft')) return 'Microsoft'
  if (lower.includes('graalvm')) return 'GraalVM'
  if (lower.includes('semeru') || lower.includes('openj9')) return 'IBM Semeru'
  if (lower.includes('\\java\\') || lower.includes('/java/')) return 'Oracle'
  return 'Java'
}

export async function inspectJavaHome(home: string, managed: boolean): Promise<JavaRuntime | null> {
  const executable = await resolveJavaExecutable(home)
  if (!executable) return null

  const info = (await readReleaseFile(home)) ?? (await probeExecutable(executable))
  if (!info) return null

  const majorVersion = parseMajor(info.version)
  if (!majorVersion) return null

  const cleanedVendor = info.vendor.replace(/\s*(Inc\.?|Corporation|Ltd\.?)\s*$/i, '').trim()
  const vendor = !cleanedVendor || cleanedVendor.toLowerCase() === 'unknown' ? guessVendor(home) : cleanedVendor
  const version = info.version.replace(/^"|"$/g, '')



  const canonical = await realpath(executable).catch(() => executable)

  return {
    id: runtimeIdFor(canonical),
    path: executable,
    version,
    majorVersion,
    vendor,
    arch: info.arch.includes('64') ? 'x64' : 'x86',
    managed,
    label: `${vendor} ${version}`
  }
}


async function normalizeToHome(input: string): Promise<string> {
  try {
    const info = await stat(input)
    if (info.isFile()) {
      const bin = dirname(input)
      return basename(bin).toLowerCase() === 'bin' ? dirname(bin) : bin
    }
  } catch {

  }
  return input
}





function candidateRoots(): string[] {
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const localAppData = process.env.LOCALAPPDATA ?? ''

  return [
    join(programFiles, 'Java'),
    join(programFiles, 'Eclipse Adoptium'),
    join(programFiles, 'Eclipse Foundation'),
    join(programFiles, 'AdoptOpenJDK'),
    join(programFiles, 'Microsoft'),
    join(programFiles, 'Amazon Corretto'),
    join(programFiles, 'Zulu'),
    join(programFiles, 'BellSoft'),
    join(programFiles, 'RedHat'),
    join(programFiles, 'SapMachine'),
    join(programFiles, 'Semeru'),
    join(programFilesX86, 'Java'),
    join(programFilesX86, 'Eclipse Adoptium'),
    localAppData ? join(localAppData, 'Programs', 'Eclipse Adoptium') : '',

    localAppData ? join(localAppData, 'Packages') : '',
    join(programFilesX86, 'Minecraft Launcher', 'runtime'),
    paths.javaDir
  ].filter(Boolean)
}

async function scanRoot(root: string, depth: number, found: Set<string>): Promise<string[]> {
  if (depth <= 0 || !(await exists(root))) return []
  const homes: string[] = []
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return []
  }

  for (const entry of entries) {
    const full = join(root, entry)
    if (found.has(full.toLowerCase())) continue
    if (await exists(join(full, 'bin', 'java.exe'))) {
      found.add(full.toLowerCase())
      homes.push(full)
    } else if (depth > 1) {
      homes.push(...(await scanRoot(full, depth - 1, found)))
    }
  }
  return homes
}





class JavaManager {
  private runtimes: JavaRuntime[] = []
  private loaded = false

  async load(): Promise<void> {
    const stored = await readJson<JavaIndexFile>(paths.javaIndexFile)
    this.runtimes = stored?.runtimes ?? []
    this.loaded = true


    const alive: JavaRuntime[] = []
    for (const runtime of this.runtimes) {
      if (await exists(runtime.path)) alive.push(runtime)
    }
    if (alive.length !== this.runtimes.length) {
      this.runtimes = alive
      await this.persist()
    }
  }

  private async persist(): Promise<void> {
    await writeJson(paths.javaIndexFile, { version: 1, runtimes: this.runtimes } satisfies JavaIndexFile)
  }

  private sort(): void {
    this.runtimes.sort((a, b) => b.majorVersion - a.majorVersion || Number(b.managed) - Number(a.managed))
  }

  async list(): Promise<JavaRuntime[]> {
    if (!this.loaded) await this.load()
    if (!this.runtimes.length) await this.scan()
    return [...this.runtimes]
  }


  async scan(): Promise<JavaRuntime[]> {
    const seen = new Set<string>()
    const homes: string[] = []

    if (process.env.JAVA_HOME) homes.push(process.env.JAVA_HOME)
    for (const root of candidateRoots()) {
      homes.push(...(await scanRoot(root, root === paths.javaDir ? 3 : 2, seen)))
    }

    const discovered: JavaRuntime[] = []
    for (const home of homes) {
      const runtime = await inspectJavaHome(home, home.toLowerCase().startsWith(paths.javaDir.toLowerCase()))
      if (runtime && !discovered.some((r) => r.id === runtime.id)) discovered.push(runtime)
    }


    const manual = this.runtimes.filter((r) => !r.managed && !discovered.some((d) => d.id === r.id))
    const stillThere: JavaRuntime[] = []
    for (const runtime of manual) {
      if (await exists(runtime.path)) stillThere.push(runtime)
    }

    this.runtimes = [...discovered, ...stillThere]
    this.sort()
    await this.persist()
    log.info('java', `Found ${this.runtimes.length} Java runtime(s)`)
    return [...this.runtimes]
  }

  async addManual(inputPath: string): Promise<JavaRuntime> {
    const home = await normalizeToHome(inputPath)
    const runtime = await inspectJavaHome(home, false)
    if (!runtime) throw new Error(`No usable Java runtime at ${inputPath}`)
    if (!this.runtimes.some((r) => r.id === runtime.id)) {
      this.runtimes.push(runtime)
      this.sort()
      await this.persist()
    }
    return runtime
  }

  async remove(id: string): Promise<void> {
    const runtime = this.runtimes.find((r) => r.id === id)
    if (!runtime) return
    this.runtimes = this.runtimes.filter((r) => r.id !== id)
    await this.persist()

    if (runtime.managed) {
      const home = dirname(dirname(runtime.path))
      if (home.toLowerCase().startsWith(paths.javaDir.toLowerCase())) await removePath(home)
    }
  }

  async test(inputPath: string): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      const home = await normalizeToHome(inputPath)
      const runtime = await inspectJavaHome(home, false)
      if (!runtime) return { ok: false, error: 'No java.exe found at that location.' }
      if (runtime.arch !== 'x64') {
        return { ok: false, error: '32-bit Java cannot allocate enough memory for modern Minecraft.' }
      }
      return { ok: true, version: `${runtime.vendor} ${runtime.version}` }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async downloadable(): Promise<JavaDownloadOption[]> {
    const installed = await this.list()
    return SUPPORTED_JAVA_MAJORS.map((major) => ({
      majorVersion: major,
      label: `Temurin ${major}`,
      description: JAVA_LABELS[major] ?? `Java ${major}`,
      installed: installed.some((r) => r.majorVersion === major)
    }))
  }


  async install(majorVersion: number, existingTask?: TaskHandle): Promise<JavaRuntime> {
    const run = async (task: TaskHandle): Promise<JavaRuntime> => {
      task.setDetail('Looking up the latest Temurin build…')

      const asset = await fetchTemurinAsset(majorVersion)
      const targetHome = join(paths.javaDir, `temurin-${majorVersion}`)
      const archive = join(paths.downloadsCacheDir, asset.fileName)

      task.setDetail(`Downloading ${asset.fileName}`)
      await downloadFile(
        { url: asset.url, target: archive, sha256: asset.sha256, size: asset.size },
        { task: task.slice(0, 0.75) }
      )

      task.setDetail('Extracting…')
      await removePath(targetHome)
      const staging = join(paths.javaDir, `.staging-${majorVersion}`)
      await removePath(staging)
      await ensureDir(staging)

      const extractTask = task.slice(0.75, 0.97)
      await extractZip(archive, staging, {
        onProgress: (done, total) => extractTask.setProgress(total ? done / total : -1),
        signal: task.signal
      })


      const entries = await readdir(staging)
      const root = entries.length === 1 ? join(staging, entries[0]) : staging
      await rename(root, targetHome)
      await removePath(staging)
      await removePath(archive)

      const runtime = await inspectJavaHome(targetHome, true)
      if (!runtime) throw new Error('The downloaded runtime did not contain a usable java.exe')

      this.runtimes = this.runtimes.filter((r) => r.id !== runtime.id)
      this.runtimes.push(runtime)
      this.sort()
      await this.persist()

      task.setProgress(1)
      task.setDetail(`${runtime.vendor} ${runtime.version} ready`)
      log.info('java', `Installed managed runtime ${runtime.version} at ${targetHome}`)
      return runtime
    }

    if (existingTask) return run(existingTask)
    return tasks.run({ title: `Installing Java ${majorVersion}`, kind: 'java' }, run)
  }





  async resolveFor(
    requiredMajor: number,
    override?: { runtimeId?: string | null; path?: string | null }
  ): Promise<JavaRuntime> {
    if (override?.path) {
      const home = await normalizeToHome(override.path)
      const runtime = await inspectJavaHome(home, false)
      if (runtime) return runtime
      throw new Error(`The Java path configured for this instance is not valid: ${override.path}`)
    }

    const available = await this.list()

    if (override?.runtimeId) {
      const chosen = available.find((r) => r.id === override.runtimeId)
      if (chosen) return chosen
    }

    const defaultId = settings.get().defaultJavaRuntimeId
    const preferred = defaultId ? available.find((r) => r.id === defaultId) : undefined
    if (preferred && preferred.majorVersion >= requiredMajor) return preferred

    const exact = available.filter((r) => r.majorVersion === requiredMajor && r.arch === 'x64')
    if (exact.length) return exact[0]


    if (requiredMajor >= 17) {
      const newer = available
        .filter((r) => r.majorVersion > requiredMajor && r.arch === 'x64')
        .sort((a, b) => a.majorVersion - b.majorVersion)
      if (newer.length) return newer[0]
    }

    if (settings.get().autoDownloadJava) {

      const installable =
        SUPPORTED_JAVA_MAJORS.filter((major) => major >= requiredMajor).sort((a, b) => a - b)[0] ??
        Math.max(...SUPPORTED_JAVA_MAJORS)
      log.info('java', `No Java ${requiredMajor} available — installing Temurin ${installable}`)
      return this.install(installable)
    }

    const any = available.find((r) => r.arch === 'x64')
    if (any) return any

    throw new Error(
      `This version needs Java ${requiredMajor}, but no suitable runtime is installed. ` +
        'Install one from Settings → Java, or turn on automatic Java downloads.'
    )
  }


  recommendedMajorFor(minecraftVersion: string): number {
    const match = /^1\.(\d+)(?:\.(\d+))?/.exec(minecraftVersion)
    if (!match) return 21
    const minor = Number(match[1])
    const patch = Number(match[2] ?? 0)
    if (minor >= 21) return 21
    if (minor === 20 && patch >= 5) return 21
    if (minor >= 18) return 17
    if (minor === 17) return 17
    return 8
  }
}





interface AdoptiumAsset {
  binary: {
    package: { link: string; name: string; size: number; checksum: string }
    image_type: string
    architecture: string
  }
  version: { semver: string }
}

async function fetchTemurinAsset(
  majorVersion: number
): Promise<{ url: string; fileName: string; size: number; sha256: string; semver: string }> {
  const base = 'https://api.adoptium.net/v3/assets/latest'
  const query = 'architecture=x64&os=windows&vendor=eclipse&heap_size=normal'

  for (const imageType of ['jre', 'jdk']) {
    try {
      const assets = await getJson<AdoptiumAsset[]>(
        `${base}/${majorVersion}/hotspot?${query}&image_type=${imageType}`,
        { timeoutMs: 25_000 }
      )
      const zip = assets.find((a) => a.binary.package.name.toLowerCase().endsWith('.zip'))
      if (zip) {
        return {
          url: zip.binary.package.link,
          fileName: zip.binary.package.name,
          size: zip.binary.package.size,
          sha256: zip.binary.package.checksum,
          semver: zip.version.semver
        }
      }
    } catch (err) {
      log.warn('java', `Adoptium lookup failed for ${imageType} ${majorVersion}`, err)
    }
  }

  throw new Error(`Could not find a Windows x64 build of Java ${majorVersion} on Adoptium.`)
}

export const java = new JavaManager()
