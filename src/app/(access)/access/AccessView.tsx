'use client'

import Link from 'next/link'
import { purgeSessionCaches } from '@/lib/sync/session'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { respondInvitation } from '@/app/actions/org'
import { createClient } from '@/lib/supabase/client'
import type { InactiveMembership } from '@/lib/supabase/membership'

const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }
const btn = (primary: boolean): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--primary-500)' : 'var(--card-bg)', color: primary ? '#fff' : 'var(--text-strong)',
})

export default function AccessView({ items, hasActive, title }: { items: InactiveMembership[]; hasActive: boolean; title: string }) {
  const t = useTranslations('Access')
  const tr = useTranslations('Topbar')
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const roleLabel = (r: string) => (tr.has(`role.${r}`) ? tr(`role.${r}`) : r)

  function respond(orgId: string, accept: boolean) {
    setError(null)
    start(async () => {
      const res = await respondInvitation(orgId, accept)
      if (res.error) { setError(res.error); return }
      router.push(accept ? '/home' : '/access')
      router.refresh()
    })
  }

  async function logout() {
    await createClient().auth.signOut()
    // S18: sin membresía activa no puede sincronizar; se borran las páginas en caché (sus capturas quedan
    // retenidas a su nombre y nadie más puede enviarlas).
    await purgeSessionCaches()
    router.push('/login')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{title}</h1>
      {error && <div role="alert" style={{ color: 'var(--danger-700)', fontSize: 14 }}>{error}</div>}
      {items.length === 0 && <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('none')}</p>}
      {items.map(m => (
        <section key={m.orgId} style={card}>
          <strong style={{ color: 'var(--text-strong)' }}>{m.orgName}</strong>
          {m.state === 'invited' ? (
            <>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{t('invited', { role: roleLabel(m.role) })}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={btn(true)} disabled={isPending} onClick={() => respond(m.orgId, true)}>{t('accept')}</button>
                <button type="button" style={btn(false)} disabled={isPending} onClick={() => respond(m.orgId, false)}>{t('decline')}</button>
              </div>
            </>
          ) : (
            <span style={{ fontSize: 14, color: 'var(--danger-700)' }}>
              {m.state === 'suspended' ? t('suspended', { reason: m.reason ?? '—' }) : t('expired')}
            </span>
          )}
        </section>
      ))}
      <div style={{ display: 'flex', gap: 12 }}>
        {hasActive && <Link href="/home" style={{ fontSize: 14 }}>{t('back')}</Link>}
        <button type="button" style={{ ...btn(false), padding: '6px 12px' }} onClick={logout}>{t('logout')}</button>
      </div>
    </div>
  )
}
