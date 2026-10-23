'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAskDialog } from '@/components/ui/AskDialog'
import { createClient } from '@/lib/supabase/client'
import {
  deleteTestEquipment,
  getTestEquipmentCertificateUrl,
  saveTestEquipment,
  setTestEquipmentActive,
  setTestEquipmentCertificate,
} from '@/app/actions/test-equipment'
import { TEST_EQUIPMENT_KINDS, calibrationState, type CalibrationState, type TestEquipmentKind } from '@/lib/test-equipment/calibration'
import { CalibrationChip } from '@/components/test-equipment/CalibrationChip'
import { evidencePath } from '@/lib/readiness/gates'
import { useLocalToday } from '@/lib/use-local-today'

// Inventario de equipos de prueba (fase 4 · bloque B, §10.9–10.12): calibración obligatoria
// (n.º de certificado + fechas), PDF opcional en el bucket test-equipment/<org>/<equipo>/….

export type EquipmentRow = {
  id: string
  code: string
  kind: TestEquipmentKind
  make: string | null
  model: string | null
  serial_number: string
  owner_company: string | null
  certificate_number: string
  calibrated_on: string
  calibration_due: string
  certificate_path: string | null
  notes: string | null
  is_active: boolean
}


const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 'var(--text-sm)',
  background: 'var(--card-bg)', color: 'var(--text-strong)', boxSizing: 'border-box',
}
const label: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', ...label, borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--primary-500)' : 'var(--card-bg)', color: primary ? '#fff' : 'var(--text-strong)',
})

type Form = {
  id?: string; code: string; kind: TestEquipmentKind; make: string; model: string; serialNumber: string
  ownerCompany: string; certificateNumber: string; calibratedOn: string; calibrationDue: string; notes: string
}
const EMPTY: Form = { code: '', kind: 'insulation_tester', make: '', model: '', serialNumber: '', ownerCompany: '', certificateNumber: '', calibratedOn: '', calibrationDue: '', notes: '' }


