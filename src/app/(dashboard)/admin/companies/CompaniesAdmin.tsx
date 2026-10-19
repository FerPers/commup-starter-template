'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { saveCompany } from '@/app/actions/documents'
import { COMPANY_KINDS, type CompanyKind } from '@/lib/documents/catalog'
import { Alert, Chip, Field, btn, card, grid, input, label, small } from '@/app/(dashboard)/projects/[id]/daily/daily-ui'

// Empresas de la org (fase 8, sesión 1). Alta y edición: owner/admin. La empresa de cada usuario se asigna en
// Administración → Usuarios; las firmas guardan «nombre · empresa» congelado al firmar.

export type CompanyRow = {
  id: string; name: string; shortName: string; kind: CompanyKind; taxId: string; notes: string; isActive: boolean
  members: number; personnel: number; equipment: number
}
type Form = Omit<CompanyRow, 'id' | 'members' | 'personnel' | 'equipment'> & { id?: string }

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', ...label, borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const KIND_TONE: Record<CompanyKind, 'blue' | 'green' | 'violet' | 'amber' | 'muted'> = { owner: 'blue', epc: 'green', vendor: 'violet', subcontractor: 'amber', other: 'muted' }

export default function CompaniesAdmin({ rows, canEdit }: { rows: CompanyRow[]; canEdit: boolean }) {
  const t = useTranslations('Companies')
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null)

  function save() {
    if (!form) return
    setError(null)
    start(async () => {
      const res = await saveCompany(form)
      if (res.error) { setError(res.error); return }
      setForm(null)
      router.refresh()
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
          <p style={{ ...small, margin: '4px 0 0' }}>{t('subtitle')}</p>
        </div>
        {canEdit && !form && (
          <button type="button" style={btn('primary')} onClick={() => setForm({ name: '', shortName: '', kind: 'vendor', taxId: '', notes: '', isActive: true })}>+ {t('new')}</button>
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {form && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={form.id ? t('edit') : t('new')}>
          <div style={grid}>
            <Field text={t('f.name')} required><input style={input} value={form.name} maxLength={160} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field text={t('f.shortName')}><input style={input} value={form.shortName} maxLength={40} onChange={e => setForm({ ...form, shortName: e.target.value })} /></Field>
            <Field text={t('f.kind')} required>
              <select style={input} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as CompanyKind })}>
                {COMPANY_KINDS.map(k => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
              </select>
            </Field>
            <Field text={t('f.taxId')}><input style={input} value={form.taxId} maxLength={40} onChange={e => setForm({ ...form, taxId: e.target.value })} /></Field>
            <Field text={t('f.notes')} wide><input style={input} value={form.notes} maxLength={2000} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
            {form.id && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-sm)' }}>
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> {t('f.active')}
              </label>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={isPending || !form.name.trim()} style={btn('primary', isPending || !form.name.trim())} onClick={save}>{t('save')}</button>
            <button type="button" style={btn('outline')} onClick={() => setForm(null)}>{t('cancel')}</button>
          </div>
        </section>
      )}

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>{t('f.name')}</th><th style={th}>{t('f.kind')}</th><th style={th}>{t('f.taxId')}</th>
            <th style={th}>{t('col.members')}</th><th style={th}>{t('col.personnel')}</th><th style={th}>{t('col.equipment')}</th><th style={th} />
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} style={{ ...td, color: 'var(--text-muted)' }}>{t('empty')}</td></tr>}
            {rows.map(r => (
              <tr key={r.id} style={{ opacity: r.isActive ? 1 : 0.55 }}>
                <td style={td}>
                  <strong>{r.name}</strong>{r.shortName && <span style={small}> · {r.shortName}</span>}
                  {!r.isActive && <> <Chip tone="struck">{t('inactive')}</Chip></>}
                </td>
                <td style={td}><Chip tone={KIND_TONE[r.kind]}>{t(`kind.${r.kind}`)}</Chip></td>
                <td style={td}>{r.taxId || '—'}</td>
                <td style={td}>{r.members}</td>
                <td style={td}>{r.personnel}</td>
                <td style={td}>{r.equipment}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {canEdit && <button type="button" style={btn('outline')} onClick={() => setForm({ id: r.id, name: r.name, shortName: r.shortName, kind: r.kind, taxId: r.taxId, notes: r.notes, isActive: r.isActive })}>{t('edit')}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
