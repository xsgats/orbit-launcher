import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { BrowserWindow, session } from 'electron'
import type { AuthProgress, CapeInfo, SkinInfo } from '../../../shared/types'
import { emit } from '../../core/events'
import { log } from '../../core/logger'
import { getJson, postJson, request } from '../../core/net'
import { settings } from '../../core/settings'





const MSA_AUTHORIZE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize'
const MSA_TOKEN = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const MSA_SCOPE = 'XboxLive.signin offline_access'

const XBL_AUTHENTICATE = 'https://user.auth.xboxlive.com/user/authenticate'
const XSTS_AUTHORIZE = 'https://xsts.auth.xboxlive.com/xsts/authorize'
const MC_LOGIN = 'https://api.minecraftservices.com/authentication/login_with_xbox'
const MC_ENTITLEMENTS = 'https://api.minecraftservices.com/entitlements/mcstore'
const MC_PROFILE = 'https://api.minecraftservices.com/minecraft/profile'





export class AuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'no-client-id'
      | 'cancelled'
      | 'microsoft'
      | 'xbox-no-account'
      | 'xbox-child'
      | 'xbox-region'
      | 'xbox-banned'
      | 'xbox'
      | 'no-entitlement'
      | 'no-profile'
      | 'network'
  ) {
    super(message)
    this.name = 'AuthError'
  }
}





interface MsaTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

interface XboxAuthResponse {
  Token: string
  NotAfter: string
  DisplayClaims: { xui: { uhs: string; xid?: string }[] }
}

interface McLoginResponse {
  access_token: string
  expires_in: number
  username: string
}

interface McProfileResponse {
  id: string
  name: string
  skins?: SkinInfo[]
  capes?: CapeInfo[]
}

export interface AuthSession {
  minecraftAccessToken: string
  expiresAt: number
  msaRefreshToken: string
  uuid: string
  username: string
  xuid: string | null
  skins: SkinInfo[]
  capes: CapeInfo[]
  ownsMinecraft: boolean
}





function base64Url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function createPkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(64))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

const RESULT_PAGE = (title: string, body: string, ok: boolean): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>Orbit Launcher</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0A0B14;
         font-family:'Segoe UI Variable Display','Segoe UI',system-ui,sans-serif; color:#E8EAF6; }
  .card { text-align:center; padding:48px 56px; border-radius:24px; background:rgba(255,255,255,.04);
          border:1px solid rgba(255,255,255,.08); box-shadow:0 40px 120px rgba(0,0,0,.6); }
  .dot { width:64px; height:64px; margin:0 auto 24px; border-radius:50%;
         background:${ok ? 'radial-gradient(circle at 34% 26%, #B9C4FF, #6248E6 62%, #3B1C86)' : 'radial-gradient(circle at 34% 26%, #FFB4B4, #E64848 62%, #7A1B1B)'};
         box-shadow:0 0 48px ${ok ? 'rgba(108,123,255,.5)' : 'rgba(230,72,72,.45)'}; }
  h1 { font-size:22px; margin:0 0 8px; letter-spacing:-.01em; }
  p { margin:0; color:#9AA0BF; font-size:14px; }
</style></head>
<body><div class="card"><div class="dot"></div><h1>${title}</h1><p>${body}</p></div></body></html>`

function report(stage: AuthProgress['stage'], message: string, detail?: string): void {
  emit('auth:progress', { stage, message, detail })
}





let activeLoginController: AbortController | null = null

export function cancelInteractiveLogin(): void {
  activeLoginController?.abort()
}

async function interactiveMicrosoftLogin(clientId: string): Promise<MsaTokenResponse> {
  const controller = new AbortController()
  activeLoginController?.abort()
  activeLoginController = controller

  const { verifier, challenge } = createPkce()
  const state = base64Url(randomBytes(24))













  const server: Server = createServer()
  const redirectUri = await new Promise<string>((resolvePromise, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolvePromise(`http://localhost:${port}`)
    })
  })

  const codePromise = new Promise<string>((resolvePromise, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')



      if (!error && !code) {
        res.writeHead(404).end()
        return
      }

      const send = (title: string, body: string, ok: boolean): void => {
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(RESULT_PAGE(title, body, ok))
      }

      if (error) {
        send('Sign-in failed', url.searchParams.get('error_description') ?? error, false)
        reject(new AuthError(error, error === 'access_denied' ? 'cancelled' : 'microsoft'))
      } else if (!code || returnedState !== state) {
        send('Sign-in failed', 'The response did not match this request.', false)
        reject(new AuthError('State mismatch in the Microsoft redirect', 'microsoft'))
      } else {
        send('You are signed in', 'You can close this window and return to Orbit.', true)
        resolvePromise(code)
      }
    })
    controller.signal.addEventListener('abort', () => reject(new AuthError('Sign-in cancelled', 'cancelled')), {
      once: true
    })
  })

  const authorizeUrl = new URL(MSA_AUTHORIZE)
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('response_mode', 'query')
  authorizeUrl.searchParams.set('scope', MSA_SCOPE)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', challenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  authorizeUrl.searchParams.set('prompt', 'select_account')


  const partition = `orbit-msa-${Date.now()}`
  const authWindow = new BrowserWindow({
    width: 520,
    height: 720,
    show: true,
    autoHideMenuBar: true,
    title: 'Sign in with Microsoft',
    backgroundColor: '#0A0B14',
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false
    }
  })

  authWindow.on('closed', () => controller.abort())
  controller.signal.addEventListener('abort', () => {
    if (!authWindow.isDestroyed()) authWindow.destroy()
  })

  report('waiting-for-user', 'Waiting for Microsoft sign-in…')
  await authWindow.loadURL(authorizeUrl.toString())

  let code: string
  try {
    code = await codePromise
  } finally {
    server.close()
    if (!authWindow.isDestroyed()) authWindow.destroy()
    try {
      await session.fromPartition(partition).clearStorageData()
    } catch {

    }
    if (activeLoginController === controller) activeLoginController = null
  }

  report('microsoft', 'Exchanging your Microsoft authorization…')
  return exchangeCode(clientId, code, verifier, redirectUri)
}

