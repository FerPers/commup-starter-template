'use client'

import { useTranslations } from 'next-intl'
import {
  ACTION_PRIORITIES,
  DECISION_SOURCES,
  IMPACT_KINDS,
  TQ_ADDRESSEES,
  VERIFICATION_METHODS,
  type ActionPriority,
  type DecisionSource,
  type ImpactKind,
  type TqAddressee,
  type VerificationMethod,
} from '@/lib/daily/catalog'
import { TagPicker, type TagValue } from '../registers/RegisterFields'
import { Field, MemberSelect, SystemSelect, grid, input, type Member, type SystemOpt } from './daily-ui'

// Campos de alta/edición de cada entidad de la gestión diaria (fase 5). El alta y el detalle usan
// los mismos componentes; el servidor (RPC) vuelve a validar todo.

export type Options = {
  members: Member[]
  systems: SystemOpt[]
  gates: { id: string; code: string; name: string }[]
  disciplines: { id: string; code: string; name: string }[]
}

// ── Acción ──────────────────────────────────────────────────────────────
export type ActionForm = {
  title: string; description: string; ownerId: string; systemId: string; dueDate: string
  priority: ActionPriority; verificationMethod: VerificationMethod; sourceRef: string
}
export const emptyAction = (ownerId: string): ActionForm => ({
  title: '', description: '', ownerId, systemId: '', dueDate: '', priority: 'medium', verificationMethod: 'review', sourceRef: '',
})

