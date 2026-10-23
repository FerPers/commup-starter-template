'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { limitNormal, MAX_LABEL_LENGTH } from '@/lib/pid/markups'
import type { PageSize, Pt } from '@/lib/pid/geometry'
import type { ApprovedGates, MarkupView, PidDoc, SystemRef } from './types'

// P2: paneles de la barra derecha del visor para las marcas: la marca elegida (sistema, lados del límite, etiqueta,
// confirmar si llegó de la revisión anterior, redibujar, borrar) y el límite por confirmar (elegir los dos sistemas).
// P4: conector entre hojas = hoja destino (P&ID del proyecto) + página, si tiene conector de vuelta y el enlace.

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

/** Hoja y página destino de un conector. */
function ConnectorTargetFields({ docs, documentId, page, value, disabled, onChange }: {
  docs: PidDoc[]
  /** Hoja abierta y su página: el mismo P&ID solo sirve para otra página. */
  documentId: string
  page: number
  value: { target_document_id: string | null; target_page: number | null }
  disabled?: boolean
  onChange: (v: { target_document_id: string | null; target_page: number }) => void
}) {
  const t = useTranslations('PidDocuments')
  const [pageText, setPageText] = useState(String(value.target_page ?? 1))
  const docId = value.target_document_id
  const commitPage = () => {
    const n = Math.max(1, Math.floor(Number(pageText) || 1))
    setPageText(String(n))
    if (n !== (value.target_page ?? 1)) onChange({ target_document_id: docId, target_page: n })
  }
  return (
    <>
      <label htmlFor="cn-doc" style={fieldLabel}>{t('markups.connectorTarget')}</label>
      <select id="cn-doc" value={docId ?? ''} disabled={disabled} style={selectStyle}
        onChange={e => {
          const next = e.target.value || null
          // Misma hoja = otra página: si estaba en la misma página, sugiere la siguiente.
          const p = next === documentId && (value.target_page ?? 1) === page ? page + 1 : value.target_page ?? 1
          setPageText(String(p))
          onChange({ target_document_id: next, target_page: p })
        }}>
        <option value="" disabled>{t('markups.connectorPick')}</option>
        {docs.map(d => (
          <option key={d.id} value={d.id}>{d.number}{d.id === documentId ? ` · ${t('markups.connectorThisSheet')}` : d.title ? ` — ${d.title}` : ''}</option>
        ))}
      </select>
      <label htmlFor="cn-page" style={fieldLabel}>{t('markups.connectorPage')}</label>
      <input id="cn-page" type="number" min={1} inputMode="numeric" value={pageText} disabled={disabled}
        onChange={e => setPageText(e.target.value)} onBlur={commitPage}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        style={{ ...selectStyle, padding: '0 10px', width: 96 }} />
    </>
  )
}

/** Estado del par de un conector y el enlace a la hoja destino. */
export type ConnectorInfo = { href: string | null; paired: boolean; targetText: string }

export function SelectedMarkupPanel({
  markup, page, systems, systemList, approved, canEdit, busy, onChange, onDelete, onConfirm, onRedraw, onClose,
  connector, pidDocs = [], documentId = '',
}: {
  markup: MarkupView
  page: PageSize
  systems: Map<string, SystemRef>
  systemList: SystemRef[]
  approved: ApprovedGates
  canEdit: boolean
  busy: boolean
  onChange: (patch: { system_id?: string; other_system_id?: string | null; label?: string | null; swap?: boolean; target_document_id?: string | null; target_page?: number }) => void
  onDelete: () => void
  onConfirm: () => void
  onRedraw: () => void
  onClose: () => void
  /** P4: conector elegido (destino, par y enlace). */
  connector?: ConnectorInfo | null
  pidDocs?: PidDoc[]
  documentId?: string
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

      {connector && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13 }}>{t('markups.connectorTo', { target: connector.targetText })}</span>
          {!connector.paired && (
            <p role="note" style={{ ...reviewBox, margin: 0 }}>{connector.href ? t('markups.connectorUnpaired') : t('markups.connectorNoTarget')}</p>
          )}
          {connector.href && (
            <Link href={connector.href} style={{ ...primaryBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', alignSelf: 'flex-start' }}>
              {t('markups.connectorOpen')} ›
            </Link>
          )}
        </div>
      )}

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
          {markup.kind === 'connector' && (
            <ConnectorTargetFields docs={pidDocs} documentId={documentId} page={markup.page_num} disabled={busy}
              value={{ target_document_id: markup.target_document_id, target_page: markup.target_page }}
              onChange={v => v.target_document_id && onChange({ target_document_id: v.target_document_id, target_page: v.target_page })} />
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

export function ConnectorDraftPanel({
  systemId, systems, docs, documentId, page, value, busy, onChange, onSave, onCancel,
}: {
  systemId: string | null
  systems: Map<string, SystemRef>
  docs: PidDoc[]
  documentId: string
  page: number
  value: { target_document_id: string | null; target_page: number }
  busy: boolean
  onChange: (v: { target_document_id: string | null; target_page: number }) => void
  onSave: () => void
  onCancel: () => void
}) {
  const t = useTranslations('PidDocuments')
  const canSave = !!systemId && !!value.target_document_id && !(value.target_document_id === documentId && value.target_page === page)
  return (
    <section aria-label={t('markups.newConnector')} style={{ ...box, borderColor: 'var(--primary-300)' }}>
      <strong>{t('markups.newConnector')}{systemId ? ` · ${systems.get(systemId)?.code ?? ''}` : ''}</strong>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('markups.newConnectorHelp')}</span>
      <ConnectorTargetFields docs={docs} documentId={documentId} page={page} value={value} onChange={onChange} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy || !canSave} onClick={onSave} style={{ ...primaryBtn, opacity: canSave ? 1 : 0.5 }}>{t('markups.save')}</button>
        <button type="button" onClick={onCancel} style={btn}>{t('viewer.cancel')}</button>
      </div>
    </section>
  )
}
