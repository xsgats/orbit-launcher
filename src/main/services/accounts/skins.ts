import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { Account, CapeInfo, SkinInfo, SkinLibraryEntry, SkinVariant } from '../../../shared/types'
import { ensureDir, exists, readJson, removePath, writeJson } from '../../core/fsx'
import { log } from '../../core/logger'
import { mediaUrl } from '../../core/media'
import { getBuffer, request } from '../../core/net'
import { paths } from '../../core/paths'
import { accounts } from './index'

const MC_PROFILE = 'https://api.minecraftservices.com/minecraft/profile'
const MC_SKINS = `${MC_PROFILE}/skins`
const MC_ACTIVE_SKIN = `${MC_SKINS}/active`
const MC_ACTIVE_CAPE = `${MC_PROFILE}/capes/active`

const MAX_SKIN_BYTES = 512 * 1024

function libraryDir(): string {
  return join(paths.configRoot, 'skins')
}

function libraryIndexFile(): string {
  return join(libraryDir(), 'library.json')
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function readPngSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

/**
 * Mojang rejects anything that is not a 64x64 (or legacy 64x32) PNG, and does
 * so with an opaque error — so check locally and say something useful.
 */
export function validateSkin(buffer: Buffer): { width: number; height: number } {
  if (buffer.length > MAX_SKIN_BYTES) {
    throw new Error('That file is larger than 512 KB. Minecraft skins are tiny PNG textures.')
  }

  const size = readPngSize(buffer)
  if (!size) throw new Error('That file is not a PNG image.')

  const valid = size.width === 64 && (size.height === 64 || size.height === 32)
  if (!valid) {
    throw new Error(
      `A skin must be 64×64 pixels (or 64×32 for the old format). That image is ${size.width}×${size.height}.`
    )
  }

  return size
}

/* ------------------------------------------------------------------ */
/* Minecraft services                                                  */
/* ------------------------------------------------------------------ */

interface ProfileResponse {
  id: string
  name: string
  skins?: SkinInfo[]
  capes?: CapeInfo[]
}

async function tokenFor(accountId: string): Promise<string> {
  const { accessToken } = await accounts.getValidToken(accountId)
  return accessToken
}

/** Re-reads the profile and writes the new skin/cape state into the account. */
async function syncProfile(accountId: string): Promise<Account> {
  const token = await tokenFor(accountId)
  const response = await request(MC_PROFILE, {
    headers: { Authorization: `Bearer ${token}` },
    retries: 1
  })
  const profile = (await response.json()) as ProfileResponse
  return accounts.applyProfile(accountId, profile.skins ?? [], profile.capes ?? [])
}

export async function refresh(accountId: string): Promise<Account> {
  return syncProfile(accountId)
}

export async function uploadSkinFile(
  accountId: string,
  filePath: string,
  variant: SkinVariant
): Promise<Account> {
  const buffer = await readFile(filePath)
  validateSkin(buffer)
  return uploadSkinBuffer(accountId, buffer, variant)
}

export async function uploadSkinBuffer(
  accountId: string,
  buffer: Buffer,
  variant: SkinVariant
): Promise<Account> {
  const token = await tokenFor(accountId)

  const form = new FormData()
  form.set('variant', variant.toLowerCase())
  form.set('file', new Blob([buffer], { type: 'image/png' }), 'skin.png')

  await request(MC_SKINS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    retries: 1,
    noRetryStatuses: [400, 401, 403, 429]
  }).catch((err) => {
    throw new Error(`Minecraft rejected the skin: ${err instanceof Error ? err.message : err}`)
  })

  log.info('skins', `Uploaded a ${variant} skin for ${accountId}`)
  return syncProfile(accountId)
}

export async function resetSkin(accountId: string): Promise<Account> {
  const token = await tokenFor(accountId)
  await request(MC_ACTIVE_SKIN, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    retries: 1,
    noRetryStatuses: [400, 401, 403]
  })
  log.info('skins', `Reset the skin for ${accountId}`)
  return syncProfile(accountId)
}

export async function setCape(accountId: string, capeId: string | null): Promise<Account> {
  const token = await tokenFor(accountId)

  if (capeId) {
    await request(MC_ACTIVE_CAPE, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ capeId }),
      retries: 1,
      noRetryStatuses: [400, 401, 403]
    })
  } else {
    await request(MC_ACTIVE_CAPE, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      retries: 1,
      noRetryStatuses: [400, 401, 403]
    })
  }

  return syncProfile(accountId)
}

