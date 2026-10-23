'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { limitNormal, MAX_LABEL_LENGTH } from '@/lib/pid/markups'
import type { PageSize, Pt } from '@/lib/pid/geometry'
import type { ApprovedGates, MarkupView, SystemRef } from './types'

// P2: paneles de la barra derecha del visor para las marcas: la marca elegida (sistema, lados del límite, etiqueta,
// confirmar si llegó de la revisión anterior, redibujar, borrar) y el límite por confirmar (elegir los dos sistemas).

const box: React.CSSProperties = {
  margin: '12px 16px', padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)',
  display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-strong)',
}
const reviewBox: React.CSSProperties = {
  padding: 10, borderRadius: 8, background: 'var(--warning-50)', border: '1px solid var(--warning-300)', color: 'var(--warning-800)',
  display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12,
}
const btn: React.CSSProperties = {
  minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-strong)',
  fontSize: 13, cursor: 'pointer',
}
const primaryBtn: React.CSSProperties = { ...btn, border: 0, background: 'var(--primary-600)', color: '#fff', fontWeight: 600 }
const fieldLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }
const selectStyle: React.CSSProperties = {
  width: '100%', minHeight: 36, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: 13,
}

/** Rótulos de los lados de una barra: izquierda/derecha si es vertical, arriba/abajo si es horizontal. */
export function sideKeys(bar: [Pt, Pt], size: PageSize): ['left', 'right'] | ['top', 'bottom'] {
  const n = limitNormal(bar, size)
  return Math.abs(n.x) >= Math.abs(n.y) ? ['left', 'right'] : ['top', 'bottom']
}

function SystemSelect({ id, value, systems, onChange, allowNone, disabled }: {
  id: string; value: string | null; systems: SystemRef[]; onChange: (v: string | null) => void; allowNone?: string; disabled?: boolean
}) {
  return (
    <select id={id} value={value ?? ''} disabled={disabled} onChange={e => onChange(e.target.value || null)} style={selectStyle}>
      {allowNone ? <option value="">{allowNone}</option> : !value && <option value="" disabled>—</option>}
      {systems.map(s => <option key={s.id} value={s.id}>{s.code}{s.name !== s.code ? ` — ${s.name}` : ''}</option>)}
    </select>
  )
}

/** Aviso: alguno de los sistemas de la marca tiene una liberación aprobada (el cambio queda registrado). */
function ApprovedNote({ ids, systems, approved }: { ids: (string | null)[]; systems: Map<string, SystemRef>; approved: ApprovedGates }) {
  const t = useTranslations('PidDocuments')
  const hits = ids.filter((id): id is string => !!id && !!approved[id]?.length)
  if (!hits.length) return null
  return (
    <p role="note" style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
      {hits.map(id => t('markups.approvedNote', { system: systems.get(id)?.code ?? '?', gates: approved[id].join(', ') })).join(' ')}
    </p>
  )
}