export function ActionFields({ value, onChange, opts, disabled, showSourceRef }: {
  value: ActionForm; onChange: (v: ActionForm) => void; opts: Options; disabled?: boolean; showSourceRef?: boolean
}) {
  const t = useTranslations('Daily')
  const set = <K extends keyof ActionForm>(k: K, v: ActionForm[K]) => onChange({ ...value, [k]: v })
  return (
    <div style={grid}>
      <Field text={t('field.title')} wide required>
        <input style={input} value={value.title} maxLength={200} disabled={disabled} onChange={e => set('title', e.target.value)} />
      </Field>
      <Field text={t('field.description')} wide>
        <textarea rows={3} style={input} value={value.description} maxLength={4000} disabled={disabled} onChange={e => set('description', e.target.value)} />
      </Field>
      <Field text={t('field.owner')} required>
        <MemberSelect value={value.ownerId} onChange={v => set('ownerId', v)} members={opts.members} disabled={disabled} />
      </Field>
      <Field text={t('field.dueDate')}>
        <input type="date" style={input} value={value.dueDate} disabled={disabled} onChange={e => set('dueDate', e.target.value)} />
      </Field>
      <Field text={t('field.priority')} required>
        <select style={input} value={value.priority} disabled={disabled} onChange={e => set('priority', e.target.value as ActionPriority)}>
          {ACTION_PRIORITIES.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
        </select>
      </Field>
      <Field text={t('field.verificationMethod')} required>
        <select style={input} value={value.verificationMethod} disabled={disabled} onChange={e => set('verificationMethod', e.target.value as VerificationMethod)}>
          {VERIFICATION_METHODS.map(m => <option key={m} value={m}>{t(`method.${m}`)}</option>)}
        </select>
      </Field>
      <Field text={t('field.system')}>
        <SystemSelect value={value.systemId} onChange={v => set('systemId', v)} systems={opts.systems} disabled={disabled} emptyLabel={t('field.noSystem')} />
      </Field>
      {showSourceRef && (
        <Field text={t('field.sourceRef')}>
          <input style={input} value={value.sourceRef} maxLength={200} disabled={disabled} placeholder={t('field.sourceRefHint')} onChange={e => set('sourceRef', e.target.value)} />
        </Field>
      )}
    </div>
  )
}

// ── Restricción ─────────────────────────────────────────────────────────
export type ConstraintForm = {
  title: string; description: string; systemId: string; gateId: string; ownerId: string; needDate: string
  impactKind: ImpactKind; impact: string; recoveryPlan: string
}
export const emptyConstraint = (ownerId: string): ConstraintForm => ({
  title: '', description: '', systemId: '', gateId: '', ownerId, needDate: '', impactKind: 'schedule', impact: '', recoveryPlan: '',
})

export function ConstraintFields({ value, onChange, opts, disabled }: {
  value: ConstraintForm; onChange: (v: ConstraintForm) => void; opts: Options; disabled?: boolean
}) {
  const t = useTranslations('Daily')
  const set = <K extends keyof ConstraintForm>(k: K, v: ConstraintForm[K]) => onChange({ ...value, [k]: v })
  return (
    <div style={grid}>
      <Field text={t('field.title')} wide required>
        <input style={input} value={value.title} maxLength={200} disabled={disabled} onChange={e => set('title', e.target.value)} />
      </Field>
      <Field text={t('field.constraintDescription')} wide required>
        <textarea rows={3} style={input} value={value.description} maxLength={4000} disabled={disabled} onChange={e => set('description', e.target.value)} />
      </Field>
      <Field text={t('field.system')} required>
        <SystemSelect value={value.systemId} onChange={v => set('systemId', v)} systems={opts.systems} disabled={disabled} emptyLabel={t('field.pick')} />
      </Field>
      <Field text={t('field.gate')}>
        <select style={input} value={value.gateId} disabled={disabled} onChange={e => set('gateId', e.target.value)}>
          <option value="">{t('field.noGate')}</option>
          {opts.gates.map(g => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
        </select>
      </Field>
      <Field text={t('field.owner')} required>
        <MemberSelect value={value.ownerId} onChange={v => set('ownerId', v)} members={opts.members} disabled={disabled} />
      </Field>
      <Field text={t('field.needDate')} required>
        <input type="date" style={input} value={value.needDate} disabled={disabled} onChange={e => set('needDate', e.target.value)} />
      </Field>
      <Field text={t('field.impactKind')} required>
        <select style={input} value={value.impactKind} disabled={disabled} onChange={e => set('impactKind', e.target.value as ImpactKind)}>
          {IMPACT_KINDS.map(k => <option key={k} value={k}>{t(`impact.${k}`)}</option>)}
        </select>
      </Field>
      <Field text={t('field.impact')} wide>
        <textarea rows={2} style={input} value={value.impact} maxLength={4000} disabled={disabled} placeholder={t('field.impactHint')} onChange={e => set('impact', e.target.value)} />
      </Field>
      <Field text={t('field.recoveryPlan')} wide>
        <textarea rows={2} style={input} value={value.recoveryPlan} maxLength={4000} disabled={disabled} onChange={e => set('recoveryPlan', e.target.value)} />
      </Field>
    </div>
  )
}

// ── TQ ──────────────────────────────────────────────────────────────────
export type TqForm = {
  subject: string; question: string; addressedTo: TqAddressee; addressedToName: string
  disciplineId: string; systemId: string; requiredBy: string; tags: TagValue[]
}
export const emptyTq = (): TqForm => ({
  subject: '', question: '', addressedTo: 'engineering', addressedToName: '', disciplineId: '', systemId: '', requiredBy: '', tags: [],
})

export function TqFields({ projectId, value, onChange, opts, disabled, lockQuestion }: {
  projectId: string; value: TqForm; onChange: (v: TqForm) => void; opts: Options; disabled?: boolean; lockQuestion?: boolean
}) {
  const t = useTranslations('Daily')
  const set = <K extends keyof TqForm>(k: K, v: TqForm[K]) => onChange({ ...value, [k]: v })
  return (
    <div style={grid}>
      <Field text={t('field.subject')} wide required>
        <input style={input} value={value.subject} maxLength={200} disabled={!!disabled || !!lockQuestion} onChange={e => set('subject', e.target.value)} />
      </Field>
      <Field text={t('field.question')} wide required>
        <textarea rows={4} style={input} value={value.question} maxLength={8000} disabled={!!disabled || !!lockQuestion} onChange={e => set('question', e.target.value)} />
      </Field>
      <Field text={t('field.addressedTo')} required>
        <select style={input} value={value.addressedTo} disabled={disabled} onChange={e => set('addressedTo', e.target.value as TqAddressee)}>
          {TQ_ADDRESSEES.map(a => <option key={a} value={a}>{t(`addressee.${a}`)}</option>)}
        </select>
      </Field>
      <Field text={t('field.addressedToName')}>
        <input style={input} value={value.addressedToName} maxLength={200} disabled={disabled} onChange={e => set('addressedToName', e.target.value)} />
      </Field>
      <Field text={t('field.requiredBy')}>
        <input type="date" style={input} value={value.requiredBy} disabled={disabled} onChange={e => set('requiredBy', e.target.value)} />
      </Field>
      <Field text={t('field.discipline')}>
        <select style={input} value={value.disciplineId} disabled={disabled} onChange={e => set('disciplineId', e.target.value)}>
          <option value="">{t('field.noDiscipline')}</option>
          {opts.disciplines.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
        </select>
      </Field>
      <Field text={t('field.system')}>
        <SystemSelect value={value.systemId} onChange={v => set('systemId', v)} systems={opts.systems} disabled={disabled} emptyLabel={t('field.noSystem')} />
      </Field>
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{t('field.tags')}</div>
        {/* Reusa el selector de tags de los registros (rol único «subject»). */}
        <TagPicker projectId={projectId} kind="temporary" value={value.tags} onChange={v => set('tags', v)} disabled={disabled} />
      </div>
    </div>
  )
}

// ── Decisión ────────────────────────────────────────────────────────────
export type DecisionForm = {
  title: string; context: string; decision: string; rationale: string; decidedBy: string; attendees: string
  decidedAt: string; sourceKind: DecisionSource; sourceRef: string; systemId: string
}
export const emptyDecision = (decidedBy: string, today: string): DecisionForm => ({
  title: '', context: '', decision: '', rationale: '', decidedBy, attendees: '', decidedAt: today, sourceKind: 'meeting', sourceRef: '', systemId: '',
})

export function DecisionFields({ value, onChange, opts, lockSource, today }: {
  value: DecisionForm; onChange: (v: DecisionForm) => void; opts: Options; lockSource?: boolean; today: string
}) {
  const t = useTranslations('Daily')
  const set = <K extends keyof DecisionForm>(k: K, v: DecisionForm[K]) => onChange({ ...value, [k]: v })
  return (
    <div style={grid}>
      <Field text={t('field.title')} wide required>
        <input style={input} value={value.title} maxLength={200} onChange={e => set('title', e.target.value)} />
      </Field>
      <Field text={t('field.context')} wide>
        <textarea rows={2} style={input} value={value.context} maxLength={8000} onChange={e => set('context', e.target.value)} />
      </Field>
      <Field text={t('field.decision')} wide required>
        <textarea rows={3} style={input} value={value.decision} maxLength={8000} onChange={e => set('decision', e.target.value)} />
      </Field>
      <Field text={t('field.rationale')} wide>
        <textarea rows={2} style={input} value={value.rationale} maxLength={8000} onChange={e => set('rationale', e.target.value)} />
      </Field>
      <Field text={t('field.decidedBy')} required>
        <MemberSelect value={value.decidedBy} onChange={v => set('decidedBy', v)} members={opts.members} />
      </Field>
      <Field text={t('field.decidedAt')} required>
        <input type="date" style={input} value={value.decidedAt} max={today} onChange={e => set('decidedAt', e.target.value)} />
      </Field>
      <Field text={t('field.attendees')} wide>
        <input style={input} value={value.attendees} maxLength={2000} placeholder={t('field.attendeesHint')} onChange={e => set('attendees', e.target.value)} />
      </Field>
      <Field text={t('field.decisionSource')}>
        <select style={input} value={value.sourceKind} disabled={lockSource} onChange={e => set('sourceKind', e.target.value as DecisionSource)}>
          {DECISION_SOURCES.filter(s => !!lockSource || (s !== 'tq' && s !== 'constraint')).map(s => <option key={s} value={s}>{t(`decisionSource.${s}`)}</option>)}
        </select>
      </Field>
      {!lockSource && (
        <Field text={t('field.sourceRef')}>
          <input style={input} value={value.sourceRef} maxLength={200} placeholder={t('field.sourceRefHint')} onChange={e => set('sourceRef', e.target.value)} />
        </Field>
      )}
      <Field text={t('field.system')}>
        <SystemSelect value={value.systemId} onChange={v => set('systemId', v)} systems={opts.systems} emptyLabel={t('field.noSystem')} />
      </Field>
    </div>
  )
}