/* ------------------------------------------------------------------ */
/* Local library                                                       */
/* ------------------------------------------------------------------ */

interface LibraryFile {
  version: 1
  entries: Omit<SkinLibraryEntry, 'url'>[]
}

async function readLibrary(): Promise<Omit<SkinLibraryEntry, 'url'>[]> {
  const stored = await readJson<LibraryFile>(libraryIndexFile())
  return stored?.entries ?? []
}

async function writeLibrary(entries: Omit<SkinLibraryEntry, 'url'>[]): Promise<void> {
  await ensureDir(libraryDir())
  await writeJson(libraryIndexFile(), { version: 1, entries } satisfies LibraryFile)
}

function decorate(entry: Omit<SkinLibraryEntry, 'url'>): SkinLibraryEntry {
  return { ...entry, url: mediaUrl(entry.path, entry.addedAt) }
}

export async function listLibrary(): Promise<SkinLibraryEntry[]> {
  const entries = await readLibrary()

  const alive: Omit<SkinLibraryEntry, 'url'>[] = []
  for (const entry of entries) {
    if (await exists(entry.path)) alive.push(entry)
  }
  if (alive.length !== entries.length) await writeLibrary(alive)

  return alive.sort((a, b) => b.addedAt - a.addedAt).map(decorate)
}

async function addBuffer(
  buffer: Buffer,
  name: string,
  variant: SkinVariant
): Promise<SkinLibraryEntry[]> {
  const size = validateSkin(buffer)
  await ensureDir(libraryDir())

  const id = randomUUID()
  const target = join(libraryDir(), `${id}.png`)
  await writeFile(target, buffer)

  const entries = await readLibrary()
  entries.push({
    id,
    name: name.trim() || 'Untitled skin',
    variant,
    path: target,
    addedAt: Date.now(),
    width: size.width,
    height: size.height
  })
  await writeLibrary(entries)

  return listLibrary()
}

export async function addToLibrary(
  filePath: string,
  name: string,
  variant: SkinVariant
): Promise<SkinLibraryEntry[]> {
  const buffer = await readFile(filePath)
  return addBuffer(buffer, name || basename(filePath, extname(filePath)), variant)
}

/** Saves whatever the account is currently wearing into the library. */
export async function saveCurrentToLibrary(accountId: string, name: string): Promise<SkinLibraryEntry[]> {
  const account = accounts.list().find((entry) => entry.id === accountId)
  const active = account?.skins.find((skin) => skin.state === 'ACTIVE') ?? account?.skins[0]
  if (!active?.url) throw new Error('That account has no skin to save — it is using the default.')

  const buffer = await getBuffer(active.url, { timeoutMs: 20_000 })
  return addBuffer(buffer, name || `${account?.username ?? 'Skin'} backup`, active.variant)
}

export async function removeFromLibrary(id: string): Promise<SkinLibraryEntry[]> {
  const entries = await readLibrary()
  const target = entries.find((entry) => entry.id === id)
  if (target) await removePath(target.path).catch(() => undefined)
  await writeLibrary(entries.filter((entry) => entry.id !== id))
  return listLibrary()
}

export async function renameInLibrary(id: string, name: string): Promise<SkinLibraryEntry[]> {
  const entries = await readLibrary()
  const target = entries.find((entry) => entry.id === id)
  if (target) target.name = name.trim() || target.name
  await writeLibrary(entries)
  return listLibrary()
}

export async function applyFromLibrary(accountId: string, id: string): Promise<Account> {
  const entries = await readLibrary()
  const target = entries.find((entry) => entry.id === id)
  if (!target) throw new Error('That skin is no longer in your library.')

  const buffer = await readFile(target.path)
  return uploadSkinBuffer(accountId, buffer, target.variant)
}

/** Absolute path + media URL of an account's current skin texture, for preview. */
export async function activeSkinUrl(accountId: string): Promise<string | null> {
  const account = accounts.list().find((entry) => entry.id === accountId)
  const active = account?.skins.find((skin) => skin.state === 'ACTIVE') ?? account?.skins[0]
  return active?.url ?? null
}

export async function libraryFolder(): Promise<string> {
  await ensureDir(libraryDir())
  return libraryDir()
}
