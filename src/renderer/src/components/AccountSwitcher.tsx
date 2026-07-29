import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, LogIn, RefreshCw, Settings2, TriangleAlert } from 'lucide-react'
import { navigate } from '../lib/router'
import { api, reportError, toast, useOrbit } from '../state/store'
import { Button } from './ui'

export function AccountSwitcher({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const accounts = useOrbit((state) => state.accounts)
  const activeAccount = useOrbit((state) => state.activeAccount)
  const refreshAccounts = useOrbit((state) => state.refreshAccounts)
  const [busy, setBusy] = useState(false)

  const addAccount = async (): Promise<void> => {
    setBusy(true)
    try {
      const account = await api.accounts.add()
      await refreshAccounts()
      toast('Signed in', `Welcome, ${account.username}.`)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!/cancelled/i.test(message)) reportError('Sign-in failed', err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 36 }}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 10px)',
              left: 0,
              right: 0,
              minWidth: 260,
              zIndex: 160,
              padding: 6,
              borderRadius: 'var(--r-lg)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            {accounts.length > 0 && <div className="menu__label">Signed in</div>}

            {accounts.map((account) => (
              <button
                key={account.id}
                className="menu__item"
                style={{ height: 44 }}
                onClick={async () => {
                  await api.accounts.setActive(account.id)
                  await refreshAccounts()
                  onClose()
                }}
                type="button"
              >
                <img
                  className="avatar"
                  width={26}
                  height={26}
                  src={`https://mc-heads.net/avatar/${account.uuid}/52`}
                  alt=""
                />
                <span className="grow truncate" style={{ textAlign: 'left' }}>
                  {account.username}
                  {account.needsReauth && (
                    <span className="dimmer" style={{ display: 'block', fontSize: 10.5 }}>
                      Needs sign-in
                    </span>
                  )}
                </span>
                {account.needsReauth ? (
                  <TriangleAlert size={14} style={{ color: 'var(--warning)' }} />
                ) : activeAccount?.id === account.id ? (
                  <Check size={15} style={{ color: 'var(--accent)' }} />
                ) : null}
              </button>
            ))}

            {accounts.length > 0 && <div className="menu__sep" />}

            <button className="menu__item" onClick={() => void addAccount()} disabled={busy} type="button">
              {busy ? <RefreshCw size={15} className="spin" /> : <LogIn size={15} />}
              <span className="grow" style={{ textAlign: 'left' }}>
                {busy ? 'Waiting for Microsoft…' : 'Add a Microsoft account'}
              </span>
            </button>

            <button
              className="menu__item"
              onClick={() => {
                navigate('/accounts')
                onClose()
              }}
              type="button"
            >
              <Settings2 size={15} />
              <span className="grow" style={{ textAlign: 'left' }}>
                Manage accounts
              </span>
            </button>

            {accounts.length === 0 && (
              <div style={{ padding: '10px 12px 6px' }}>
                <div className="t-small dimmer" style={{ lineHeight: 1.5 }}>
                  Orbit only supports genuine Microsoft accounts that own Minecraft: Java Edition.
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  block
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    navigate('/settings/integrations')
                    onClose()
                  }}
                >
                  Set up sign-in
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