export default function TestEquipmentAdmin({ orgId, rows, canDelete, companies = [] }: { orgId: string; rows: EquipmentRow[]; canDelete: boolean; companies?: string[] }) {
  const t = useTranslations('TestEquipment')
  const { dialog, confirm } = useAskDialog() // G-08: diálogo propio
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [filter, setFilter] = useState<'' | CalibrationState | 'inactive'>('')
  const [q, setQ] = useState('')
  // Fecha local del navegador (null hasta hidratar): el estado no depende de la zona del servidor.
  const today = useLocalToday()

  const withState = useMemo(() => rows.map(r => ({ ...r, state: today ? calibrationState(r, today) : null })), [rows, today])
  const active = withState.filter(r => r.is_active)
  const kpis = [
    { key: 'total', n: active.length },
    { key: 'valid', n: active.filter(r => r.state === 'valid').length },
    { key: 'expiring', n: active.filter(r => r.state === 'expiring').length },
    { key: 'expired', n: active.filter(r => r.state === 'expired').length },
  ]
  const query = q.trim().toLowerCase()
  const shown = withState.filter(r =>
    (filter === 'inactive' ? !r.is_active : r.is_active && (!filter || r.state === filter)) &&
    (!query || [r.code, r.serial_number, r.make, r.model, r.owner_company, r.certificate_number].some(v => v?.toLowerCase().includes(query))))

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }

  function edit(r: EquipmentRow) {
    setForm({
      id: r.id, code: r.code, kind: r.kind, make: r.make ?? '', model: r.model ?? '', serialNumber: r.serial_number,
      ownerCompany: r.owner_company ?? '', certificateNumber: r.certificate_number, calibratedOn: r.calibrated_on,
      calibrationDue: r.calibration_due, notes: r.notes ?? '',
    })
  }

  function upload(r: EquipmentRow, file: File) {
    run(async () => {
      const path = evidencePath(orgId, r.id, file.name, crypto.randomUUID())
      const { error: upErr } = await createClient().storage.from('test-equipment').upload(path, file, { contentType: file.type })
      if (upErr) return { error: upErr.message }
      return setTestEquipmentCertificate({ id: r.id, path })
    })
  }

  function openCert(path: string) {
    run(async () => {
      const res = await getTestEquipmentCertificateUrl({ path })
      if (res.url) window.open(res.url, '_blank', 'noopener')
      return res
    })
  }

  const f = form
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(s => s && { ...s, [k]: e.target.value })
  const formValid = !!f && !!f.code.trim() && !!f.serialNumber.trim() && !!f.certificateNumber.trim() && !!f.calibratedOn && !!f.calibrationDue

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {dialog}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
          <p style={{ ...small, margin: '4px 0 0', maxWidth: 780 }}>{t('subtitle')}</p>
        </div>
        <button type="button" style={btn(true)} onClick={() => setForm({ ...EMPTY })}>+ {t('new')}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.key} style={{ ...card, padding: 16 }}>
            <div style={label}>{t(`kpi.${k.key}`)}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: k.key === 'expired' && k.n ? 'var(--danger-700)' : k.key === 'expiring' && k.n ? '#b45309' : 'var(--text-strong)', marginTop: 4 }}>{k.n}</div>
          </div>
        ))}
      </div>

      {error && <div role="alert" style={{ padding: '10px 14px', background: 'var(--danger-50)', border: '1px solid #fecaca', borderRadius: 8, color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>{error}</div>}

      {f && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={f.id ? t('edit') : t('new')}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-strong)' }}>{f.id ? t('edit') : t('new')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={label}>{t('f.code')} *</span><input style={input} value={f.code} onChange={set('code')} placeholder="MEG-01" /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={label}>{t('f.kind')} *</span>
              <select style={input} value={f.kind} onChange={set('kind')}>{TEST_EQUIPMENT_KINDS.map(k => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}</select></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={label}>{t('f.make')}</span><input style={input} value={f.make} onChange={set('make')} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={label}>{t('f.model')}</span><input style={input} value={f.model} onChange={set('model')} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={label}>{t('f.serial')} *</span><input style={input} value={f.serialNumber} onChange={set('serialNumber')} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={label}>{t('f.owner')}</span><input style={input} list="te-companies" value={f.ownerCompany} onChange={set('ownerCompany')} />
              <datalist id="te-companies">{companies.map(c => <option key={c} value={c} />)}</datalist></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={label}>{t('f.certificate')} *</span><input style={input} value={f.certificateNumber} onChange={set('certificateNumber')} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={label}>{t('f.calibratedOn')} *</span><input type="date" style={input} value={f.calibratedOn} onChange={set('calibratedOn')} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={label}>{t('f.due')} *</span><input type="date" style={input} value={f.calibrationDue} onChange={set('calibrationDue')} /></label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={label}>{t('f.notes')}</span><textarea rows={2} style={input} value={f.notes} onChange={set('notes')} /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn(true, !formValid || isPending)} disabled={!formValid || isPending}
              onClick={() => run(() => saveTestEquipment(f), () => setForm(null))}>{t('save')}</button>
            <button type="button" style={btn(false)} onClick={() => setForm(null)}>{t('cancel')}</button>
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input aria-label={t('search')} placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} style={{ ...input, width: 280 }} />
        <select aria-label={t('filter')} value={filter} onChange={e => setFilter(e.target.value as typeof filter)} style={{ ...input, width: 220 }}>
          <option value="">{t('allActive')}</option>
          {(['valid', 'expiring', 'expired'] as const).map(s => <option key={s} value={s}>{t(`state.${s}`)}</option>)}
          <option value="inactive">{t('inactive')}</option>
        </select>
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>{t('f.code')}</th>
              <th style={th}>{t('f.kind')}</th>
              <th style={th}>{t('col.equipment')}</th>
              <th style={th}>{t('f.owner')}</th>
              <th style={th}>{t('f.certificate')}</th>
              <th style={th}>{t('f.due')}</th>
              <th style={th}>{t('col.state')}</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.55 }}>
                <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{r.code}</td>
                <td style={{ ...td, ...small }}>{t(`kind.${r.kind}`)}</td>
                <td style={td}>{[r.make, r.model].filter(Boolean).join(' ') || '—'}<div style={{ ...small, fontSize: 'var(--text-xs)' }}>S/N {r.serial_number}</div></td>
                <td style={{ ...td, ...small }}>{r.owner_company ?? '—'}</td>
                <td style={td}>
                  {r.certificate_number}
                  <div>
                    {r.certificate_path
                      ? <button type="button" onClick={() => openCert(r.certificate_path!)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary-600, #2563eb)', cursor: 'pointer', fontSize: 'var(--text-xs)' }}>{t('viewCert')}</button>
                      : <span style={{ ...small, fontSize: 'var(--text-xs)' }}>{t('noCert')}</span>}
                  </div>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.calibration_due}<div style={{ ...small, fontSize: 'var(--text-xs)' }}>{t('calibratedOn', { date: r.calibrated_on })}</div></td>
                <td style={td}>{r.state && <CalibrationChip state={r.state} />}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" style={{ ...btn(false), padding: '4px 10px', fontSize: 'var(--text-xs)' }} onClick={() => edit(r)}>{t('edit')}</button>
                    <label style={{ ...btn(false), padding: '4px 10px', fontSize: 'var(--text-xs)' }}>
                      {t('uploadCert')}
                      <input type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={e => { const file = e.target.files?.[0]; if (file) upload(r, file) }} />
                    </label>
                    <button type="button" style={{ ...btn(false), padding: '4px 10px', fontSize: 'var(--text-xs)' }} disabled={isPending}
                      onClick={() => run(() => setTestEquipmentActive({ id: r.id, active: !r.is_active }))}>{r.is_active ? t('deactivate') : t('activate')}</button>
                    {canDelete && (
                      <button type="button" style={{ ...btn(false), padding: '4px 10px', fontSize: 'var(--text-xs)', color: 'var(--danger-700)' }} disabled={isPending}
                        onClick={async () => { if (await confirm({ message: t('deleteConfirm', { code: r.code }), confirmLabel: t('delete'), danger: true })) run(() => deleteTestEquipment({ id: r.id })) }}>{t('delete')}</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={8} style={{ ...td, ...small, textAlign: 'center', padding: 32 }}>{t('empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