async function exchangeCode(
  clientId: string,
  code: string,
  verifier: string,
  redirectUri: string
): Promise<MsaTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId,
    scope: MSA_SCOPE,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier
  })

  const response = await request(MSA_TOKEN, {
    method: 'POST',
    body: body.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    retries: 1
  }).catch((err) => {
    throw new AuthError(`Microsoft rejected the sign-in: ${err instanceof Error ? err.message : err}`, 'microsoft')
  })

  return (await response.json()) as MsaTokenResponse
}

export async function refreshMicrosoftToken(clientId: string, refreshToken: string): Promise<MsaTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId,
    scope: MSA_SCOPE,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })

  const response = await request(MSA_TOKEN, {
    method: 'POST',
    body: body.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    retries: 1,
    noRetryStatuses: [400, 401]
  }).catch((err) => {
    throw new AuthError(
      `Your Microsoft session has expired. Sign in again. (${err instanceof Error ? err.message : err})`,
      'microsoft'
    )
  })

  return (await response.json()) as MsaTokenResponse
}





const XERR_MESSAGES: Record<string, { message: string; code: AuthError['code'] }> = {
  '2148916233': {
    message:
      'This Microsoft account does not have an Xbox profile yet. Create one at minecraft.net, then sign in again.',
    code: 'xbox-no-account'
  },
  '2148916235': {
    message: 'Xbox Live is not available in this account’s country or region.',
    code: 'xbox-region'
  },
  '2148916236': {
    message: 'This account needs adult verification before it can use Xbox Live.',
    code: 'xbox-child'
  },
  '2148916237': {
    message: 'This account needs adult verification before it can use Xbox Live.',
    code: 'xbox-child'
  },
  '2148916238': {
    message:
      'This is a child account. An adult must add it to a Microsoft family group before it can sign in.',
    code: 'xbox-child'
  },
  '2148916227': {
    message: 'This Xbox account has been permanently banned for a terms-of-service violation.',
    code: 'xbox-banned'
  }
}

async function authenticateWithXboxLive(msaAccessToken: string): Promise<XboxAuthResponse> {
  report('xbox-live', 'Authenticating with Xbox Live…')
  try {
    return await postJson<XboxAuthResponse>(
      XBL_AUTHENTICATE,
      {
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: `d=${msaAccessToken}`
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      },
      { headers: { Accept: 'application/json' }, retries: 2 }
    )
  } catch (err) {
    throw new AuthError(`Xbox Live sign-in failed: ${err instanceof Error ? err.message : err}`, 'xbox')
  }
}

