'use client'

import { dailyTabForKind, dailyTabHref } from '@/lib/navigation/hub-routes'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createAction, createConstraint, createTq, recordDecision } from '@/app/actions/daily'
import { ESCALATION_LEVELS, todayIso, type MgmtKind } from '@/lib/daily/catalog'
import { Alert, Field, btn, card, input, linkStyle, small } from '../daily-ui'
import {
  ActionFields, ConstraintFields, DecisionFields, TqFields,
  emptyAction, emptyConstraint, emptyDecision, emptyTq, type DecisionForm, type Options, type TqForm,
} from '../forms'

export type SourceRef = { kind: 'constraint' | 'tq'; id: string; number: string; title: string; systemId: string | null }

type Props = {
  project: { id: string; code: string; name: string }
  kind: MgmtKind
  opts: Options
  userId: string
  source: SourceRef | null
  supersedes: { id: string; number: string; title: string; decision: string; context: string | null; rationale: string | null; system_id: string | null } | null
  initialSystemId: string
  initialTag?: { tag_id: string; tag_number: string } | null
}

export default function NewDailyForm({ project, kind, opts, userId, source, supersedes, initialSystemId, initialTag }: Props) {
  const t = useTranslations('Daily')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const today = useMemo(() => todayIso(), [])
  const me = opts.members.some(m => m.id === userId) ? userId : (opts.members[0]?.id ?? '')

  const [action, setAction] = useState(() => ({ ...emptyAction(me), systemId: initialSystemId }))
  const [constraint, setConstraint] = useState(() => ({ ...emptyConstraint(me), systemId: initialSystemId }))
  const [level, setLevel] = useState(1)
  const [tq, setTq] = useState<TqForm>(() => ({ ...emptyTq(), systemId: initialSystemId, tags: initialTag ? [{ ...initialTag, role: 'subject' as const }] : [] }))
  const [decision, setDecision] = useState<DecisionForm>(() => ({
    ...emptyDecision(me, today),
    systemId: supersedes?.system_id ?? initialSystemId,
    sourceKind: source ? source.kind : ('meeting' as const),
    sourceRef: source ? source.number : '',
    title: supersedes?.title ?? '',
    context: supersedes?.context ?? '',
    rationale: supersedes?.rationale ?? '',
  }))
  const [supersedeReason, setSupersedeReason] = useState('')

  const back = source ? `/projects/${project.id}/daily/${source.kind}/${source.id}` : dailyTabHref(project.id, dailyTabForKind(kind))

  function submit() {
    setError(null)
    startTransition(async () => {
      const p = project.id
      let res: { id?: string; error?: string }
      if (kind === 'action') {
        res = await createAction({
          projectId: p, title: action.title, ownerId: action.ownerId, description: action.description,
          systemId: action.systemId || null, dueDate: action.dueDate || null, priority: action.priority,
          verificationMethod: action.verificationMethod, sourceRef: action.sourceRef,
          sourceKind: source?.kind ?? 'manual', sourceId: source?.id ?? null,
        })
      } else if (kind === 'constraint') {
        res = await createConstraint({
          projectId: p, title: constraint.title, description: constraint.description, systemId: constraint.systemId,
          ownerId: constraint.ownerId, needDate: constraint.needDate, impactKind: constraint.impactKind, impact: constraint.impact,
          gateId: constraint.gateId || null, recoveryPlan: constraint.recoveryPlan, level,
        })
      } else if (kind === 'tq') {
        res = await createTq({
          projectId: p, subject: tq.subject, question: tq.question, addressedTo: tq.addressedTo, addressedToName: tq.addressedToName,
          disciplineId: tq.disciplineId || null, systemId: tq.systemId || null, requiredBy: tq.requiredBy || null,
          tagIds: tq.tags.map(x => x.tag_id),
        })
      } else {
        res = await recordDecision({
          projectId: p, title: decision.title, decision: decision.decision, context: decision.context, rationale: decision.rationale,
          decidedBy: decision.decidedBy || null, attendees: decision.attendees, decidedAt: decision.decidedAt || null,
          sourceKind: decision.sourceKind, sourceId: source?.id ?? null, sourceRef: decision.sourceRef,
          systemId: decision.systemId || null, supersedesId: supersedes?.id ?? null, supersedeReason,
        })
      }
      if (res.error || !res.id) { setError(res.error ?? t('form.error')); return }
      router.push(`/projects/${project.id}/daily/${kind}/${res.id}`)
    })
  }

  // Botón habilitado solo con lo obligatorio (las RPC vuelven a validar).
  const ready = kind === 'action' ? !!action.title.trim() && !!action.ownerId
    : kind === 'constraint' ? !!constraint.title.trim() && !!constraint.description.trim() && !!constraint.systemId && !!constraint.ownerId && !!constraint.needDate
    : kind === 'tq' ? !!tq.subject.trim() && !!tq.question.trim()
    : !!decision.title.trim() && !!decision.decision.trim() && (!supersedes || supersedeReason.trim().length >= 3)

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={back} style={linkStyle}>← {source ? source.number : t('title')}</Link>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: '8px 0 0' }}>
          {supersedes ? t('form.supersedeTitle', { number: supersedes.number }) : t(`new.${kind}`)}
        </h1>
        <p style={{ ...small, margin: '4px 0 0' }}>
          {project.code} · {source ? t('form.fromSource', { number: source.number, title: source.title }) : t(`help.${kind}`)}
        </p>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {kind === 'action' && <ActionFields value={action} onChange={setAction} opts={opts} showSourceRef={!source} />}
        {kind === 'constraint' && (
          <>
            <ConstraintFields value={constraint} onChange={setConstraint} opts={opts} />
            <Field text={t('field.level')} required>
              <select style={{ ...input, maxWidth: 420 }} value={level} onChange={e => setLevel(Number(e.target.value))}>
                {ESCALATION_LEVELS.map(l => <option key={l} value={l}>{t('levelShort', { n: l })} — {t(`level.${l}`)}</option>)}
              </select>
            </Field>
            <p style={{ ...small, margin: 0 }}>{t('help.constraintGate')}</p>
          </>
        )}
        {kind === 'tq' && <TqFields projectId={project.id} value={tq} onChange={setTq} opts={opts} />}
        {kind === 'decision' && (
          <>
            {supersedes && (
              <div style={{ padding: 12, borderRadius: 8, background: 'var(--gray-50)', border: '1px solid var(--border)' }}>
                <div style={{ ...small, fontWeight: 600 }}>{t('form.previousDecision', { number: supersedes.number })}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{supersedes.decision}</div>
              </div>
            )}
            <DecisionFields value={decision} onChange={setDecision} opts={opts} lockSource={!!source} today={today} />
            {supersedes && (
              <Field text={t('field.supersedeReason')} required>
                <input style={input} value={supersedeReason} maxLength={2000} onChange={e => setSupersedeReason(e.target.value)} />
              </Field>
            )}
            <p style={{ ...small, margin: 0 }}>{t('help.decisionImmutable')}</p>
          </>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={btn('primary', isPending || !ready)} disabled={isPending || !ready} onClick={submit}>
            {isPending ? t('form.saving') : t(`form.create.${kind}`)}
          </button>
          <Link href={back} style={btn('outline')}>{t('form.cancel')}</Link>
        </div>
      </section>
    </div>
  )
}
