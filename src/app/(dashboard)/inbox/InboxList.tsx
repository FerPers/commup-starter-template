'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Filter } from 'lucide-react'
import {
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
} from '@/app/actions/notifications'

const KIND_LABELS: Record<string, string> = {
  itr_signature_revoked: 'Firma ITR revocada',
  certificate_revoked: 'Certificado revocado',
  punch_assigned: 'Punch asignado',
  cert_signature_requested: 'Firma de certificado solicitada',
  preservation_overdue: 'Preservación vencida',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

export default function InboxList({
  initialItems,
}: {
  initialItems: NotificationRow[]
}) {
  const router = useRouter()
  const [items, setItems] = useState<NotificationRow[]>(initialItems)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    if (filter === 'unread') return items.filter(i => !i.read_at)
    return items
  }, [items, filter])

  const unreadCount = items.filter(i => !i.read_at).length

  function handleClick(n: NotificationRow) {
    startTransition(async () => {
      if (!n.read_at) {
        await markNotificationRead(n.id)
        setItems(prev => prev.map(it => it.id === n.id ? { ...it, read_at: new Date().toISOString() } : it))
      }
      if (n.link_url) router.push(n.link_url)
    })
  }

  function handleMarkAll() {
    startTransition(async () => {
      await markAllNotificationsRead()
      const now = new Date().toISOString()
      setItems(prev => prev.map(it => it.read_at ? it : { ...it, read_at: now }))
    })
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 880, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-strong)' }}>
            Inbox
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {items.length} total · {unreadCount} sin leer
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: 2, background: 'var(--card-bg)' }}>
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '6px 12px',
                background: filter === 'all' ? 'var(--gray-100)' : 'transparent',
                border: 'none', borderRadius: 6,
                fontSize: 12, fontWeight: 600,
                color: 'var(--text-strong)',
                cursor: 'pointer',
              }}
            >
              <Filter size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Todas
            </button>
            <button
              onClick={() => setFilter('unread')}
              style={{
                padding: '6px 12px',
                background: filter === 'unread' ? 'var(--gray-100)' : 'transparent',
                border: 'none', borderRadius: 6,
                fontSize: 12, fontWeight: 600,
                color: 'var(--text-strong)',
                cursor: 'pointer',
              }}
            >
              Sin leer
            </button>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              disabled={isPending}
              style={{
                padding: '7px 14px',
                background: '#7c3aed',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: isPending ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Check size={14} /> Marcar todas
            </button>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <p style={{ padding: 48, textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
            {filter === 'unread' ? 'No tienes notificaciones sin leer' : 'No tienes notificaciones'}
          </p>
        ) : (
          filtered.map(n => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              disabled={isPending}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '14px 18px',
                background: n.read_at ? 'transparent' : 'rgba(124, 58, 237, 0.06)',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                cursor: isPending ? 'wait' : 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  {!n.read_at && (
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: '#7c3aed', flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: 14, fontWeight: n.read_at ? 500 : 600, color: 'var(--text-strong)' }}>
                    {n.title}
                  </span>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'var(--gray-100)',
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  {KIND_LABELS[n.kind] ?? n.kind}
                </span>
              </div>
              {n.body && (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {n.body}
                </p>
              )}
              <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                {formatDate(n.created_at)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
