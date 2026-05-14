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

const KIND_FILTER_OPTIONS = Object.entries(KIND_LABELS)

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
  const [kindFilter, setKindFilter] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filter === 'unread' && i.read_at) return false
      if (kindFilter && i.kind !== kindFilter) return false
      return true
    })
  }, [items, filter, kindFilter])

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

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markNotificationRead(id)
      setItems(prev => prev.map(it => it.id === id ? { ...it, read_at: new Date().toISOString() } : it))
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
          <select
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-strong)',
              background: 'var(--card-bg)',
              cursor: 'pointer',
            }}
          >
            <option value="">Todos los tipos</option>
            {KIND_FILTER_OPTIONS.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
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
            <InboxRow
              key={n.id}
              n={n}
              isPending={isPending}
              onOpen={() => handleClick(n)}
              onMarkRead={() => handleMarkRead(n.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function InboxRow({
  n,
  isPending,
  onOpen,
  onMarkRead,
}: {
  n: NotificationRow
  isPending: boolean
  onOpen: () => void
  onMarkRead: () => void
}) {
  const [hover, setHover] = useState(false)
  const unread = !n.read_at

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '14px 18px',
        background: unread ? 'rgba(124, 58, 237, 0.06)' : 'transparent',
        borderBottom: '1px solid var(--border)',
        cursor: isPending ? 'wait' : 'pointer',
        textAlign: 'left',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {unread && (
            <span style={{ width: 9, height: 9, borderRadius: 999, background: '#7c3aed', flexShrink: 0 }} />
          )}
          <span style={{ fontSize: 14, fontWeight: unread ? 600 : 500, color: 'var(--text-strong)' }}>
            {n.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {unread && hover && (
            <button
              onClick={e => { e.stopPropagation(); onMarkRead() }}
              disabled={isPending}
              title="Marcar como leída"
              style={{
                padding: '3px 8px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--card-bg)',
                color: 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 600,
                cursor: isPending ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Check size={11} /> Leída
            </button>
          )}
          <span style={{
            fontSize: 11, fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 999,
            background: 'var(--gray-100)',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}>
            {KIND_LABELS[n.kind] ?? n.kind}
          </span>
        </div>
      </div>
      {n.body && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {n.body}
        </p>
      )}
      <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
        {formatDate(n.created_at)}
      </span>
    </div>
  )
}
