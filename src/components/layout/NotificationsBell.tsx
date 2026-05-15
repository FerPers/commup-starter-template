'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellDot, Check } from 'lucide-react'
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
} from '@/app/actions/notifications'
import { createClient } from '@/lib/supabase/client'

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime()
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d} d`
  return new Date(iso).toLocaleDateString()
}

export default function NotificationsBell({
  initialUnread,
  userId,
  orgId,
}: {
  initialUnread: number
  userId: string
  orgId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationRow[]>([])
  const [unread, setUnread] = useState(initialUnread)
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Realtime: bump unread + prepend new notification when the active user
  // receives one in the current org. RLS already restricts SELECT to own rows,
  // so the channel only ever fires for rows the user can read.
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`notif:${userId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const row = payload.new as NotificationRow & { org_id: string }
          if (row.org_id !== orgId) return
          setUnread(u => u + 1)
          setItems(prev => [
            {
              id: row.id,
              kind: row.kind,
              title: row.title,
              body: row.body,
              link_url: row.link_url,
              read_at: row.read_at,
              created_at: row.created_at,
            },
            ...prev,
          ].slice(0, 20))
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, orgId])

  async function loadItems() {
    setLoading(true)
    try {
      const res = await listMyNotifications(20)
      setItems(res.items)
      setUnread(res.unreadCount)
    } finally {
      setLoading(false)
    }
  }

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) void loadItems()
  }

  function handleClick(n: NotificationRow) {
    startTransition(async () => {
      if (!n.read_at) {
        await markNotificationRead(n.id)
        setUnread(u => Math.max(0, u - 1))
        setItems(prev => prev.map(it => it.id === n.id ? { ...it, read_at: new Date().toISOString() } : it))
      }
      setOpen(false)
      if (n.link_url) router.push(n.link_url)
    })
  }

  function handleMarkAll() {
    startTransition(async () => {
      await markAllNotificationsRead()
      setUnread(0)
      const now = new Date().toISOString()
      setItems(prev => prev.map(it => it.read_at ? it : { ...it, read_at: now }))
    })
  }

  const Icon = unread > 0 ? BellDot : Bell

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Notificaciones"
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        <Icon size={18} />
        {unread > 0 && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            background: '#dc2626',
            color: '#fff',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--card-bg)',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 360,
            maxHeight: 480,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            zIndex: 30,
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
              Notificaciones
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={isPending}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  cursor: isPending ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Check size={12} /> Marcar todas
              </button>
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <p style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                Cargando…
              </p>
            ) : items.length === 0 ? (
              <p style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                No tienes notificaciones
              </p>
            ) : (
              items.slice(0, 10).map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  disabled={isPending}
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: '10px 12px',
                    background: n.read_at ? 'transparent' : 'rgba(124, 58, 237, 0.06)',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: isPending ? 'wait' : 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: n.read_at ? 500 : 600, color: 'var(--text-strong)' }}>
                      {n.title}
                    </span>
                    {!n.read_at && (
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: '#7c3aed', flexShrink: 0 }} />
                    )}
                  </span>
                  {n.body && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {n.body}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                    {formatRelative(n.created_at)}
                  </span>
                </button>
              ))
            )}
          </div>
          <button
            onClick={() => { setOpen(false); router.push('/inbox') }}
            style={{
              padding: '10px 12px',
              background: 'var(--gray-50)',
              border: 'none',
              borderTop: '1px solid var(--border)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-strong)',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            Ver todas
          </button>
        </div>
      )}
    </div>
  )
}
