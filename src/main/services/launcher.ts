import { spawn, type ChildProcess } from 'node:child_process'
import { app, BrowserWindow } from 'electron'
import { basename, join } from 'node:path'
import type { Instance, InstanceSettings } from '../../shared/types'
import { ensureDir, exists } from '../core/fsx'
import { log } from '../core/logger'
import { paths } from '../core/paths'
import { settings } from '../core/settings'
import { accounts } from './accounts'
import { instances } from './instances'
import { java } from './java'
import { findCrashReportSince, logStore } from './logs'
import { notifications } from './notifications'
import {
  assetsRootFor,
  buildClasspath,
  installVersion,
  loggingConfigPath,
  nativesDirFor,
  resolveVersion,
  versionJarPath
} from './minecraft/versions'
import { resolveArguments, type FeatureFlags, type VersionJson } from './minecraft/schema'
import { tasks } from './tasks'

interface RunningGame {
  instanceId: string
  child: ChildProcess
  startedAt: number
  killed: boolean
}

const running = new Map<string, RunningGame>()

/** Reads a per-instance setting, falling back to the global default. */
function resolveSetting<K extends keyof InstanceSettings>(
  instance: Instance,
  key: K,
  fallback: NonNullable<InstanceSettings[K]>
): NonNullable<InstanceSettings[K]> {
  const value = instance.settings[key]
  return (value ?? fallback) as NonNullable<InstanceSettings[K]>
}

function substitute(template: string, values: Record<string, string>): string {
  return template.replace(/\$\{([\w.]+)\}/g, (match, key: string) => values[key] ?? match)
}

/** Legacy manifests provide one flat argument string instead of a rule list. */
function legacyGameArguments(version: VersionJson): string[] {
  return version.minecraftArguments ? version.minecraftArguments.split(/\s+/).filter(Boolean) : []
}

const DEFAULT_JVM_ARGUMENTS = [
  '-Djava.library.path=${natives_directory}',
  '-Djna.tmpdir=${natives_directory}',
  '-Dorg.lwjgl.system.SharedLibraryExtractPath=${natives_directory}',
  '-Dio.netty.native.workdir=${natives_directory}',
  '-Dminecraft.launcher.brand=${launcher_name}',
  '-Dminecraft.launcher.version=${launcher_version}',
  '-cp',
  '${classpath}'
]

export interface LaunchOptions {
  instanceId: string
  accountId?: string
}

