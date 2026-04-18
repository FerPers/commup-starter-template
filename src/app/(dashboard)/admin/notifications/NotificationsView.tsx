'use client'

import dynamic from 'next/dynamic'

const PushNotificationManager = dynamic(
  () => import('@/components/PushNotificationManager'),
  { ssr: false }
)

type Sub = {
  id: string
  endpoint: string
  topics: string[]
  enabled: boolean
  failure_count: number
  last_success_at: string | null
  device_info: Record<string, unknown>
  created_at: string
}

export default function NotificationsView({
  userId,
  subscriptions,
}: {
  userId: string
  subscriptions: Sub[]
}) {
  return (
    <div style={{ padding: '32px', maxWidth: '720px' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
          🔔 Notificaciones
        </h1>
        <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
          Gestiona notificaciones push de campo: ITRs devueltos, punches Cat A, certificados listos.
        </p>
      </header>

      <PushNotificationManager userId={userId} />

      {subscriptions.length > 0 && (
        <section style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: '0 0 12px' }}>
            Tus dispositivos ({subscriptions.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {subscriptions.map(sub => (
              <div
                key={sub.id}
                style={{
                  padding: '12px 14px',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: sub.enabled ? '#10b981' : '#ef4444',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#0f172a' }}>
                    {(sub.device_info?.platform as string) || 'Dispositivo'} ·{' '}
                    {sub.topics.length} topic{sub.topics.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
                    {new URL(sub.endpoint).hostname} · {new Date(sub.created_at).toLocaleDateString()}
                  </div>
                </div>
                {sub.failure_count > 0 && (
                  <span style={{ fontSize: '11px', color: '#ea580c' }}>
                    {sub.failure_count} fallo{sub.failure_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