export function SelectedMarkupPanel({
  markup, page, systems, systemList, approved, canEdit, busy, onChange, onDelete, onConfirm, onRedraw, onClose,
}: {
  markup: MarkupView
  page: PageSize
  systems: Map<string, SystemRef>
  systemList: SystemRef[]
  approved: ApprovedGates
  canEdit: boolean
  busy: boolean
  onChange: (patch: { system_id?: string; other_system_id?: string | null; label?: string | null; swap?: boolean }) => void
  onDelete: () => void
  onConfirm: () => void
  onRedraw: () => void
  onClose: () => void
}) {
  const t = useTranslations('PidDocuments')
  const [label, setLabel] = useState(markup.label ?? '')
  const sys = systems.get(markup.system_id)
  const sides = markup.kind === 'limit' && markup.points.length === 2 ? sideKeys(markup.points as [Pt, Pt], page) : null

  return (
    <section aria-label={t('markups.selected')} style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: sys?.color ?? 'var(--gray-400)' }} />
        <strong style={{ flex: 1 }}>{t(`markups.kind_${markup.kind}`)} · <span style={{ fontFamily: 'ui-monospace, monospace' }}>{sys?.code ?? '?'}</span></strong>
        <button type="button" onClick={onClose} aria-label={t('viewer.cancel')} style={{ ...btn, minHeight: 28, padding: '0 8px' }}>×</button>
      </div>

      {markup.needs_review && (
        <div style={reviewBox}>
          <strong>{t('markups.reviewOne')}</strong>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={busy} onClick={onConfirm} style={primaryBtn}>{t('markups.confirm')}</button>
              <button type="button" disabled={busy} onClick={onRedraw} style={{ ...btn, color: 'var(--warning-800)' }}>{t('markups.redraw')}</button>
            </div>
          )}
        </div>
      )}

      <ApprovedNote ids={[markup.system_id, markup.other_system_id]} systems={systems} approved={approved} />

      {canEdit ? (
        <>
          {sides ? (
            <>
              <label htmlFor="mk-side-a" style={fieldLabel}>{t(`markups.side_${sides[0]}`)}</label>
              <SystemSelect id="mk-side-a" value={markup.system_id} systems={systemList} disabled={busy}
                onChange={v => v && onChange({ system_id: v })} />
              <label htmlFor="mk-side-b" style={fieldLabel}>{t(`markups.side_${sides[1]}`)}</label>
              <SystemSelect id="mk-side-b" value={markup.other_system_id} systems={systemList.filter(s => s.id !== markup.system_id)} disabled={busy}
                allowNone={t('markups.batteryLimit')} onChange={v => onChange({ other_system_id: v })} />
              {markup.other_system_id && (
                <button type="button" disabled={busy} onClick={() => onChange({ swap: true })} style={btn}>{t('markups.swap')}</button>
              )}
            </>
          ) : (
            <>
              <label htmlFor="mk-system" style={fieldLabel}>{t('markups.system')}</label>
              <SystemSelect id="mk-system" value={markup.system_id} systems={systemList} disabled={busy}
                onChange={v => v && onChange({ system_id: v })} />
            </>
          )}
          {markup.kind === 'label' && (
            <>
              <label htmlFor="mk-label" style={fieldLabel}>{t('markups.labelText')}</label>
              <input id="mk-label" value={label} maxLength={MAX_LABEL_LENGTH} placeholder={sys?.code ?? ''} disabled={busy}
                onChange={e => setLabel(e.target.value)}
                onBlur={() => { const next = label.trim() ? label.trim() : null; if (next !== (markup.label ?? null)) onChange({ label: next }) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                style={{ ...selectStyle, padding: '0 10px' }} />
            </>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {markup.kind === 'line' && !markup.needs_review && (
              <button type="button" disabled={busy} onClick={onRedraw} style={btn}>{t('markups.redraw')}</button>
            )}
            <button type="button" disabled={busy} onClick={onDelete}
              style={{ ...btn, color: 'var(--danger-600)', borderColor: 'var(--danger-200)' }}>{t('markups.delete')}</button>
          </div>
        </>
      ) : (
        markup.kind === 'limit' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {sys?.code ?? '?'} | {markup.other_system_id ? systems.get(markup.other_system_id)?.code ?? '?' : t('markups.batteryLimit')}
          </span>
        )
      )}
    </section>
  )
}

export function LimitDraftPanel({
  bar, page, systemId, otherSystemId, systems, systemList, approved, busy, onChange, onSave, onCancel,
}: {
  bar: [Pt, Pt]
  page: PageSize
  systemId: string | null
  otherSystemId: string | null
  systems: Map<string, SystemRef>
  systemList: SystemRef[]
  approved: ApprovedGates
  busy: boolean
  onChange: (sides: { system_id: string | null; other_system_id: string | null }) => void
  onSave: () => void
  onCancel: () => void
}) {
  const t = useTranslations('PidDocuments')
  const [a, b] = sideKeys(bar, page)
  const canSave = (systemId !== null || otherSystemId !== null) && systemId !== otherSystemId
  return (
    <section aria-label={t('markups.newLimit')} style={{ ...box, borderColor: 'var(--primary-300)' }}>
      <strong>{t('markups.newLimit')}</strong>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('markups.newLimitHelp')}</span>
      <label htmlFor="lim-a" style={fieldLabel}>{t(`markups.side_${a}`)}</label>
      <SystemSelect id="lim-a" value={systemId} systems={systemList} allowNone={t('markups.batteryLimit')}
        onChange={v => onChange({ system_id: v, other_system_id: otherSystemId === v ? null : otherSystemId })} />
      <label htmlFor="lim-b" style={fieldLabel}>{t(`markups.side_${b}`)}</label>
      <SystemSelect id="lim-b" value={otherSystemId} systems={systemList} allowNone={t('markups.batteryLimit')}
        onChange={v => onChange({ system_id: systemId === v ? null : systemId, other_system_id: v })} />
      <ApprovedNote ids={[systemId, otherSystemId]} systems={systems} approved={approved} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy || !canSave} onClick={onSave} style={{ ...primaryBtn, opacity: canSave ? 1 : 0.5 }}>{t('markups.save')}</button>
        <button type="button" onClick={() => onChange({ system_id: otherSystemId, other_system_id: systemId })} style={btn}>{t('markups.swap')}</button>
        <button type="button" onClick={onCancel} style={btn}>{t('viewer.cancel')}</button>
      </div>
    </section>
  )
}