export async function launchInstance(options: LaunchOptions): Promise<void> {
  const instance = await instances.require(options.instanceId)

  if (running.has(instance.id)) throw new Error(`${instance.name} is already running.`)
  if (!settings.get().allowParallelInstances && running.size > 0) {
    throw new Error('Another instance is already running. Enable parallel launching in Settings to run more.')
  }

  const activeAccount = options.accountId ?? accounts.getActive()?.id
  if (!activeAccount) {
    throw new Error('Sign in with a Microsoft account before launching.')
  }

  await tasks.run(
    { title: `Launching ${instance.name}`, kind: 'install', instanceId: instance.id },
    async (task) => {
      instances.setStatus(instance.id, 'preparing')
      logStore.begin(instance.id)
      logStore.note(instance.id, `Preparing ${instance.name} (${instance.minecraftVersion}, ${instance.loader})`)

      try {
        /* 1. Credentials — refreshed transparently if close to expiry. */
        task.setDetail('Checking your Microsoft session…')
        const { account, accessToken } = await accounts.getValidToken(activeAccount)

        /* 2. Game files — ensureInstalled resolves the loader and downloads everything. */
        task.setDetail('Verifying game files…')
        instances.setStatus(instance.id, 'downloading')
        const versionId = await instances.ensureInstalled(instance.id, task.slice(0.05, 0.9))
        const version = await resolveVersion(versionId)

        /* 3. Java. */
        task.setDetail('Selecting a Java runtime…')
        instances.setStatus(instance.id, 'launching')
        const requiredMajor = version.javaMajor || java.recommendedMajorFor(instance.minecraftVersion)
        const runtime = await java.resolveFor(requiredMajor, {
          runtimeId: instance.settings.javaRuntimeId,
          path: instance.settings.javaPathOverride
        })

        /* 4. Build the command line. */
        const gameDir = instances.gameDir(instance)
        await ensureDir(gameDir)

        const command = await buildCommand({
          instance,
          version,
          versionId,
          gameDir,
          javaPath: runtime.path,
          playerName: account.username,
          uuid: account.uuid,
          accessToken,
          xuid: account.xuid ?? ''
        })

        logStore.note(
          instance.id,
          `Java: ${runtime.vendor} ${runtime.version} (${runtime.path})`
        )
        logStore.note(instance.id, `Main class: ${version.mainClass}`)

        /* 5. Optional pre-launch hook. */
        const preLaunch = instance.settings.preLaunchCommand?.trim()
        if (preLaunch) {
          logStore.note(instance.id, `Running pre-launch command: ${preLaunch}`)
          await runHook(preLaunch, gameDir, instance.id)
        }

        /* 6. Go. */
        task.setDetail('Starting Minecraft…')
        await spawnGame({
          instance,
          command,
          javaPath: runtime.path,
          gameDir,
          accountId: account.id,
          accountName: account.username
        })

        task.setProgress(1)
      } catch (err) {
        instances.setStatus(instance.id, 'error', err instanceof Error ? err.message : String(err))
        logStore.note(instance.id, `Launch failed: ${err instanceof Error ? err.message : err}`, 'error')
        throw err
      }
    }
  )
}

/* ------------------------------------------------------------------ */
/* Command construction                                                */
/* ------------------------------------------------------------------ */

interface CommandContext {
  instance: Instance
  version: Awaited<ReturnType<typeof resolveVersion>>
  versionId: string
  gameDir: string
  javaPath: string
  playerName: string
  uuid: string
  accessToken: string
  xuid: string
}

