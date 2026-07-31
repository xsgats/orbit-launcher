import { useEffect, useState } from 'react'
import {
  BadgeCheck,
  Check,
  CircleAlert,
  ExternalLink,
  KeyRound,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Shirt,
  Trash2,
  TriangleAlert,
  UserRound
} from 'lucide-react'
import type { Account, AuthProgress } from '@shared/types'
import { SkinManager } from '../components/SkinManager'
import { SkinPreview } from '../components/SkinPreview'
import { Button, Callout, ConfirmDialog, EmptyState, IconButton } from '../components/ui'
import { formatDateTime, formatRelative } from '../lib/format'
import { api, reportError, toast, useOrbit } from '../state/store'

export function AccountsPage(): React.JSX.Element {
  const accounts = useOrbit((state) => state.accounts)
  const activeAccount = useOrbit((state) => state.activeAccount)
  const settings = useOrbit((state) => state.settings)
  const updateSettings = useOrbit((state) => state.updateSettings)
  const refreshAccounts = useOrbit((state) => state.refreshAccounts)

  const [adding, setAdding] = useState(false)
  const [progress, setProgress] = useState<AuthProgress | null>(null)
  const [removing, setRemoving] = useState<Account | null>(null)
  const [skinTarget, setSkinTarget] = useState<Account | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  useEffect(() => api.on('auth:progress', setProgress), [])

  const addAccount = async (): Promise<void> => {
    setAdding(true)
    setProgress(null)
    try {
      const account = await api.accounts.add()
      await refreshAccounts()
      toast('Signed in', `Welcome, ${account.username}.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!/cancelled/i.test(message)) reportError('Sign-in failed', err)
    } finally {
      setAdding(false)
      setProgress(null)
    }
  }

  return (
    <div className="page__inner">
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Accounts</h1>
          <p className="page-header__sub">
            Orbit supports genuine Microsoft accounts that own Minecraft: Java Edition.
          </p>
        </div>
        <Button
          variant="primary"
          icon={<LogIn size={16} />}
          loading={adding}
          onClick={() => void addAccount()}
        >
          Add account
        </Button>
      </header>

      <div className="col gap-5">
        {adding && progress && (
          <Callout tone="accent" icon={<RefreshCw size={16} className="spin" />}>
            <strong>{progress.message}</strong>
            {progress.detail && <div style={{ marginTop: 4 }}>{progress.detail}</div>}
            <div style={{ marginTop: 10 }}>
              <Button size="sm" variant="ghost" onClick={() => void api.accounts.cancelLogin()}>
                Cancel
              </Button>
            </div>
          </Callout>
        )}

        {accounts.length === 0 ? (
          <EmptyState
            icon={<UserRound size={26} />}
            title="No accounts yet"
            description="Sign in with the Microsoft account that owns Minecraft. Orbit stores your session encrypted with Windows DPAPI and never sees your password."
            action={
              <Button
                variant="primary"
                icon={<LogIn size={16} />}
                loading={adding}
                onClick={() => void addAccount()}
              >
                Sign in with Microsoft
              </Button>
            }
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--s-4)' }}>
            {accounts.map((account) => (
              <div className="account-card" key={account.id} data-active={activeAccount?.id === account.id}>
                <div className="account-card__skin center" style={{ padding: 4 }}>
                  <SkinPreview
                    src={
                      account.skins.find((skin) => skin.state === 'ACTIVE')?.url ??
                      account.skins[0]?.url ??
                      null
                    }
                    variant={account.skins[0]?.variant ?? 'CLASSIC'}
                    scale={2}
                  />
                </div>

                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row gap-2">
                    <span className="t-h2 truncate">{account.username}</span>
                    {account.ownsMinecraft && !account.needsReauth && (
                      <BadgeCheck size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
                    )}
                  </div>

                  <div className="dimmer t-mono" style={{ fontSize: 11, marginTop: 4 }}>
                    {account.uuid}
                  </div>

                  <div className="row wrap gap-2" style={{ marginTop: 10 }}>
                    {activeAccount?.id === account.id && (
                      <span className="chip chip--accent">
                        <Check size={11} /> Active
                      </span>
                    )}
                    {account.needsReauth ? (
                      <span className="chip chip--warning">
                        <TriangleAlert size={11} /> Sign in again
                      </span>
                    ) : (
                      <span className="chip chip--success">
                        <ShieldCheck size={11} /> Licence verified
                      </span>
                    )}
                  </div>

                  <div className="dimmer" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6 }}>
                    Added {formatDateTime(account.addedAt)}
                    <br />
                    Session refreshed {formatRelative(account.lastRefreshed)}
                  </div>

                  <div className="row gap-2" style={{ marginTop: 14 }}>
                    <Button size="sm" icon={<Shirt size={13} />} onClick={() => setSkinTarget(account)}>
                      Skin &amp; cape
                    </Button>
                    {activeAccount?.id !== account.id && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await api.accounts.setActive(account.id)
                          await refreshAccounts()
                          toast('Switched account', account.username)
                        }}
                      >
                        Use this account
                      </Button>
                    )}
                    {account.needsReauth && (
                      <Button size="sm" variant="primary" loading={adding} onClick={() => void addAccount()}>
                        Sign in again
                      </Button>
                    )}
                  </div>
                </div>

                <div className="col gap-1">
                  <IconButton label="Skin & cape" onClick={() => setSkinTarget(account)}>
                    <Shirt size={15} />
                  </IconButton>
                  <IconButton
                    label="Refresh session"
                    disabled={refreshingId === account.id}
                    onClick={async () => {
                      setRefreshingId(account.id)
                      try {
                        await api.accounts.refresh(account.id)
                        await refreshAccounts()
                        toast('Session refreshed', account.username)
                      } catch (err) {
                        reportError('Could not refresh', err)
                      } finally {
                        setRefreshingId(null)
                      }
                    }}
                  >
                    <RefreshCw size={15} className={refreshingId === account.id ? 'spin' : undefined} />
                  </IconButton>
                  <IconButton label="Open profile" onClick={() => void api.app.openExternal('https://www.minecraft.net/msaprofile')}>
                    <ExternalLink size={15} />
                  </IconButton>
                  <IconButton label="Remove" danger onClick={() => setRemoving(account)}>
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}

        <Callout icon={<ShieldCheck size={16} />}>
          <strong>How Orbit handles your account.</strong> Sign-in happens on Microsoft&apos;s own page — Orbit never
          sees your password. Tokens are encrypted at rest with Windows DPAPI and are only sent to Mojang&apos;s
          official services. Orbit refuses to create an account without a verified Minecraft: Java Edition licence, and
          has no offline, cracked or third-party authentication mode.
        </Callout>
      </div>

      <SkinManager
        account={skinTarget ? (accounts.find((entry) => entry.id === skinTarget.id) ?? skinTarget) : null}
        open={Boolean(skinTarget)}
        onClose={() => setSkinTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.username ?? ''}?`}
        description="The stored session is deleted from this PC. Your Microsoft account and Minecraft purchase are untouched — you can sign in again any time."
        confirmLabel="Remove account"
        danger
        icon={<CircleAlert size={18} />}
        onConfirm={async () => {
          if (!removing) return
          await api.accounts.remove(removing.id)
          await refreshAccounts()
          toast('Account removed', removing.username)
        }}
      />
    </div>
  )
}
