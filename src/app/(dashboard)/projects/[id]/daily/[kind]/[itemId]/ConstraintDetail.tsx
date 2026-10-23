'use client'

import { dailyTabHref } from '@/lib/navigation/hub-routes'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAskDialog } from '@/components/ui/AskDialog'
import { deleteMgmtItem, escalateConstraint, transitionConstraint, updateConstraint } from '@/app/actions/daily'
import { ACTION_LIVE, BLOCKING_LEVEL, ESCALATION_LEVELS, daysOverdue, todayIso, type ActionStatus, type ConstraintStatus, type ImpactKind } from '@/lib/daily/catalog'
import { Alert, Evidence, LevelChip, OverdueChip, Timeline, btn, card, input, small } from '../../daily-ui'
import { ConstraintFields, type ConstraintForm } from '../../forms'
import { EDITOR_ROLES, Header, LinkedList, Messages, useRunner, when, type CommonProps, type ConstraintItem, type LinkedAction, type LinkedDecision } from './linked'

// Restricción (F5, 7.27/7.50): open → resolved → closed (+ reabrir, cancelar). Escalamiento 1–4 manual
// con motivo. En su gate deja «listo con condiciones»; abierta en nivel 4, lo bloquea.
export default function ConstraintDetail({ project, opts, names, userId, role, events, attachments, item, linked }: CommonProps & {
  item: ConstraintItem
  linked: { actions: LinkedAction[]; decisions: LinkedDecision[] }
}) {
  const t = useTranslations('Daily')
  const { run, isPending, error, saved, router } = useRunner()
  const { dialog, ask, confirm } = useAskDialog() // G-08: diálogo propio
  const today = useMemo(() => todayIso(), [])
  const status = item.status as ConstraintStatus
  const who = (id: string | null) => (id ? names[id] : undefined) ?? t('someone')
  const gate = opts.gates.find(g => g.id === item.gate_id)

  const [form, setForm] = useState<ConstraintForm>({
    title: item.title, description: item.description, systemId: item.system_id, gateId: item.gate_id ?? '', ownerId: item.owner_id ?? '',
    needDate: item.need_date, impactKind: item.impact_kind as ImpactKind, impact: item.impact ?? '', recoveryPlan: item.recovery_plan ?? '',
  })
  const [comment, setComment] = useState('')
  const [newLevel, setNewLevel] = useState<number>(Math.min(item.escalation_level + 1, 4))
  const [reason, setReason] = useState('')

  const isClient = role === 'client'
  const live = status === 'open' || status === 'resolved'
  const editable = live && !isClient
  const openActions = linked.actions.filter(a => ACTION_LIVE.includes(a.status as ActionStatus))
  const base = { projectId: project.id, constraintId: item.id }
  const overdue = status === 'open' ? daysOverdue(item.need_date, today) : 0

  async function save() {
    // S11 (D-14): sacar una restricción abierta de su gate o sistema (líder+) o cambiar la fecha requerida pide motivo.
    let reason: string | undefined
    const moved = status === 'open' && ((form.gateId || null) !== (item.gate_id ?? null) || form.systemId !== item.system_id)
    if (moved || form.needDate !== item.need_date) {
      const r = await ask({ title: t('form.save'), confirmLabel: t('form.save'), input: { label: t(moved ? 'detail.movePrompt' : 'detail.needDatePrompt'), minLength: 3, multiline: true } })
      if (r === null) return
      reason = r
    }
    run(() => updateConstraint({ ...base, ...form, gateId: form.gateId || null, reason }), undefined, true)
  }
  function go(to: ConstraintStatus) {
    run(() => transitionConstraint({ ...base, to, comment }), () => setComment(''))
  }
  function escalate() {
    run(() => escalateConstraint({ ...base, level: newLevel, reason }), () => setReason(''))
  }
  async function cancel() {
    const r = await ask({ title: t('detail.cancel'), confirmLabel: t('detail.cancel'), danger: true, input: { label: t('detail.cancelPrompt'), minLength: 3, multiline: true } })
    if (!r?.trim()) return
    run(() => transitionConstraint({ ...base, to: 'cancelled', comment: r }))
  }
  async function remove() {
    if (!(await confirm({ message: t('detail.deleteConfirm'), confirmLabel: t('detail.delete'), danger: true }))) return
    run(() => deleteMgmtItem({ projectId: project.id, kind: 'constraint', entityId: item.id }), () => router.push(dailyTabHref(project.id, 'constraints')))
  }
  const canDelete = status === 'open' && item.escalation_level === 1 && linked.actions.length === 0 && linked.decisions.length === 0 &&
    attachments.length === 0 && (item.created_by === userId || role === 'owner' || role === 'admin')
  const commentOk = comment.trim().length >= 3

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {dialog}
      <Header projectId={project.id} kind="constraint" number={item.number} title={item.title} status={status}>
        <LevelChip level={item.escalation_level} />
        <OverdueChip days={overdue} />
      </Header>
      <p style={{ ...small, margin: '-8px 0 0' }}>
        {t(`level.${item.escalation_level}`)} · {gate ? t('constraint.gate', { gate: gate.code }) : t('constraint.noGate')}
      </p>

      {status === 'open' && gate && (
        <Alert kind={item.escalation_level >= BLOCKING_LEVEL ? 'error' : 'warn'}>
          {item.escalation_level >= BLOCKING_LEVEL ? t('constraint.blocksGate', { gate: gate.code }) : t('constraint.conditionsGate', { gate: gate.code })}
        </Alert>
      )}
      {overdue > 0 && <Alert kind="warn">{t('constraint.overdueHint', { n: overdue })}</Alert>}
      <Messages error={error} saved={saved} />

      <section style={card} aria-labelledby="constraint-lifecycle">
        <h2 id="constraint-lifecycle" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 8px' }}>{t('detail.lifecycle')}</h2>
        <ul style={{ ...small, margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>{t('action.owner', { who: who(item.owner_id) })} · {t('field.needDate')}: {item.need_date}</li>
          {item.resolved_at && <li suppressHydrationWarning>{t('constraint.resolvedBy', { who: who(item.resolved_by), when: when(item.resolved_at) })} — <em>{item.resolution_note}</em></li>}
          {item.closed_at && <li suppressHydrationWarning>{t('constraint.closedBy', { who: who(item.closed_by), when: when(item.closed_at) })}</li>}
          {item.cancelled_at && <li suppressHydrationWarning>{t('action.cancelledBy', { who: who(item.cancelled_by), when: when(item.cancelled_at) })} — <em>{item.cancel_reason}</em></li>}
        </ul>

        {editable && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {status === 'resolved' && openActions.length > 0 && (
              <div style={{ ...small, color: '#b45309' }}>{t('constraint.openActions', { list: openActions.map(a => a.number).join(', ') })}</div>
            )}
            <textarea rows={2} style={{ ...input, maxWidth: 640 }} value={comment} onChange={e => setComment(e.target.value)}
              placeholder={status === 'open' ? t('constraint.resolvePlaceholder') : t('constraint.reopenPlaceholder')} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {status === 'open' && <button type="button" style={btn('primary', isPending || !commentOk)} disabled={isPending || !commentOk} onClick={() => go('resolved')}>{t('constraint.resolve')}</button>}
              {status === 'resolved' && (
                <>
                  <button type="button" style={btn('primary', isPending || openActions.length > 0)} disabled={isPending || openActions.length > 0} onClick={() => go('closed')}>{t('constraint.close')}</button>
                  <button type="button" style={btn('outline', isPending || !commentOk)} disabled={isPending || !commentOk} onClick={() => go('open')}>{t('constraint.reopen')}</button>
                </>
              )}
              {EDITOR_ROLES.includes(role) && <button type="button" style={btn('outline')} disabled={isPending} onClick={cancel}>{t('detail.cancel')}</button>}
              {canDelete && <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} disabled={isPending} onClick={remove}>{t('detail.delete')}</button>}
            </div>
          </div>
        )}
      </section>

      {status === 'open' && !isClient && (
        <section style={card} aria-labelledby="constraint-escalation">
          <h2 id="constraint-escalation" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('constraint.escalation')}</h2>
          <p style={{ ...small, margin: '0 0 10px' }}>{t('constraint.escalationHelp')}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select aria-label={t('field.level')} style={{ ...input, width: 300 }} value={newLevel} onChange={e => setNewLevel(Number(e.target.value))}>
              {ESCALATION_LEVELS.filter(l => l !== item.escalation_level).map(l => <option key={l} value={l}>{t('levelShort', { n: l })} — {t(`level.${l}`)}</option>)}
            </select>
            <input aria-label={t('constraint.reason')} placeholder={t('constraint.reason')} style={{ ...input, maxWidth: 360 }} value={reason} onChange={e => setReason(e.target.value)} />
            <button type="button" style={btn('primary', isPending || reason.trim().length < 3)} disabled={isPending || reason.trim().length < 3} onClick={escalate}>
              {newLevel > item.escalation_level ? t('constraint.escalate') : t('constraint.deescalate')}
            </button>
          </div>
        </section>
      )}

      <LinkedList projectId={project.id} actions={linked.actions} decisions={linked.decisions} names={names}
        newActionHref={editable ? `/projects/${project.id}/daily/new?kind=action&source=constraint&sourceId=${item.id}` : undefined}
        newDecisionHref={!isClient ? `/projects/${project.id}/daily/new?kind=decision&source=constraint&sourceId=${item.id}` : undefined} />

      <Evidence projectId={project.id} kind="constraint" entityId={item.id} attachments={attachments} names={names} canAdd={live && !isClient} />

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={t('detail.data')}>
        {!live && <div style={small}>{t('detail.closed')}</div>}
        <ConstraintFields value={form} onChange={setForm} opts={opts} disabled={!editable} />
        {editable && <div><button type="button" style={btn('outline', isPending)} disabled={isPending} onClick={save}>{t('form.save')}</button></div>}
      </section>

      <Timeline kind="constraint" events={events} names={names} />
    </div>
  )
}