async function authorizeXsts(xblToken: string): Promise<XboxAuthResponse> {
  report('xsts', 'Authorizing your Minecraft entitlement…')
  const response = await request(XSTS_AUTHORIZE, {
    method: 'POST',
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    }),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    retries: 2,
    noRetryStatuses: [401, 403]
  }).catch(async (err) => {

    const body = (err as { body?: string }).body ?? ''
    const match = /"XErr"\s*:\s*(\d+)/.exec(body)
    if (match) {
      const known = XERR_MESSAGES[match[1]]
      if (known) throw new AuthError(known.message, known.code)
      throw new AuthError(`Xbox Live returned error ${match[1]}.`, 'xbox')
    }
    throw new AuthError(`Xbox Live authorization failed: ${err instanceof Error ? err.message : err}`, 'xbox')
  })

  return (await response.json()) as XboxAuthResponse
}

async function loginToMinecraft(uhs: string, xstsToken: string): Promise<McLoginResponse> {
  report('minecraft', 'Signing in to Minecraft services…')
  try {
    return await postJson<McLoginResponse>(
      MC_LOGIN,
      { identityToken: `XBL3.0 x=${uhs};${xstsToken}` },
      { retries: 2 }
    )
  } catch (err) {
    throw new AuthError(`Minecraft services rejected the sign-in: ${err instanceof Error ? err.message : err}`, 'xbox')
  }
}






async function verifyEntitlement(accessToken: string): Promise<boolean> {
  report('entitlements', 'Verifying your Minecraft licence…')
  try {
    const result = await getJson<{ items?: { name: string }[] }>(MC_ENTITLEMENTS, {
      headers: { Authorization: `Bearer ${accessToken}` },
      retries: 2
    })
    const names = new Set((result.items ?? []).map((item) => item.name))

    return (
      names.has('product_minecraft') ||
      names.has('game_minecraft') ||
      names.has('product_game_pass_pc') ||
      names.has('product_game_pass_ultimate')
    )
  } catch (err) {
    log.warn('auth', 'Entitlement check failed', err)
    return false
  }
}

async function fetchProfile(accessToken: string): Promise<McProfileResponse> {
  report('profile', 'Loading your Minecraft profile…')
  try {
    return await getJson<McProfileResponse>(MC_PROFILE, {
      headers: { Authorization: `Bearer ${accessToken}` },
      retries: 2,
      noRetryStatuses: [404]
    })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 404) {
      throw new AuthError(
        'This account owns Minecraft but has no Java Edition profile yet. Create your profile at minecraft.net and try again.',
        'no-profile'
      )
    }
    throw new AuthError(`Could not load the Minecraft profile: ${err instanceof Error ? err.message : err}`, 'no-profile')
  }
}


async function completeChain(msa: MsaTokenResponse): Promise<AuthSession> {
  const xbl = await authenticateWithXboxLive(msa.access_token)
  const uhs = xbl.DisplayClaims?.xui?.[0]?.uhs
  if (!uhs) throw new AuthError('Xbox Live did not return a user hash.', 'xbox')

  const xsts = await authorizeXsts(xbl.Token)
  const xuid = xsts.DisplayClaims?.xui?.[0]?.xid ?? null

  const mc = await loginToMinecraft(xsts.DisplayClaims?.xui?.[0]?.uhs ?? uhs, xsts.Token)

  const owns = await verifyEntitlement(mc.access_token)
  if (!owns) {
    throw new AuthError(
      'This Microsoft account does not own Minecraft: Java Edition. Orbit only supports accounts with a genuine licence.',
      'no-entitlement'
    )
  }

  const profile = await fetchProfile(mc.access_token)

  report('done', 'Signed in')
  return {
    minecraftAccessToken: mc.access_token,
    expiresAt: Date.now() + mc.expires_in * 1000,
    msaRefreshToken: msa.refresh_token,
    uuid: profile.id,
    username: profile.name,
    xuid,
    skins: profile.skins ?? [],
    capes: profile.capes ?? [],
    ownsMinecraft: true
  }
}

function requireClientId(): string {
  const clientId = settings.get().msaClientId.trim()
  if (!clientId) {
    throw new AuthError(
      'No Microsoft application (client) ID is configured. Add one in Settings → Accounts to enable sign-in.',
      'no-client-id'
    )
  }
  return clientId
}


export async function signIn(): Promise<AuthSession> {
  const clientId = requireClientId()
  try {
    const msa = await interactiveMicrosoftLogin(clientId)
    return await completeChain(msa)
  } catch (err) {
    if (err instanceof AuthError) {
      report('error', err.message)
      throw err
    }
    const wrapped = new AuthError(err instanceof Error ? err.message : String(err), 'network')
    report('error', wrapped.message)
    throw wrapped
  }
}


export async function refreshSession(msaRefreshToken: string): Promise<AuthSession> {
  const clientId = requireClientId()
  const msa = await refreshMicrosoftToken(clientId, msaRefreshToken)
  return completeChain(msa)
}
