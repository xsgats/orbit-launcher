import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, BellOff, CheckCheck, CheckCircle2, Info, Trash2, XCircle } from 'lucide-react'
import type { AppNotification } from '@shared/types'
import { formatRelative } from '../lib/format'
import { navigate } from '../lib/router'
import { api, useOrbit } from '../state/store'
import { Button, EmptyState, IconButton } from './ui'

const LEVEL_ICON: Record<AppNotification['level'], React.JSX.Element> = {
  info: <Info size={15} style={{ color: 'var(--info)' }} />,
  success: <CheckCircle2 size={15} style={{ color: 'var(--success)' }} />,
  warning: <AlertTriangle size={15} style={{ color: 'var(--warning)' }} />,
  error: <XCircle size={15} style={{ color: 'var(--danger)' }} />
}

export function NotificationPanel({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const notifications = useOrbit((state) => state.notifications)
  const unread = notifications.filter((item) => !item.read).length

  return (
    <AnimatePresence>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 36 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              zIndex: 160,
              width: 392,
              maxHeight: 'min(560px, 74vh)',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 'var(--r-xl)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden'
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="row between gap-3"
              style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div className="row gap-2">
                <span className="t-h3">Notifications</span>
                {unread > 0 && <span className="chip chip--accent">{unread} new</span>}
              </div>
              <div className="row gap-1">
                <IconButton
                  label="Mark all read"
                  disabled={unread === 0}
                  onClick={() => void api.notifications.markAllRead()}
                >
                  <CheckCheck size={15} />
                </IconButton>
                <IconButton
                  label="Clear all"
                  disabled={notifications.length === 0}
                  onClick={() => void api.notifications.clear()}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifications.length === 0 ? (
                <EmptyState
                  icon={<BellOff size={26} />}
                  title="All caught up"
                  description="Crash reports, finished downloads and launcher updates land here."
                />
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '13px 16px',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: item.read ? undefined : 'var(--accent-a08)',
                      cursor: item.action ? 'pointer' : 'default'
                    }}
                    onClick={() => {
                      void api.notifications.markRead(item.id)
                      if (item.action) {
                        navigate(item.action.route)
                        onClose()
                      }
                    }}
                  >
                    <span style={{ marginTop: 2, flexShrink: 0 }}>{LEVEL_ICON[item.level]}</span>
                    <div className="grow">
                      <div className="t-small" style={{ fontWeight: 570 }}>
                        {item.title}
                      </div>
                      <div className="t-small dim" style={{ marginTop: 3, lineHeight: 1.5 }}>
                        {item.body}
                      </div>
                      <div className="row between gap-2" style={{ marginTop: 7 }}>
                        <span className="dimmer" style={{ fontSize: 11 }}>
                          {formatRelative(item.createdAt)}
                        </span>
                        {item.action && (
                          <Button size="sm" variant="ghost">
                            {item.action.label}
                          </Button>
                        )}
                      </div>
                    </div>
                    <IconButton
                      label="Dismiss"
                      onClick={(event) => {
                        event.stopPropagation()
                        void api.notifications.dismiss(item.id)
                      }}
                    >
                      <XCircle size={14} />
                    </IconButton>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
