'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

const TIERS = ['admin', 'privileged', 'editor'] as const

/** N0 (H-23): aviso tras un rebote por permisos (`?denied=<nivel>`): qué rol pide la página y cuál tiene el usuario. */
export default function DeniedNotice({ role }: { role: string }) {
  const t = useTranslations('Errors')
  const tr = useTranslations('Topbar.role')
  const params = useSearchParams()
  const [closed, setClosed] = useState(false)
  const tier = params.get('denied')
  if (closed || !tier || !(TIERS as readonly string[]).includes(tier)) return null
  return (
    <div role="alert" style={{ margin: '12px 16px 0', padding: '10px 14px', borderRadius: 8, background: 'var(--warning-50)', border: '1px solid var(--warning-200)', color: 'var(--warning-800)', fontSize: 13, display: 'flex', gap: 10, alignItems: 'center' }}>
      <span style={{ flex: 1 }}>{t('deniedNeeds', { needs: t(`tier.${tier}`), role: tr(role) })}</span>
      <button type="button" onClick={() => setClosed(true)} aria-label={t('dismiss')} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16 }}>✕</button>
    </div>
  )
}
