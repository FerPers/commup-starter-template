'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { OPEN_STATUSES, REGISTER_KINDS, REGISTER_STATUSES, type RegisterKind, type RegisterStatus } from '@/lib/registers/catalog'
import { StatusChip, btn, card, input, linkStyle, small } from './register-ui'

export type RegisterRow = {
  id: string
  number: string
  kind: RegisterKind
  title: string
  status: RegisterStatus
  updated_at: string
  system: string | null
  tags: string[]
}

type Props = {
  project: { id: string; code: string; name: string }
  rows: RegisterRow[]
  activeKinds: RegisterKind[]
  canCreate: boolean
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }

export default function RegistersView({ project, rows, activeKinds, canCreate }: Props) {
  const t = useTranslations('Registers')
  const [kind, setKind] = useState<'' | RegisterKind>('')
  const [status, setStatus] = useState<'' | 'open' | RegisterStatus>('open')
  const [q, setQ] = useState('')

  const query = q.trim().toLowerCase()
  const filtered = rows.filter(r =>
    (!kind || r.kind === kind) &&
    (!status || (status === 'open' ? OPEN_STATUSES.includes(r.status) : r.status === status)) &&
    (!query || r.number.toLowerCase().includes(query) || r.title.toLowerCase().includes(query) || r.tags.some(tg => tg.toLowerCase().includes(query))),
  )

  const count = (pred: (r: RegisterRow) => boolean) => rows.filter(pred).length
  const kpis = [
    { label: t('kpi.open'), value: count(r => OPEN_STATUSES.includes(r.status)) },
    { label: t('kpi.active'), value: count(r => r.status === 'active') },
    { label: t('kpi.toVerify'), value: count(r => r.status === 'removed') },
    { label: t('kpi.verified'), value: count(r => r.status === 'verified') },
  ]
  const openByKind = REGISTER_KINDS.map(k => ({ k, n: count(r => r.kind === k && OPEN_STATUSES.includes(r.status)) }))

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/projects/${project.id}`} style={linkStyle}>← {project.code} · {project.name}</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
            <p style={{ ...small, margin: '4px 0 0', maxWidth: 760 }}>{t('subtitle')}</p>
          </div>
          {canCreate && activeKinds.length > 0 && (
            <Link href={`/projects/${project.id}/registers/new${kind ? `?kind=${kind}` : ''}`} style={btn('primary')}>+ {t('new')}</Link>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', marginTop: 4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {openByKind.map(({ k, n }) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(kind === k ? '' : k)}
            style={{ ...btn('outline'), padding: '5px 10px', fontSize: 'var(--text-xs)',
              background: kind === k ? 'var(--primary-500)' : 'var(--card-bg)', color: kind === k ? '#fff' : 'var(--text-strong)',
              opacity: activeKinds.includes(k) ? 1 : 0.5 }}>
            {t(`kind.${k}`)} · {n}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input aria-label={t('filter.search')} placeholder={t('filter.search')} value={q} onChange={e => setQ(e.target.value)} style={{ ...input, width: 280 }} />
        <select aria-label={t('col.status')} value={status} onChange={e => setStatus(e.target.value as typeof status)} style={{ ...input, width: 200 }}>
          <option value="open">{t('filter.openOnly')}</option>
          <option value="">{t('filter.allStatuses')}</option>
          {REGISTER_STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
        <select aria-label={t('col.type')} value={kind} onChange={e => setKind(e.target.value as typeof kind)} style={{ ...input, width: 220 }}>
          <option value="">{t('filter.allTypes')}</option>
          {REGISTER_KINDS.map(k => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
        </select>
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>{t('col.number')}</th>
              <th style={th}>{t('col.title')}</th>
              <th style={th}>{t('col.type')}</th>
              <th style={th}>{t('col.system')}</th>
              <th style={th}>{t('col.tags')}</th>
              <th style={th}>{t('col.status')}</th>
              <th style={th}>{t('col.updated')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <Link href={`/projects/${project.id}/registers/${r.id}`} style={{ fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }}>{r.number}</Link>
                </td>
                <td style={td}>{r.title}</td>
                <td style={{ ...td, ...small }}>{t(`kind.${r.kind}`)}</td>
                <td style={td}>{r.system ?? <span style={{ color: 'var(--gray-400)' }}>—</span>}</td>
                <td style={{ ...td, ...small }}>{r.tags.slice(0, 3).join(', ')}{r.tags.length > 3 ? ` +${r.tags.length - 3}` : ''}</td>
                <td style={td}><StatusChip kind={r.kind} status={r.status} /></td>
                <td style={{ ...td, ...small, whiteSpace: 'nowrap' }}>{new Date(r.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} style={{ ...td, ...small, textAlign: 'center', padding: 32 }}>{t('empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
