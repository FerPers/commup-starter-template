'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { deleteMgmtItem, transitionAction, updateAction } from '@/app/actions/daily'
import { actionNeedsEvidence, daysOverdue, todayIso, type ActionPriority, type ActionStatus, type VerificationMethod } from '@/lib/daily/catalog'
import { Evidence, OverdueChip, PriorityChip, Timeline, btn, card, input, small } from '../../daily-ui'
import { ActionFields, type ActionForm } from '../../forms'
import { EDITOR_ROLES, Header, Messages, useRunner, when, type ActionItem, type CommonProps } from './linked'

// Acción (F5): open → in_progress → done → verified (+ cancelled). «Hecha» exige nota de cierre y
// evidencia salvo método «revisión»; la verifica otra persona (o la rechaza con motivo → en curso).
export default function ActionDetail({ project, opts, names, userId, role, events, attachments, item, origin }: CommonProps & {
  item: ActionItem
  origin: { label: string; href: string | null } | null
}) {
  const t = useTranslations('Daily')
  const { run, isPending, error, saved, router } = useRunner()
  const today = useMemo(() => todayIso(), [])
  const status = item.status as ActionStatus
  const method = item.verification_method as VerificationMethod
  const who = (id: string | null) => (id ? names[id] : undefined) ?? t('someone')

  const [form, setForm] = useState<ActionForm>({
    title: item.title, description: item.description ?? '', ownerId: item.owner_id ?? '', systemId: item.system_id ?? '',
    dueDate: item.due_date ?? '', priority: item.priority as ActionPriority, verificationMethod: method, sourceRef: item.source_ref ?? '',
  })
  const [comment, setComment] = useState('')

  const isClient = role === 'client'
  const live = status === 'open' || status === 'in_progress' || status === 'done'
  const editable = live && !isClient
  const needsEvidence = actionNeedsEvidence(method) && attachments.length === 0
  const base = { projectId: project.id, actionId: item.id }

  function save() {
    run(() => updateAction({ ...base, ...form, systemId: form.systemId || null, dueDate: form.dueDate || null }), undefined, true)
  }
  function go(to: ActionStatus, needComment = false) {
    if (needComment && comment.trim().length < 3) return
    run(() => transitionAction({ ...base, to, comment }), () => setComment(''))
  }
  function cancel() {
    const reason = window.prompt(t('detail.cancelPrompt'))
    if (!reason?.trim()) return
    run(() => transitionAction({ ...base, to: 'cancelled', comment: reason }))
  }
  function remove() {
    if (!window.confirm(t('detail.deleteConfirm'))) return
    run(() => deleteMgmtItem({ projectId: project.id, kind: 'action', entityId: item.id }), () => router.push(`/projects/${project.id}/daily`))
  }

  const sameCloser = status === 'done' && item.done_by === userId
  const canDelete = status === 'open' && item.source_kind !== 'pssr' && attachments.length === 0 &&
    (item.created_by === userId || role === 'owner' || role === 'admin')

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Header projectId={project.id} kind="action" number={item.number} title={item.title} status={status} tab="actions">
        <PriorityChip priority={item.priority} />
        {(status === 'open' || status === 'in_progress') && <OverdueChip days={daysOverdue(item.due_date, today)} />}
      </Header>
      <p style={{ ...small, margin: '-8px 0 0' }}>
        {t(`source.${item.source_kind}`)}{item.source_ref ? ` · ${item.source_ref}` : ''}
        {origin && <> · {origin.href ? <Link href={origin.href} style={{ color: 'var(--primary-600, #2563eb)' }}>{origin.label}</Link> : origin.label}</>}
      </p>

      <Messages error={error} saved={saved} />

      {/* Ciclo de vida */}
      <section style={card} aria-labelledby="action-lifecycle">
        <h2 id="action-lifecycle" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 8px' }}>{t('detail.lifecycle')}</h2>
        <ul style={{ ...small, margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>{t('action.owner', { who: who(item.owner_id) })} · {t('action.method', { method: t(`method.${method}`) })}</li>
          {item.done_at && <li suppressHydrationWarning>{t('action.doneBy', { who: who(item.done_by), when: when(item.done_at) })} — <em>{item.closure_note}</em></li>}
          {item.verified_at && <li suppressHydrationWarning>{t('action.verifiedBy', { who: who(item.verified_by), when: when(item.verified_at) })}{item.verify_comment ? <> — <em>{item.verify_comment}</em></> : null}</li>}
          {item.cancelled_at && <li suppressHydrationWarning>{t('action.cancelledBy', { who: who(item.cancelled_by), when: when(item.cancelled_at) })} — <em>{item.cancel_reason}</em></li>}
        </ul>

        {editable && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(status === 'open' || status === 'in_progress') && needsEvidence && <div style={{ ...small, color: '#b45309' }}>{t('action.needsEvidence')}</div>}
            {sameCloser && <div style={{ ...small, color: '#b45309' }}>{t('action.otherPerson')}</div>}
            <textarea rows={2} style={{ ...input, maxWidth: 640 }} value={comment} onChange={e => setComment(e.target.value)}
              placeholder={status === 'done' ? t('action.verifyPlaceholder') : t('action.closePlaceholder')} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {status === 'open' && <button type="button" style={btn('outline', isPending)} disabled={isPending} onClick={() => go('in_progress')}>{t('action.start')}</button>}
              {(status === 'open' || status === 'in_progress') && (
                <button type="button" style={btn('primary', isPending || needsEvidence || comment.trim().length < 3)}
                  disabled={isPending || needsEvidence || comment.trim().length < 3} onClick={() => go('done', true)}>{t('action.markDone')}</button>
              )}
              {status === 'done' && (
                <>
                  <button type="button" style={btn('primary', isPending || sameCloser)} disabled={isPending || sameCloser} onClick={() => go('verified')}>{t('action.verify')}</button>
                  <button type="button" style={btn('outline', isPending || sameCloser || comment.trim().length < 3)}
                    disabled={isPending || sameCloser || comment.trim().length < 3} onClick={() => go('in_progress', true)}>{t('action.reject')}</button>
                </>
              )}
              {EDITOR_ROLES.includes(role) && <button type="button" style={btn('outline')} disabled={isPending} onClick={cancel}>{t('detail.cancel')}</button>}
              {canDelete && <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} disabled={isPending} onClick={remove}>{t('detail.delete')}</button>}
            </div>
          </div>
        )}
      </section>

      <Evidence projectId={project.id} kind="action" entityId={item.id} attachments={attachments} names={names}
        canAdd={live && !isClient} required={actionNeedsEvidence(method)} />

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={t('detail.data')}>
        {!live && <div style={small}>{t('detail.closed')}</div>}
        <ActionFields value={form} onChange={setForm} opts={opts} disabled={!editable} showSourceRef={!item.source_id} />
        {editable && <div><button type="button" style={btn('outline', isPending || !form.title.trim())} disabled={isPending || !form.title.trim()} onClick={save}>{t('form.save')}</button></div>}
      </section>

      <Timeline kind="action" events={events} names={names} />
    </div>
  )
}