async function buildCommand(context: CommandContext): Promise<string[]> {
  const { instance, version, versionId, gameDir } = context
  const config = settings.get()

  const width = resolveSetting(instance, 'windowWidth', config.windowWidth)
  const height = resolveSetting(instance, 'windowHeight', config.windowHeight)
  const fullscreen = resolveSetting(instance, 'fullscreen', config.fullscreen)
  const memoryMax = resolveSetting(instance, 'memoryMaxMb', config.memoryMaxMb)
  const memoryMin = Math.min(resolveSetting(instance, 'memoryMinMb', config.memoryMinMb), memoryMax)

  const quickPlaySingleplayer = instance.settings.quickPlaySingleplayer?.trim() ?? ''
  const quickPlayServer = instance.settings.quickPlayServer?.trim() ?? ''

  const features: FeatureFlags = {
    is_demo_user: false,
    has_custom_resolution: !fullscreen,
    has_quick_plays_support: Boolean(quickPlaySingleplayer || quickPlayServer),
    is_quick_play_singleplayer: Boolean(quickPlaySingleplayer),
    is_quick_play_multiplayer: Boolean(quickPlayServer),
    is_quick_play_realms: false
  }

  const clientJar = versionJarPath(version.chain[0])
  const classpath = buildClasspath(version, clientJar)
  const nativesDir = nativesDirFor(versionId)
  const assets = assetsRootFor(version)

  const values: Record<string, string> = {
    auth_player_name: context.playerName,
    version_name: versionId,
    game_directory: gameDir,
    assets_root: assets.dir,
    game_assets: assets.dir,
    assets_index_name: assets.index,
    auth_uuid: context.uuid,
    auth_access_token: context.accessToken,
    auth_session: `token:${context.accessToken}:${context.uuid}`,
    auth_xuid: context.xuid,
    clientid: 'orbit-launcher',
    user_type: 'msa',
    user_properties: '{}',
    version_type: instance.minecraftVersionType,
    resolution_width: String(width),
    resolution_height: String(height),
    natives_directory: nativesDir,
    classpath: classpath.join(';'),
    classpath_separator: ';',
    library_directory: paths.librariesDir,
    launcher_name: 'OrbitLauncher',
    launcher_version: app.getVersion(),
    quickPlayPath: join(gameDir, 'quickPlay.json'),
    quickPlaySingleplayer: quickPlaySingleplayer,
    quickPlayMultiplayer: quickPlayServer,
    quickPlayRealms: ''
  }

  /* --- JVM arguments --- */
  const jvmFromManifest = resolveArguments(version.arguments?.jvm, features)
  const jvmTemplate = jvmFromManifest.length ? jvmFromManifest : DEFAULT_JVM_ARGUMENTS
  const jvmArgs = jvmTemplate.map((arg) => substitute(arg, values))

  const memoryArgs = [`-Xms${memoryMin}M`, `-Xmx${memoryMax}M`]

  const userArgs = (resolveSetting(instance, 'javaArgs', config.javaArgs) || '')
    .split(/\s+/)
    .map((arg) => arg.trim())
    .filter(Boolean)
    // Memory flags are managed by the sliders, not free-form args.
    .filter((arg) => !/^-Xm[sx]/i.test(arg))

  const loggingArgs: string[] = []
  const loggingFile = loggingConfigPath(version)
  if (version.logging?.client?.argument && loggingFile && (await exists(loggingFile))) {
    loggingArgs.push(substitute(version.logging.client.argument, { path: loggingFile }))
  }

  /* --- Game arguments --- */
  const gameFromManifest = resolveArguments(version.arguments?.game, features)
  const gameTemplate = gameFromManifest.length ? gameFromManifest : legacyGameArguments(version)
  const gameArgs = gameTemplate.map((arg) => substitute(arg, values))

  if (fullscreen && !gameArgs.includes('--fullscreen')) gameArgs.push('--fullscreen')
  if (!fullscreen && !gameArgs.includes('--width')) gameArgs.push('--width', String(width), '--height', String(height))
  if (quickPlayServer && !gameArgs.includes('--quickPlayMultiplayer')) {
    gameArgs.push('--quickPlayMultiplayer', quickPlayServer)
  }
  if (quickPlaySingleplayer && !gameArgs.includes('--quickPlaySingleplayer')) {
    gameArgs.push('--quickPlaySingleplayer', quickPlaySingleplayer)
  }

  return [
    ...memoryArgs,
    ...userArgs,
    ...loggingArgs,
    ...jvmArgs,
    version.mainClass,
    ...gameArgs
  ]
}

/* ------------------------------------------------------------------ */
/* Process supervision                                                 */
/* ------------------------------------------------------------------ */

interface SpawnContext {
  instance: Instance
  command: string[]
  javaPath: string
  gameDir: string
  accountId: string
  accountName: string
}

