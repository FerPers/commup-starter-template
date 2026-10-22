'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addItrTestEquipment, getTestEquipmentCertificateUrl, removeItrTestEquipment } from '@/app/actions/test-equipment'
import { calibrationState, equipmentSignBlocker, isUsable } from '@/lib/test-equipment/calibration'
import { useLocalToday } from '@/lib/use-local-today'
import { CalibrationChip } from '@/components/test-equipment/CalibrationChip'

// Equipos de prueba usados en el ITR (fase 4 · bloque B). La calibración se valida contra la fecha de
// uso; registrar uno vencido se permite con aviso, pero sign_itr_atomic no deja firmar (§10.3, §10.12).

export type EquipmentUsed = {
  equipment_id: string
  used_on: string
  calibrated_on: string
  calibration_due: string
  certificate_number: string
  snapshot: { code?: string; kind?: string; make?: string | null; model?: string | null; serial_number?: string; certificate_path?: string | null }
}

export type EquipmentOption = {
  id: string
  code: string
  kind: string
  make: string | null
  model: string | null
  serial_number: string
  calibrated_on: string
  calibration_due: string
}

const small: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)' }

export default function TestEquipmentSection({ itrId, projectId, requires, used, options, editable, canManageInventory }: {
  itrId: string
  projectId: string
  requires: boolean
  used: EquipmentUsed[]
  options: EquipmentOption[]
  editable: boolean
  canManageInventory: boolean
}) {
  const t = useTranslations('TestEquipment')
  const router = useRouter()
  const today = useLocalToday()
  const [pick, setPick] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!requires && used.length === 0 && !editable) return null

  const blocker = equipmentSignBlocker(
    used.map(u => ({ code: u.snapshot.code ?? '?', used_on: u.used_on, calibrated_on: u.calibrated_on, calibration_due: u.calibration_due })),
    requires,
  )
  const available = options.filter(o => !used.some(u => u.equipment_id === o.id))
  const picked = available.find(o => o.id === pick)
  const pickedState = picked && today ? calibrationState(picked, today) : null

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }

  function openCert(path: string) {
    run(async () => {
      const res = await getTestEquipmentCertificateUrl({ path })
      if (res.url) window.open(res.url, '_blank', 'noopener')
      return res
    })
  }

  return (
    <section aria-labelledby="itr-test-equipment" style={{ background: 'var(--card-bg)', border: `1px solid ${blocker ? 'var(--danger-200)' : 'var(--border)'}`, borderRadius: '12px', padding: '16px 20px', margin: '0 0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <h2 id="itr-test-equipment" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('itrTitle')}</h2>
        {requires && <span style={{ ...small, fontWeight: 600 }}>{t('required')}</span>}
      </div>

      {blocker && (
        <div role="alert" style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '8px', background: 'var(--danger-50)', color: 'var(--danger-700)', fontSize: '12px', fontWeight: 600 }}>
          {blocker.kind === 'missing' ? t('blockMissing') : t('blockExpired', { codes: blocker.codes.join(', ') })}
        </div>
      )}

      {used.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {used.map(u => {
            const state = calibrationState(u, u.used_on)
            return (
              <li key={u.equipment_id} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px' }}>
                <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{u.snapshot.code}</strong>
                <span style={small}>{u.snapshot.kind ? t(`kind.${u.snapshot.kind}`) : ''} · {[u.snapshot.make, u.snapshot.model].filter(Boolean).join(' ')} · S/N {u.snapshot.serial_number}</span>
                <span style={small}>{t('certDue', { cert: u.certificate_number, due: u.calibration_due })}</span>
                <CalibrationChip state={state} />
                <span style={small}>{t('usedOn', { date: u.used_on })}</span>
                {u.snapshot.certificate_path && (
                  <button type="button" onClick={() => openCert(u.snapshot.certificate_path!)}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary-600, var(--primary-600))', cursor: 'pointer', fontSize: '12px' }}>{t('viewCert')}</button>
                )}
                {editable && (
                  <button type="button" disabled={isPending} onClick={() => run(() => removeItrTestEquipment({ projectId, itrId, equipmentId: u.equipment_id }))}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-muted)' }}>{t('remove')}</button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {editable && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
          <select aria-label={t('pick')} value={pick} onChange={e => setPick(e.target.value)} disabled={isPending}
            style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', background: 'var(--card-bg)', color: 'var(--text-strong)', minWidth: '280px' }}>
            <option value="">{t('pick')}</option>
            {available.map(o => {
              const s = today ? calibrationState(o, today) : null
              return <option key={o.id} value={o.id}>{s && !isUsable(s) ? '⚠ ' : ''}{o.code} — {t(`kind.${o.kind}`)} · {t('due', { date: o.calibration_due })}</option>
            })}
          </select>
          <button type="button" disabled={!pick || isPending} onClick={() => run(() => addItrTestEquipment({ projectId, itrId, equipmentId: pick }), () => setPick(''))}
            style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', background: 'var(--primary-500)', color: '#fff', cursor: pick ? 'pointer' : 'not-allowed', opacity: pick ? 1 : 0.5 }}>
            {t('add')}
          </button>
          {pickedState && !isUsable(pickedState) && <span role="status" style={{ fontSize: '12px', color: 'var(--danger-700)', fontWeight: 600 }}>{t('pickExpired')}</span>}
          {pickedState === 'expiring' && <span role="status" style={{ fontSize: '12px', color: 'var(--warning-700)' }}>{t('pickExpiring')}</span>}
          {available.length === 0 && (
            <span style={small}>
              {t('noInventory')}{' '}
              {canManageInventory && <Link href="/admin/test-equipment" style={{ color: 'var(--primary-600, var(--primary-600))' }}>{t('goInventory')}</Link>}
            </span>
          )}
        </div>
      )}
      {error && <div role="alert" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--danger-700)' }}>{error}</div>}
    </section>
  )
}
