import { safeStorage } from 'electron'
import type { Account } from '../../../shared/types'
import { emit } from '../../core/events'
import { readJson, writeJson } from '../../core/fsx'
import { log } from '../../core/logger'
import { paths } from '../../core/paths'
import { AuthError, cancelInteractiveLogin, refreshSession, signIn, type AuthSession } from './auth'

interface StoredSecret {

  value: string
  encrypted: boolean
}

interface StoredAccount extends Account {
  minecraftAccessToken: StoredSecret
  msaRefreshToken: StoredSecret
}

interface AccountsFile {
  version: 1
  activeId: string | null
  accounts: StoredAccount[]
}

function seal(plain: string): StoredSecret {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return { value: safeStorage.encryptString(plain).toString('base64'), encrypted: true }
    }
  } catch (err) {
    log.warn('accounts', 'safeStorage unavailable; storing token unencrypted', err)
  }
  return { value: plain, encrypted: false }
}

function unseal(secret: StoredSecret | undefined): string {
  if (!secret) return ''
  if (!secret.encrypted) return secret.value
  try {
    return safeStorage.decryptString(Buffer.from(secret.value, 'base64'))
  } catch (err) {
    log.warn('accounts', 'Could not decrypt a stored token', err)
    return ''
  }
}

/**
 * Mojang hands out texture URLs over plain http. The renderer's CSP only
 * permits https for images, and textures.minecraft.net serves both, so upgrade
 * the scheme at the single point where accounts cross into the renderer.
 */
function httpsTexture(url: string): string {
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url
}

function toPublic(stored: StoredAccount): Account {
  const { minecraftAccessToken: _a, msaRefreshToken: _b, ...rest } = stored
  return {
    ...rest,
    skins: (rest.skins ?? []).map((skin) => ({ ...skin, url: httpsTexture(skin.url) })),
    capes: (rest.capes ?? []).map((cape) => ({ ...cape, url: httpsTexture(cape.url) }))
  }
}


const REFRESH_MARGIN_MS = 5 * 60 * 1000

class AccountStore {
  private file: AccountsFile = { version: 1, activeId: null, accounts: [] }
  private refreshInFlight = new Map<string, Promise<StoredAccount>>()

  async load(): Promise<void> {
    const stored = await readJson<AccountsFile>(paths.accountsFile)
    if (stored?.accounts) {
      this.file = { version: 1, activeId: stored.activeId ?? null, accounts: stored.accounts }
    }
    if (!this.file.activeId && this.file.accounts.length) {
      this.file.activeId = this.file.accounts[0].id
    }
    log.info('accounts', `Loaded ${this.file.accounts.length} account(s)`)
  }

  private async persist(): Promise<void> {
    await writeJson(paths.accountsFile, this.file)
    this.broadcast()
  }

  private broadcast(): void {
    emit('accounts:changed', this.list())
  }

  list(): Account[] {
    const activeId = this.file.activeId
    return this.file.accounts
      .map(toPublic)
      .sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : a.username.localeCompare(b.username)))
  }

  getActive(): Account | null {
    const found = this.file.accounts.find((a) => a.id === this.file.activeId)
    return found ? toPublic(found) : null
  }

  private find(id: string): StoredAccount | undefined {
    return this.file.accounts.find((a) => a.id === id)
  }

  private applySession(session: AuthSession, addedAt?: number): StoredAccount {
    return {
      id: session.uuid,
      username: session.username,
      uuid: session.uuid,
      xuid: session.xuid,
      type: 'microsoft',
      addedAt: addedAt ?? Date.now(),
      expiresAt: session.expiresAt,
      lastRefreshed: Date.now(),
      skins: session.skins,
      capes: session.capes,
      ownsMinecraft: session.ownsMinecraft,
      needsReauth: false,
      minecraftAccessToken: seal(session.minecraftAccessToken),
      msaRefreshToken: seal(session.msaRefreshToken)
    }
  }


  async add(): Promise<Account> {
    const session = await signIn()
    const existing = this.find(session.uuid)
    const record = this.applySession(session, existing?.addedAt)

    if (existing) {
      Object.assign(existing, record)
    } else {
      this.file.accounts.push(record)
    }
    this.file.activeId = record.id

    await this.persist()
    log.info('accounts', `Signed in as ${record.username}`)
    return toPublic(record)
  }

  cancelLogin(): void {
    cancelInteractiveLogin()
  }

  async remove(id: string): Promise<void> {
    this.file.accounts = this.file.accounts.filter((a) => a.id !== id)
    if (this.file.activeId === id) this.file.activeId = this.file.accounts[0]?.id ?? null
    await this.persist()
  }

  async setActive(id: string): Promise<void> {
    if (!this.find(id)) throw new Error('That account is no longer signed in.')
    this.file.activeId = id
    await this.persist()
  }


  async refresh(id: string): Promise<Account> {
    const refreshed = await this.refreshInternal(id)
    return toPublic(refreshed)
  }

  private async refreshInternal(id: string): Promise<StoredAccount> {
    const pending = this.refreshInFlight.get(id)
    if (pending) return pending

    const task = (async (): Promise<StoredAccount> => {
      const account = this.find(id)
      if (!account) throw new Error('That account is no longer signed in.')

      const refreshToken = unseal(account.msaRefreshToken)
      if (!refreshToken) {
        account.needsReauth = true
        await this.persist()
        throw new AuthError('Stored credentials could not be read. Sign in again.', 'microsoft')
      }

      try {
        const session = await refreshSession(refreshToken)
        Object.assign(account, this.applySession(session, account.addedAt))
        await this.persist()
        return account
      } catch (err) {
        account.needsReauth = true
        await this.persist()
        throw err
      } finally {
        this.refreshInFlight.delete(id)
      }
    })()

    this.refreshInFlight.set(id, task)
    return task
  }





  async getValidToken(id: string): Promise<{ account: Account; accessToken: string }> {
    let account = this.find(id)
    if (!account) throw new Error('That account is no longer signed in.')

    if (account.needsReauth || Date.now() > account.expiresAt - REFRESH_MARGIN_MS) {
      account = await this.refreshInternal(id)
    }

    const accessToken = unseal(account.minecraftAccessToken)
    if (!accessToken) throw new AuthError('Stored credentials could not be read. Sign in again.', 'microsoft')

    return { account: toPublic(account), accessToken }
  }


  /** Writes freshly fetched skin/cape state back onto a stored account. */
  async applyProfile(id: string, skins: Account['skins'], capes: Account['capes']): Promise<Account> {
    const account = this.find(id)
    if (!account) throw new Error('That account is no longer signed in.')
    account.skins = skins
    account.capes = capes
    await this.persist()
    return toPublic(account)
  }

  async refreshExpiringInBackground(): Promise<void> {
    const soon = Date.now() + 30 * 60 * 1000
    for (const account of this.file.accounts) {
      if (account.expiresAt < soon) {
        try {
          await this.refreshInternal(account.id)
          log.info('accounts', `Refreshed session for ${account.username}`)
        } catch (err) {
          log.warn('accounts', `Could not refresh ${account.username} in the background`, err)
        }
      }
    }
  }

  count(): number {
    return this.file.accounts.length
  }
}

export const accounts = new AccountStore()
export { AuthError } from './auth'
