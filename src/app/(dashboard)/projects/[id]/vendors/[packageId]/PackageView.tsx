'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { saveVendorInterface, saveVendorPackage, setVendorChecklistItem, transitionVendorPackage } from '@/app/actions/vendors'
import {
  INTERFACE_STATUSES, INTERFACE_TONE, PACKAGE_TONE, VENDOR_CHECKLIST,
  type ActivityKind, type ActivityResult, type ChecklistPhase, type InterfaceStatus, type PackageStatus, type RecommendationStatus, type ReportKind,
} from '@/lib/vendors/catalog'
import { Alert, Chip, Field, btn, card, grid, input, label, linkStyle, small, type Attachment, type Member } from '../../daily/daily-ui'
import ActivitiesSection from './ActivitiesSection'
import ReportsSection from './ReportsSection'

// Paquete de vendor (fase 8, sesión 2; doc §15). Cabecera con estado y transiciones, ficha (alcance, límites,
// sistemas, equipos, gate de movilización), interfaces y checklists; FAT/SAT y reportes en sus secciones.

export type Finding = {
  id: string; description: string; tag_id: string | null; category: string | null; created_at: string
  tags: { tag_number: string } | null
  punches: { id: string; punch_number: string; status: string; tag_id: string | null } | null
  actions: { id: string; number: string; status: string } | null
}
export type ActivityRow = {
  id: string; kind: ActivityKind; title: string; planned_date: string | null; performed_on: string | null; location: string | null
  result: ActivityResult; notes: string | null; result_by: string | null; result_at: string | null; findings: Finding[]; attachments: Attachment[]
  /** S13 (F-05): actividad que esta repite. */
  retest_of: string | null
}
export type ReportRow = {
  id: string; kind: ReportKind; report_date: string; headcount: number | null; hours: number | null; activities: string; issues: string | null
  issued_by: string | null; issued_at: string; attachments: Attachment[]
}
export type RecommendationRow = {
  id: string; seq: number; description: string; rationale: string | null; requires_moc: boolean; status: RecommendationStatus
  proposed_by: string | null; proposed_at: string; decided_by: string | null; decided_at: string | null; decision_reason: string | null
  moc_reference: string | null; implemented_by: string | null; implemented_at: string | null; implementation_note: string | null
}
export type PackageData = {
  id: string; number: string; title: string; status: PackageStatus; companyId: string; scope: string; boundaries: string
  mobSystemId: string | null; mobGateId: string | null; plannedMobilization: string | null
  mobilizedAt: string | null; mobilizedBy: string | null; mobilizationNote: string | null
  demobilizedAt: string | null; demobilizedBy: string | null; demobilizationNote: string | null; cancelReason: string | null
  systemIds: string[]; tagIds: string[]
  interfaces: { id: string; counterpart_company_id: string | null; counterpart: string | null; description: string; responsible: string | null; status: InterfaceStatus; updated_at: string }[]
  checklist: { phase: string; item_key: string; done: boolean; note: string | null; checked_by: string | null; checked_at: string | null }[]
  mobilization: { gate_required: boolean; gate_status: string; gate_ok: boolean; missing: string[]; open_interfaces: number; ready: boolean } | null
  demobilization: { missing: string[]; final_report: boolean; open_cat_a: { id: string; number: string }[]; ready: boolean } | null
  activities: ActivityRow[]
  reports: ReportRow[]
  recommendations: RecommendationRow[]
  /**
   * S13 (F-34): datos del registro para los ítems del checklist que antes eran casillas a ciegas: documentos de la
   * empresa con revisión vigente / As-Built y equipos de prueba de la empresa con calibración vigente.
   */
  hints: { docs: number; docsCurrent: number; docsAsBuilt: number; equipment: number; equipmentValid: number }
}
type Opt = { id: string; code: string; name: string }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

