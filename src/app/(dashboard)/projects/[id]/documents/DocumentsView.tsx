'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { saveDocument } from '@/app/actions/documents'
import { DOC_TYPES, REVISION_STATUSES, STATUS_TONE, type DocType, type RevisionStatus } from '@/lib/documents/catalog'
import { Alert, Chip, Field, btn, card, grid, input, label, small } from '../daily/daily-ui'

// Registro maestro de documentos (fase 8, sesión 1). Lista con filtros, alta de documentos (líder+) y avisos de
// registros que usan una revisión superada.

export type DocRow = {
  id: string; number: string; title: string; docType: DocType; disciplineId: string | null; companyId: string | null
  currentRev: string | null; currentStatus: RevisionStatus | null; issuedOn: string | null; hasDraft: boolean
  systemIds: string[]; refs: number; outdatedRefs: number
}
type Opt = { id: string; code: string; name: string }

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', ...label, borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }

export default function DocumentsView({ project, rows, systems, disciplines, companies, canEdit }: {
  project: { id: string; code: string; name: string }
  rows: DocRow[]
  systems: Opt[]
  disciplines: Opt[]
  companies: { id: string; name: string }[]
  canEdit: boolean
}) {
  const t = useTranslations('Documents')
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [type, setType] = useState<'' | DocType>('')
  const [status, setStatus] = useState<'' | RevisionStatus | 'none' | 'outdated'>('')
  const [system, setSystem] = useState('')
  const [form, setForm] = useState<null | { number: string; title: string; docType: DocType; disciplineId: string; companyId: string; systemIds: string[] }>(null)

  const sysCode = useMemo(() => new Map(systems.map(s => [s.id, s.code])), [systems])
  const query = q.trim().toLowerCase()
  const shown = rows.filter(r =>
    (!query || r.number.toLowerCase().includes(query) || r.title.toLowerCase().includes(query))
    && (!type || r.docType === type)
    && (!system || r.systemIds.includes(system))
    && (!status || (status === 'none' ? !r.currentRev : status === 'outdated' ? r.outdatedRefs > 0 : r.currentStatus === status)))

  const kpis = [
    { key: 'total', n: rows.length },
    { key: 'noRev', n: rows.filter(r => !r.currentRev).length },
    { key: 'asBuilt', n: rows.filter(r => r.currentStatus === 'as_built' || r.currentStatus === 'final').length },
    { key: 'outdated', n: rows.filter(r => r.outdatedRefs > 0).length, red: true },
  ]

  function create() {
    if (!form) return
    setError(null)
    start(async () => {
      const res = await saveDocument({ projectId: project.id, ...form })
      if (res.error) { setError(res.error); return }
      setForm(null)
      router.push(`/projects/${project.id}/documents/${res.id}`)
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
          <button type="button" style={btn('primary')} onClick={() => setForm({ number: '', title: '', docType: 'pid', disciplineId: '', companyId: '', systemIds: [] })}>
            + {t('new')}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
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
          <div style={grid}>
            <Field text={t('f.number')} required><input style={input} value={form.number} maxLength={80} onChange={e => setForm({ ...form, number: e.target.value })} /></Field>
            <Field text={t('f.type')} required>
              <select style={input} value={form.docType} onChange={e => setForm({ ...form, docType: e.target.value as DocType })}>
                {DOC_TYPES.map(d => <option key={d} value={d}>{t(`type.${d}`)}</option>)}
              </select>
            </Field>
            <Field text={t('f.title')} required wide><input style={input} value={form.title} maxLength={300} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
            <Field text={t('f.discipline')}>
              <select style={input} value={form.disciplineId} onChange={e => setForm({ ...form, disciplineId: e.target.value })}>
                <option value="">—</option>
                {disciplines.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
              </select>
            </Field>
            <Field text={t('f.company')}>
              <select style={input} value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })}>
                <option value="">—</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field text={t('f.systems')} wide>
              <select multiple style={{ ...input, minHeight: 110 }} value={form.systemIds}
                onChange={e => setForm({ ...form, systemIds: Array.from(e.target.selectedOptions).map(o => o.value) })}>
                {systems.map(s => <option key={s.id} value={s.id}>{s.code}{s.name !== s.code ? ` — ${s.name}` : ''}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn('primary', isPending || !form.number.trim() || !form.title.trim())}
              disabled={isPending || !form.number.trim() || !form.title.trim()} onClick={create}>{t('create')}</button>
            <button type="button" style={btn('outline')} onClick={() => setForm(null)}>{t('cancel')}</button>
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...input, maxWidth: 260 }} placeholder={t('search')} aria-label={t('search')} value={q} onChange={e => setQ(e.target.value)} />
        <select style={{ ...input, maxWidth: 200 }} aria-label={t('f.type')} value={type} onChange={e => setType(e.target.value as DocType | '')}>
          <option value="">{t('allTypes')}</option>
          {DOC_TYPES.map(d => <option key={d} value={d}>{t(`type.${d}`)}</option>)}
        </select>
        <select style={{ ...input, maxWidth: 220 }} aria-label={t('f.status')} value={status} onChange={e => setStatus(e.target.value as typeof status)}>
          <option value="">{t('allStatus')}</option>
          {REVISION_STATUSES.filter(s => s !== 'draft').map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          <option value="none">{t('filterNoRev')}</option>
          <option value="outdated">{t('filterOutdated')}</option>
        </select>
        <select style={{ ...input, maxWidth: 220 }} aria-label={t('f.systems')} value={system} onChange={e => setSystem(e.target.value)}>
          <option value="">{t('allSystems')}</option>
          {systems.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>{t('f.number')}</th><th style={th}>{t('f.title')}</th><th style={th}>{t('f.type')}</th>
              <th style={th}>{t('col.rev')}</th><th style={th}>{t('f.systems')}</th><th style={th}>{t('col.refs')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td style={{ ...td, color: 'var(--text-muted)' }} colSpan={6}>{rows.length ? t('noMatch') : t('empty')}</td></tr>}
            {shown.map(r => (
              <tr key={r.id}>
                <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <Link href={`/projects/${project.id}/documents/${r.id}`} style={{ color: 'var(--primary-600, #2563eb)', textDecoration: 'none' }}>{r.number}</Link>
                </td>
                <td style={td}>{r.title}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{t(`type.${r.docType}`)}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {r.currentRev && r.currentStatus
                    ? <Chip tone={STATUS_TONE[r.currentStatus]}>Rev {r.currentRev} · {t(`status.${r.currentStatus}`)}</Chip>
                    : <Chip tone="muted">{t('noRev')}</Chip>}
                  {r.hasDraft && <> <Chip tone="muted">{t('draftPending')}</Chip></>}
                </td>
                <td style={td}>{r.systemIds.map(s => sysCode.get(s)).filter(Boolean).join(', ') || '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {r.refs}
                  {r.outdatedRefs > 0 && <> <Chip tone="red">{t('outdatedN', { n: r.outdatedRefs })}</Chip></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
