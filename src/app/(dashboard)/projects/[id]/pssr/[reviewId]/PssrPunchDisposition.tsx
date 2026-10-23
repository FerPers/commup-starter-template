'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { updatePunchClassification } from '@/app/actions/punches'
import { PUNCH_CATEGORY_CFG, PUNCH_STATUS_COLORS } from '@/lib/constants/status-colors'
import { STARTUP_DISPOSITIONS, STARTUP_DISPOSITION_HELP, startupDispositionBlockers, type StartupDisposition } from '@/lib/punches/category-guide'
import { punchDisplayStatus } from '@/lib/punches/verification'
import { ink } from '@/lib/theme'

// Pendientes abiertos del sistema y su disposición para el arranque (fase 4, §10.7 / libro 16.37).
// Para enviar y aprobar el PSSR: todos con disposición y ninguno «cerrar antes del arranque» abierto
// (lo exigen también las acciones submitPssrForApproval / approvePssrAndIssueRfsu).

export type SystemPunch = {
  id: string
  punch_number: string
  category: 'A' | 'B' | 'C'
  description: string
  status: string
  resolved_at: string | null
  startup_disposition: string | null
  tags: { id: string; tag_number: string } | null
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)' }
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '12px', verticalAlign: 'top' }

export default function PssrPunchDisposition({ projectId, systemCode, punches, editable }: {
  projectId: string
  systemCode: string | null
  punches: SystemPunch[]
  editable: boolean
}) {
  const t = useTranslations('PunchGuide')
  const tl = useTranslations('PunchList')
  const lang = useLocale() === 'en' ? 'en' : 'es'
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { missing, mustClose } = startupDispositionBlockers(punches)
  const ok = missing.length === 0 && mustClose.length === 0

  function setDisposition(punchId: string, value: string) {
    setError(null)
    startTransition(async () => {
      const res = await updatePunchClassification({ punchId, projectId, startupDisposition: (value || null) as StartupDisposition | null })
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <section style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', padding: '20px 24px', marginBottom: '20px' }} aria-labelledby="pssr-punches">
      <h2 id="pssr-punches" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>
        {t('pssrTitle', { system: systemCode ?? '—' })}
      </h2>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>{t('pssrHelp')}</p>

      <div role="status" style={{
        padding: '10px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', fontWeight: 600,
        background: ok ? 'var(--success-50)' : 'var(--warning-50)', border: `1px solid ${ok ? 'var(--success-200)' : 'var(--warning-200)'}`, color: ok ? 'var(--success-700)' : 'var(--warning-800)',
      }}>
        {punches.length === 0 ? t('pssrNone') : ok ? t('pssrOk', { n: punches.length }) : t('pssrBlocked', { missing: missing.length, mustClose: mustClose.length })}
      </div>

      {punches.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Punch</th>
                <th style={th}>{t('colDescription')}</th>
                <th style={th}>{t('colStatus')}</th>
                <th style={th}>{t('dispositionLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {punches.map(p => {
                const cat = PUNCH_CATEGORY_CFG[p.category]
                const ds = punchDisplayStatus(p)
                const st = PUNCH_STATUS_COLORS[ds] ?? PUNCH_STATUS_COLORS.open
                const blocking = !p.startup_disposition || p.startup_disposition === 'close_before_startup'
                return (
                  <tr key={p.id} style={{ background: blocking ? 'var(--warning-50)' : undefined }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <Link href={`/projects/${projectId}/punches/${p.id}`} style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'inherit', textDecoration: 'none', display: 'block' }}>{p.punch_number}</Link>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: cat.bg, color: ink(cat.color), border: `1px solid ${cat.border}` }}>{cat.label}</span>
                    </td>
                    <td style={td}>
                      {p.description}
                      {p.tags && (
                        <div><Link href={`/projects/${projectId}/tags/${p.tags.id}?tab=punches`} style={{ fontSize: '11px', color: 'var(--primary-700)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }}>{p.tags.tag_number} ↗</Link></div>
                      )}
                    </td>
                    <td style={td}><span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, background: st.bg, color: ink(st.color), whiteSpace: 'nowrap' }}>{tl(`punchStatus.${ds}`)}</span></td>
                    <td style={{ ...td, minWidth: '220px' }}>
                      <select value={p.startup_disposition ?? ''} disabled={!editable || isPending} onChange={e => setDisposition(p.id, e.target.value)}
                        aria-label={`${t('dispositionLabel')} ${p.punch_number}`}
                        style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', background: 'var(--card-bg)', color: 'var(--text-strong)', width: '100%' }}>
                        <option value="">{t('noDisposition')}</option>
                        {STARTUP_DISPOSITIONS.map(d => <option key={d} value={d}>{t(`disposition.${d}`)}</option>)}
                      </select>
                      {p.startup_disposition && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{STARTUP_DISPOSITION_HELP[p.startup_disposition as StartupDisposition]?.[lang]}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {error && <div role="alert" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--danger-700)' }}>{error}</div>}
    </section>
  )
}