export default function PackageView({ project, pkg, companies, systems, gates, tags, members, names, userId, canLead, canEdit }: {
  project: { id: string; code: string; name: string }
  pkg: PackageData
  companies: { id: string; name: string; active: boolean }[]
  systems: Opt[]
  gates: { id: string; code: string; name: string }[]
  tags: { id: string; tag_number: string }[]
  members: Member[]
  names: Record<string, string>
  userId: string
  canLead: boolean
  canEdit: boolean
}) {
  const t = useTranslations('Vendors')
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({
    title: pkg.title, companyId: pkg.companyId, scope: pkg.scope, boundaries: pkg.boundaries, systemIds: pkg.systemIds, tagIds: pkg.tagIds,
    mobSystemId: pkg.mobSystemId ?? '', mobGateId: pkg.mobGateId ?? '', plannedMobilization: pkg.plannedMobilization ?? '',
  })
  const [ifz, setIfz] = useState<null | { id?: string; counterpartCompanyId: string; counterpart: string; description: string; responsible: string; status: InterfaceStatus }>(null)
  const [note, setNote] = useState('')

  const closed = pkg.status === 'demobilized' || pkg.status === 'cancelled'
  const companyName = (cid: string | null) => companies.find(c => c.id === cid)?.name ?? '—'
  const sysCode = (sid: string | null) => systems.find(s => s.id === sid)?.code ?? '—'
  const tagNo = new Map(tags.map(x => [x.id, x.tag_number]))
  const who = (uid: string | null) => (uid ? names[uid] : undefined) ?? '—'
  const done = (phase: ChecklistPhase) => new Map(pkg.checklist.filter(c => c.phase === phase).map(c => [c.item_key, c]))

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }

  function save() {
    run(() => saveVendorPackage({
      projectId: project.id, id: pkg.id, companyId: f.companyId, title: f.title, scope: f.scope, boundaries: f.boundaries,
      systemIds: f.systemIds, tagIds: f.tagIds, mobSystemId: f.mobSystemId || null, mobGateId: f.mobGateId || null, plannedMobilization: f.plannedMobilization || null,
    }), () => setEdit(false))
  }

  // S13 (F-34): lo que dice el registro sobre los ítems que dependen de documentos y equipos de la empresa.
  const h = pkg.hints
  const hint = (k: string): string | null =>
    k === 'documents_current' ? t('hint.docs', { current: h.docsCurrent, n: h.docs })
      : k === 'as_built_delivered' ? t('hint.asBuilt', { done: h.docsAsBuilt, n: h.docs })
        : k === 'calibrated_equipment' ? t('hint.equipment', { valid: h.equipmentValid, n: h.equipment })
          : null

  function renderChecklist(phase: ChecklistPhase, editable: boolean) {
    const map = done(phase)
    return (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {VENDOR_CHECKLIST[phase].map(k => {
          const row = map.get(k)
          return (
            <li key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--text-sm)' }}>
              <input type="checkbox" checked={!!row?.done} disabled={!editable || isPending} aria-label={t(`check.${k}`)}
                onChange={e => run(() => setVendorChecklistItem({ projectId: project.id, packageId: pkg.id, phase, key: k, done: e.target.checked }))} />
              <span style={{ flex: 1 }}>
                {t(`check.${k}`)}
                {row?.done && <span style={{ ...small, fontSize: 'var(--text-xs)' }} suppressHydrationWarning> · {who(row.checked_by)} · {when(row.checked_at)}</span>}
                {hint(k) && <span style={{ display: 'block', ...small, fontSize: 'var(--text-xs)' }}>{hint(k)}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    )
  }

  const mob = pkg.mobilization
  const demob = pkg.demobilization

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/projects/${project.id}/vendors`} style={linkStyle}>← {t('title')}</Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', margin: '8px 0 4px' }}>{pkg.number} — {pkg.title}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip tone={PACKAGE_TONE[pkg.status]}>{t(`status.${pkg.status}`)}</Chip>
          <span style={small}>{companyName(pkg.companyId)} · {pkg.systemIds.map(sysCode).join(', ') || t('noSystems')}</span>
          {canLead && !closed && !edit && <button type="button" style={btn('outline')} onClick={() => setEdit(true)}>{t('editPkg')}</button>}
        </div>
        {pkg.status === 'cancelled' && <p style={{ ...small, margin: '6px 0 0' }}>{t(pkg.mobilizedAt ? 'terminated' : 'cancelled', { reason: pkg.cancelReason ?? '' })}</p>}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {edit ? (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={t('editPkg')}>
          <div style={grid}>
            <Field text={t('f.title')} required wide><input style={input} value={f.title} maxLength={200} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
            <Field text={t('f.company')} required>
              <select style={input} value={f.companyId} disabled={pkg.status !== 'planned'} onChange={e => setF({ ...f, companyId: e.target.value })}>
                {companies.filter(c => c.active || c.id === f.companyId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field text={t('f.planned')}><input type="date" style={input} value={f.plannedMobilization} onChange={e => setF({ ...f, plannedMobilization: e.target.value })} /></Field>
            <Field text={t('f.scope')} wide><textarea rows={3} style={input} value={f.scope} maxLength={8000} onChange={e => setF({ ...f, scope: e.target.value })} /></Field>
            <Field text={t('f.boundaries')} wide><textarea rows={3} style={input} value={f.boundaries} maxLength={8000} placeholder={t('f.boundariesPh')} onChange={e => setF({ ...f, boundaries: e.target.value })} /></Field>
            <Field text={t('f.systems')}>
              <select multiple style={{ ...input, minHeight: 110 }} value={f.systemIds} onChange={e => setF({ ...f, systemIds: Array.from(e.target.selectedOptions).map(o => o.value) })}>
                {systems.map(s => <option key={s.id} value={s.id}>{s.code}{s.name !== s.code ? ` — ${s.name}` : ''}</option>)}
              </select>
            </Field>
            <Field text={t('f.tags')}>
              <select multiple style={{ ...input, minHeight: 110 }} value={f.tagIds} onChange={e => setF({ ...f, tagIds: Array.from(e.target.selectedOptions).map(o => o.value) })}>
                {tags.map(x => <option key={x.id} value={x.id}>{x.tag_number}</option>)}
              </select>
              <span style={{ ...small, fontSize: 'var(--text-xs)' }}>{t('f.tagsHint')}</span>
            </Field>
            <Field text={t('f.mobSystem')}>
              <select style={input} value={f.mobSystemId} disabled={pkg.status !== 'planned'} onChange={e => setF({ ...f, mobSystemId: e.target.value, mobGateId: e.target.value ? f.mobGateId : '' })}>
                <option value="">{t('f.noMobGate')}</option>
                {systems.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
              </select>
            </Field>
            <Field text={t('f.mobGate')}>
              <select style={input} value={f.mobGateId} disabled={pkg.status !== 'planned' || !f.mobSystemId} onChange={e => setF({ ...f, mobGateId: e.target.value })}>
                <option value="">—</option>
                {gates.map(g => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={isPending || !f.title.trim() || !!f.mobSystemId !== !!f.mobGateId} style={btn('primary', isPending)} onClick={save}>{t('save')}</button>
            <button type="button" style={btn('outline')} onClick={() => setEdit(false)}>{t('cancel')}</button>
          </div>
        </section>
      ) : (
        <section style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }} aria-label={t('scopeTitle')}>
          <div><div style={label}>{t('f.scope')}</div><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', fontSize: 'var(--text-sm)' }}>{pkg.scope || '—'}</p></div>
          <div><div style={label}>{t('f.boundaries')}</div><p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', fontSize: 'var(--text-sm)' }}>{pkg.boundaries || '—'}</p></div>
          <div><div style={label}>{t('f.tags')}</div><p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)' }}>{pkg.tagIds.map(x => tagNo.get(x) ?? '').filter(Boolean).join(', ') || '—'}</p></div>
          <div>
            <div style={label}>{t('f.mobGate')}</div>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)' }}>
              {pkg.mobGateId
                ? <Link href={`/projects/${project.id}/systems/${pkg.mobSystemId}`} style={linkStyle}>{sysCode(pkg.mobSystemId)} · {gates.find(g => g.id === pkg.mobGateId)?.code ?? '—'}</Link>
                : t('f.noMobGate')}
              {pkg.plannedMobilization && <> · {t('plannedOn', { date: pkg.plannedMobilization })}</>}
            </p>
          </div>
        </section>
      )}

      {/* ── Interfaces (20.10, 20.52) ─────────────────────────────────── */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="vnd-ifz">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 id="vnd-ifz" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{t('ifz.title')}</h2>
          {canEdit && !closed && !ifz && (
            <button type="button" style={btn('outline')} onClick={() => setIfz({ counterpartCompanyId: '', counterpart: '', description: '', responsible: '', status: 'open' })}>+ {t('ifz.new')}</button>
          )}
        </div>
        <p style={{ ...small, margin: 0 }}>{t('ifz.help')}</p>
        {ifz && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={grid}>
              <Field text={t('ifz.company')}>
                <select style={input} value={ifz.counterpartCompanyId} onChange={e => setIfz({ ...ifz, counterpartCompanyId: e.target.value })}>
                  <option value="">—</option>
                  {companies.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field text={t('ifz.counterpart')}><input style={input} value={ifz.counterpart} maxLength={160} placeholder={t('ifz.counterpartPh')} onChange={e => setIfz({ ...ifz, counterpart: e.target.value })} /></Field>
              <Field text={t('ifz.responsible')}><input style={input} value={ifz.responsible} maxLength={160} onChange={e => setIfz({ ...ifz, responsible: e.target.value })} /></Field>
              <Field text={t('f.status')}>
                <select style={input} value={ifz.status} onChange={e => setIfz({ ...ifz, status: e.target.value as InterfaceStatus })}>
                  {INTERFACE_STATUSES.map(s => <option key={s} value={s}>{t(`ifz.status.${s}`)}</option>)}
                </select>
              </Field>
              <Field text={t('ifz.description')} required wide><input style={input} value={ifz.description} maxLength={2000} onChange={e => setIfz({ ...ifz, description: e.target.value })} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={isPending || !ifz.description.trim() || (!ifz.counterpartCompanyId && !ifz.counterpart.trim())} style={btn('primary', isPending)}
                onClick={() => run(() => saveVendorInterface({ projectId: project.id, packageId: pkg.id, ...ifz, counterpartCompanyId: ifz.counterpartCompanyId || null }), () => setIfz(null))}>{t('save')}</button>
              <button type="button" style={btn('outline')} onClick={() => setIfz(null)}>{t('cancel')}</button>
            </div>
          </div>
        )}
        {pkg.interfaces.length === 0 ? <p style={{ ...small, margin: 0 }}>{t('ifz.empty')}</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pkg.interfaces.map(i => (
              <li key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--text-sm)', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                <Chip tone={INTERFACE_TONE[i.status]}>{t(`ifz.status.${i.status}`)}</Chip>
                <strong>{i.counterpart_company_id ? companyName(i.counterpart_company_id) : i.counterpart}</strong>
                {i.counterpart_company_id && i.counterpart && <span style={small}>({i.counterpart})</span>}
                <span>{i.description}</span>
                {i.responsible && <span style={small}>· {t('ifz.by', { who: i.responsible })}</span>}
                <span style={{ flex: 1 }} />
                {canEdit && !closed && (
                  <button type="button" style={{ ...btn('outline'), padding: '3px 10px' }} onClick={() => setIfz({
                    id: i.id, counterpartCompanyId: i.counterpart_company_id ?? '', counterpart: i.counterpart ?? '', description: i.description, responsible: i.responsible ?? '', status: i.status,
                  })}>{t('edit')}</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Movilización (20.7) ────────────────────────────────────────── */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="vnd-mob">
        <h2 id="vnd-mob" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{t('mob.title')}</h2>
        {pkg.status === 'planned' && mob ? (
          <>
            <ul style={{ margin: 0, paddingLeft: 18, ...small }}>
              <li style={{ color: mob.gate_ok ? 'var(--success-700)' : 'var(--danger-700)' }}>
                {mob.gate_required ? t('mob.gate', { gate: `${sysCode(pkg.mobSystemId)} · ${gates.find(g => g.id === pkg.mobGateId)?.code ?? ''}`, status: t.has(`gateStatus.${mob.gate_status}`) ? t(`gateStatus.${mob.gate_status}`) : mob.gate_status }) : t('mob.noGate')}
              </li>
              <li style={{ color: mob.open_interfaces === 0 ? 'var(--success-700)' : 'var(--danger-700)' }}>{t('mob.interfaces', { n: mob.open_interfaces })}</li>
              <li style={{ color: mob.missing.length === 0 ? 'var(--success-700)' : 'var(--danger-700)' }}>{t('mob.checklist', { n: mob.missing.length })}</li>
            </ul>
            {renderChecklist('mobilization', canEdit)}
            {canLead && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input style={{ ...input, flex: 1, minWidth: 200 }} value={note} maxLength={2000} placeholder={t('mob.note')} aria-label={t('mob.note')} onChange={e => setNote(e.target.value)} />
                <button type="button" disabled={isPending || !mob.ready} style={btn('primary', isPending || !mob.ready)}
                  onClick={() => run(() => transitionVendorPackage({ projectId: project.id, packageId: pkg.id, to: 'mobilize', note }), () => setNote(''))}>{t('mob.authorize')}</button>
                <button type="button" disabled={isPending || note.trim().length < 3} style={btn('danger', isPending || note.trim().length < 3)} title={t('mob.cancelHint')}
                  onClick={() => { if (window.confirm(t('mob.cancelConfirm'))) run(() => transitionVendorPackage({ projectId: project.id, packageId: pkg.id, to: 'cancel', note })) }}>{t('mob.cancel')}</button>
              </div>
            )}
          </>
        ) : pkg.mobilizedAt ? (
          <p style={{ ...small, margin: 0 }} suppressHydrationWarning>{t('mob.done', { who: who(pkg.mobilizedBy), when: when(pkg.mobilizedAt) })}{pkg.mobilizationNote ? ` — “${pkg.mobilizationNote}”` : ''}</p>
        ) : <p style={{ ...small, margin: 0 }}>—</p>}
      </section>

      <ActivitiesSection projectId={project.id} pkgId={pkg.id} pkgNumber={pkg.number} closed={closed} activities={pkg.activities}
        tags={pkg.tagIds.length ? tags.filter(x => pkg.tagIds.includes(x.id)).concat(tags.filter(x => !pkg.tagIds.includes(x.id))) : tags}
        members={members} names={names} userId={userId} canEdit={canEdit} canLead={canLead} />

      <ReportsSection projectId={project.id} pkgId={pkg.id} status={pkg.status} reports={pkg.reports} recommendations={pkg.recommendations} userId={userId}
        names={names} canEdit={canEdit} canLead={canLead} />

      {/* ── Desmovilización (20.55) ────────────────────────────────────── */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="vnd-demob">
        <h2 id="vnd-demob" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{t('demob.title')}</h2>
        {pkg.status === 'mobilized' && demob ? (
          <>
            <ul style={{ margin: 0, paddingLeft: 18, ...small }}>
              <li style={{ color: demob.final_report ? 'var(--success-700)' : 'var(--danger-700)' }}>{demob.final_report ? t('demob.finalOk') : t('demob.finalMissing')}</li>
              <li style={{ color: demob.open_cat_a.length === 0 ? 'var(--success-700)' : 'var(--danger-700)' }}>
                {t('demob.catA', { n: demob.open_cat_a.length })}{demob.open_cat_a.length > 0 && `: ${demob.open_cat_a.map(p => p.number).join(', ')}`}
              </li>
              <li style={{ color: demob.missing.length === 0 ? 'var(--success-700)' : 'var(--danger-700)' }}>{t('demob.checklist', { n: demob.missing.length })}</li>
            </ul>
            {renderChecklist('demobilization', canEdit)}
            {canLead && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input style={{ ...input, flex: 1, minWidth: 200 }} value={note} maxLength={2000} placeholder={t('mob.note')} aria-label={t('mob.note')} onChange={e => setNote(e.target.value)} />
                <button type="button" disabled={isPending || !demob.ready} style={btn('primary', isPending || !demob.ready)}
                  onClick={() => run(() => transitionVendorPackage({ projectId: project.id, packageId: pkg.id, to: 'demobilize', note }), () => setNote(''))}>{t('demob.authorize')}</button>
                <button type="button" disabled={isPending || note.trim().length < 10} style={btn('danger', isPending || note.trim().length < 10)} title={t('demob.terminateHint')}
                  onClick={() => { if (window.confirm(t('demob.terminateConfirm'))) run(() => transitionVendorPackage({ projectId: project.id, packageId: pkg.id, to: 'cancel', note })) }}>{t('demob.terminate')}</button>
              </div>
            )}
          </>
        ) : pkg.demobilizedAt ? (
          <p style={{ ...small, margin: 0 }} suppressHydrationWarning>{t('demob.done', { who: who(pkg.demobilizedBy), when: when(pkg.demobilizedAt) })}{pkg.demobilizationNote ? ` — “${pkg.demobilizationNote}”` : ''}</p>
        ) : <p style={{ ...small, margin: 0 }}>{t('demob.notYet')}</p>}
      </section>
    </div>
  )
}
