'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { saveVendorPackage } from '@/app/actions/vendors'
import { PACKAGE_STATUSES, PACKAGE_TONE, type PackageStatus } from '@/lib/vendors/catalog'
import { Alert, Chip, Field, btn, card, grid, input, label, small } from '../daily/daily-ui'

// Paquetes de vendor (fase 8, sesión 2). Lista con KPIs y alta de paquetes (líder+): el detalle lleva límites,
// interfaces, movilización, FAT/SAT, reportes, recomendaciones y desmovilización.

export type PackageRow = {
  id: string; number: string; title: string; status: PackageStatus; company: string; plannedMobilization: string | null
  systemIds: string[]; pendingTests: number; failedTests: number; toDecide: number; openFindings: number
}
type Opt = { id: string; code: string; name: string }

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', ...label, borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }

export default function VendorsView({ project, rows, systems, companies, canEdit }: {
  project: { id: string; code: string; name: string }
  rows: PackageRow[]
  systems: Opt[]
  companies: { id: string; name: string; kind: string }[]
  canEdit: boolean
}) {
  const t = useTranslations('Vendors')
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'' | PackageStatus>('')
  const [form, setForm] = useState<null | { title: string; companyId: string; systemIds: string[] }>(null)
  const sysCode = useMemo(() => new Map(systems.map(s => [s.id, s.code])), [systems])
  // Vendors y subcontratistas primero; el resto también es elegible (p. ej. un EPC que actúa como vendor).
  const companyOpts = [...companies].sort((a, b) => Number(!['vendor', 'subcontractor'].includes(a.kind)) - Number(!['vendor', 'subcontractor'].includes(b.kind)) || a.name.localeCompare(b.name))

  const shown = rows.filter(r => !status || r.status === status)
  const kpis = [
    { key: 'planned', n: rows.filter(r => r.status === 'planned').length },
    { key: 'mobilized', n: rows.filter(r => r.status === 'mobilized').length },
    { key: 'pendingTests', n: rows.reduce((s, r) => s + r.pendingTests, 0) },
    { key: 'openFindings', n: rows.reduce((s, r) => s + r.openFindings, 0), red: true },
    { key: 'toDecide', n: rows.reduce((s, r) => s + r.toDecide, 0) },
  ]

  function create() {
    if (!form) return
    setError(null)
    start(async () => {
      const res = await saveVendorPackage({ projectId: project.id, title: form.title, companyId: form.companyId, systemIds: form.systemIds, tagIds: [] })
      if (res.error) { setError(res.error); return }
      router.push(`/projects/${project.id}/vendors/${res.id}`)
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
          <p style={{ ...small, margin: '4px 0 0' }}>{project.code} · {project.name} — {t('subtitle')}</p>
        </div>
        {canEdit && !form && (
          <button type="button" style={btn('primary')} onClick={() => setForm({ title: '', companyId: companyOpts[0]?.id ?? '', systemIds: [] })}>+ {t('new')}</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.key} style={{ ...card, padding: 14 }}>
            <div style={label}>{t(`kpi.${k.key}`)}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.red && k.n > 0 ? 'var(--danger-700)' : 'var(--text-strong)' }}>{k.n}</div>
          </div>
        ))}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {form && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={t('new')}>
          {companies.length === 0 ? (
            <Alert kind="warn">{t('noCompanies')} <Link href="/admin/companies" style={{ fontWeight: 600 }}>{t('goCompanies')}</Link></Alert>
          ) : (
            <div style={grid}>
              <Field text={t('f.title')} required wide><input style={input} value={form.title} maxLength={200} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
              <Field text={t('f.company')} required>
                <select style={input} value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })}>
                  {companyOpts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field text={t('f.systems')}>
                <select multiple style={{ ...input, minHeight: 110 }} value={form.systemIds}
                  onChange={e => setForm({ ...form, systemIds: Array.from(e.target.selectedOptions).map(o => o.value) })}>
                  {systems.map(s => <option key={s.id} value={s.id}>{s.code}{s.name !== s.code ? ` — ${s.name}` : ''}</option>)}
                </select>
              </Field>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={isPending || !form.title.trim() || !form.companyId} style={btn('primary', isPending || !form.title.trim() || !form.companyId)} onClick={create}>{t('create')}</button>
            <button type="button" style={btn('outline')} onClick={() => setForm(null)}>{t('cancel')}</button>
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <select style={{ ...input, maxWidth: 220 }} aria-label={t('f.status')} value={status} onChange={e => setStatus(e.target.value as PackageStatus | '')}>
          <option value="">{t('allStatus')}</option>
          {PACKAGE_STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>{t('col.number')}</th><th style={th}>{t('f.title')}</th><th style={th}>{t('f.company')}</th>
            <th style={th}>{t('f.systems')}</th><th style={th}>{t('f.status')}</th><th style={th}>{t('col.pending')}</th>
          </tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} style={{ ...td, color: 'var(--text-muted)' }}>{rows.length ? t('noMatch') : t('empty')}</td></tr>}
            {shown.map(r => (
              <tr key={r.id}>
                <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <Link href={`/projects/${project.id}/vendors/${r.id}`} style={{ color: 'var(--primary-700)', textDecoration: 'none' }}>{r.number}</Link>
                </td>
                <td style={td}>{r.title}</td>
                <td style={td}>{r.company}</td>
                <td style={td}>{r.systemIds.map(s => sysCode.get(s)).filter(Boolean).join(', ') || '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}><Chip tone={PACKAGE_TONE[r.status]}>{t(`status.${r.status}`)}</Chip></td>
                <td style={{ ...td, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {r.pendingTests > 0 && <Chip tone="blue">{t('chip.tests', { n: r.pendingTests })}</Chip>}
                  {r.failedTests > 0 && <Chip tone="red">{t('chip.failed', { n: r.failedTests })}</Chip>}
                  {r.openFindings > 0 && <Chip tone="amber">{t('chip.findings', { n: r.openFindings })}</Chip>}
                  {r.toDecide > 0 && <Chip tone="violet">{t('chip.recs', { n: r.toDecide })}</Chip>}
                  {r.pendingTests + r.failedTests + r.openFindings + r.toDecide === 0 && <span style={small}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