async function spawnGame(context: SpawnContext): Promise<void> {
  const { instance, command, javaPath, gameDir } = context
  const config = settings.get()

  const environment = { ...process.env, ...(instance.settings.environmentVariables ?? {}) }

  // Redacted copy for the log — the access token never touches disk.
  logStore.note(
    instance.id,
    `Command: "${javaPath}" ${command
      .map((arg) => (arg.length > 120 ? `${arg.slice(0, 60)}…(${arg.length} chars)` : arg))
      .join(' ')
      .replace(/(--accessToken\s+)\S+/g, '$1<redacted>')}`
  )

  const wrapper = instance.settings.wrapperCommand?.trim()
  const executable = wrapper ? wrapper.split(/\s+/)[0] : javaPath
  const prefixArgs = wrapper ? [...wrapper.split(/\s+/).slice(1), javaPath] : []

  const child = spawn(executable, [...prefixArgs, ...command], {
    cwd: gameDir,
    env: environment,
    windowsHide: false,
    detached: false
  })

  const startedAt = Date.now()
  running.set(instance.id, { instanceId: instance.id, child, startedAt, killed: false })

  const record = await instances.recordLaunchStart(instance.id, context.accountId, context.accountName)
  instances.setStatus(instance.id, 'running')

  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => logStore.ingest(instance.id, chunk, 'stdout'))
  child.stderr?.on('data', (chunk: string) => logStore.ingest(instance.id, chunk, 'stderr'))

  child.on('error', (err) => {
    log.error('launcher', `Could not start ${instance.name}`, err)
    logStore.note(instance.id, `Could not start Java: ${err.message}`, 'error')
    running.delete(instance.id)
    instances.setStatus(instance.id, 'error', err.message)
  })

  child.on('exit', (code, signal) => {
    void handleExit(instance, record.startedAt, code, signal, gameDir)
  })

  if (resolveSetting(instance, 'closeLauncherOnLaunch', config.closeLauncherOnLaunch)) {
    // Give the JVM a moment to fail fast before hiding the launcher.
    setTimeout(() => {
      if (running.has(instance.id)) {
        for (const window of BrowserWindow.getAllWindows()) window.hide()
      }
    }, 8_000)
  }
}

async function handleExit(
  instance: Instance,
  startedAt: number,
  code: number | null,
  signal: NodeJS.Signals | null,
  gameDir: string
): Promise<void> {
  const entry = running.get(instance.id)
  const wasKilled = entry?.killed ?? false
  running.delete(instance.id)

  const crashReport = await findCrashReportSince(gameDir, startedAt)
  const crashed = !wasKilled && (code !== 0 || Boolean(crashReport))

  logStore.note(
    instance.id,
    `─── Game exited with code ${code ?? signal ?? 'unknown'}${crashed ? ' (crash detected)' : ''} ───`,
    crashed ? 'error' : 'launcher'
  )

  await instances.recordLaunchEnd(instance.id, startedAt, code, crashed, crashReport)
  instances.setStatus(instance.id, crashed ? 'crashed' : 'idle')

  // Reset the badge after the user has had a chance to see it.
  if (crashed) setTimeout(() => instances.setStatus(instance.id, 'idle'), 30_000)

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isVisible()) window.show()
  }

  if (crashed && settings.get().notifyOnGameCrash) {
    notifications.push({
      title: `${instance.name} crashed`,
      body: crashReport
        ? `Exit code ${code}. A crash report was written to ${basename(crashReport)}.`
        : `The game exited with code ${code}. Open the log for details.`,
      level: 'error',
      action: { label: 'View log', route: `/instances/${instance.id}/logs` }
    })
  }

  const postExit = instance.settings.postExitCommand?.trim()
  if (postExit) {
    logStore.note(instance.id, `Running post-exit command: ${postExit}`)
    await runHook(postExit, gameDir, instance.id).catch(() => undefined)
  }
}

function runHook(command: string, cwd: string, instanceId: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true })
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => logStore.note(instanceId, chunk.trimEnd()))
    child.stderr?.on('data', (chunk: string) => logStore.note(instanceId, chunk.trimEnd(), 'warn'))
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`Command exited with code ${code}`))
    })
  })
}

export function isRunning(instanceId: string): boolean {
  return running.has(instanceId)
}

export function runningCount(): number {
  return running.size
}

export async function killInstance(instanceId: string): Promise<void> {
  const entry = running.get(instanceId)
  if (!entry) return
  entry.killed = true
  logStore.note(instanceId, 'Stopping the game…')

  entry.child.kill()
  // Windows JVMs occasionally ignore the first signal.
  setTimeout(() => {
    if (running.has(instanceId) && entry.child.pid) {
      try {
        process.kill(entry.child.pid, 'SIGKILL')
      } catch {
        /* already gone */
      }
    }
  }, 4_000)
}

export function killAll(): void {
  for (const id of [...running.keys()]) void killInstance(id)
}
