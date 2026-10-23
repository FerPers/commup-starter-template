'use client'

import { dailyTabHref } from '@/lib/navigation/hub-routes'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAskDialog } from '@/components/ui/AskDialog'
import { answerTq, deleteMgmtItem, transitionTq, updateTq } from '@/app/actions/daily'
import { daysOverdue, todayIso, type TqAddressee, type TqStatus } from '@/lib/daily/catalog'
import type { TagValue } from '../../../registers/RegisterFields'
import { Alert, Evidence, Field, OverdueChip, Timeline, btn, card, grid, input, small } from '../../daily-ui'
import { TqFields, type TqForm } from '../../forms'
import { EDITOR_ROLES, Header, LinkedList, Messages, useRunner, when, type CommonProps, type LinkedAction, type LinkedDecision, type TqItem } from './linked'

// TQ (F5, 7.51/20.33): draft → issued → answered → closed (+ reemitir si la respuesta no basta,
// cancelar). La respuesta la puede registrar también el rol client (la operadora).
export default function TqDetail({ project, opts, names, userId, role, events, attachments, item, tags, linked }: CommonProps & {
  item: TqItem
  tags: TagValue[]
  linked: { actions: LinkedAction[]; decisions: LinkedDecision[] }
}) {
  const t = useTranslations('Daily')
  const { run, isPending, error, saved, router } = useRunner()
  const { dialog, ask, confirm } = useAskDialog() // G-08: diálogo propio
  const today = useMemo(() => todayIso(), [])
  const status = item.status as TqStatus
  const who = (id: string | null) => (id ? names[id] : undefined) ?? t('someone')

  const [form, setForm] = useState<TqForm>({
    subject: item.subject, question: item.question, addressedTo: item.addressed_to as TqAddressee, addressedToName: item.addressed_to_name ?? '',
    disciplineId: item.discipline_id ?? '', systemId: item.system_id ?? '', requiredBy: item.required_by ?? '', tags,
  })
  const [comment, setComment] = useState('')
  const [response, setResponse] = useState('')
  const [respondedBy, setRespondedBy] = useState('')
  const [designChange, setDesignChange] = useState(false)
  const [mocRef, setMocRef] = useState('')

  const isClient = role === 'client'
  // N3b: el cliente gestiona los TQ que levantó (editar, emitir, reemitir, cerrar, borrar el borrador); cancelar, líder+.
  const manages = !isClient || item.raised_by === userId
  const editable = (status === 'draft' || status === 'issued') && manages
  const live = status === 'draft' || status === 'issued' || status === 'answered'
  const base = { projectId: project.id, tqId: item.id }

  function save() {
    run(() => updateTq({
      ...base, ...form, disciplineId: form.disciplineId || null, systemId: form.systemId || null, requiredBy: form.requiredBy || null,
      tagIds: form.tags.map(x => x.tag_id),
    }), undefined, true)
  }
  function go(to: TqStatus) { run(() => transitionTq({ ...base, to, comment }), () => setComment('')) }
  function answer() {
    run(() => answerTq({ ...base, response, respondedByName: respondedBy, designChange, mocRef }), () => setResponse(''))
  }
  async function cancel() {
    const r = await ask({ title: t('detail.cancel'), confirmLabel: t('detail.cancel'), danger: true, input: { label: t('detail.cancelPrompt'), minLength: 3, multiline: true } })
    if (!r?.trim()) return
    run(() => transitionTq({ ...base, to: 'cancelled', comment: r }))
  }
  async function remove() {
    if (!(await confirm({ message: t('detail.deleteConfirm'), confirmLabel: t('detail.delete'), danger: true }))) return
    run(() => deleteMgmtItem({ projectId: project.id, kind: 'tq', entityId: item.id }), () => router.push(dailyTabHref(project.id, 'tqs')))
  }
  const canDelete = status === 'draft' && attachments.length === 0 && (item.raised_by === userId || role === 'owner' || role === 'admin')

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {dialog}
      <Header projectId={project.id} kind="tq" number={item.number} title={item.subject} status={status}>
        {status === 'issued' && <OverdueChip days={daysOverdue(item.required_by, today)} />}
      </Header>
      <p style={{ ...small, margin: '-8px 0 0' }}>
        {t(`addressee.${item.addressed_to}`)}{item.addressed_to_name ? ` · ${item.addressed_to_name}` : ''}
        {item.required_by ? ` · ${t('field.requiredBy')}: ${item.required_by}` : ''}
      </p>
      <Messages error={error} saved={saved} />

      <section style={card} aria-labelledby="tq-question">
        <h2 id="tq-question" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 8px' }}>{t('field.question')}</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)', margin: 0, whiteSpace: 'pre-wrap' }}>{item.question}</p>
        <ul style={{ ...small, margin: '10px 0 0', paddingLeft: 18 }}>
          <li suppressHydrationWarning>{t('tq.raisedBy', { who: who(item.raised_by), when: when(item.created_at) })}</li>
          {item.issued_at && <li suppressHydrationWarning>{t('tq.issuedBy', { who: who(item.issued_by), when: when(item.issued_at) })}</li>}
        </ul>
      </section>

      {item.response && (
        <section style={card} aria-labelledby="tq-response">
          <h2 id="tq-response" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 8px' }}>{t('tq.response')}</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)', margin: 0, whiteSpace: 'pre-wrap' }}>{item.response}</p>
          <p style={{ ...small, margin: '8px 0 0' }} suppressHydrationWarning>
            {t('tq.respondedBy', { who: item.responded_by_name ?? who(item.responded_by), when: when(item.responded_at) })}
            {item.design_change && <> · <strong style={{ color: '#b45309' }}>{t('tq.designChange')}</strong>{item.moc_ref ? ` (${item.moc_ref})` : ''}</>}
          </p>
          {status === 'issued' && <p style={{ ...small, margin: '6px 0 0' }}>{t('tq.reissued')}</p>}
        </section>
      )}

      {/* Responder: cualquier miembro, también el cliente. */}
      {status === 'issued' && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="tq-answer">
          <h2 id="tq-answer" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('tq.answer')}</h2>
          <textarea rows={4} style={input} value={response} maxLength={8000} onChange={e => setResponse(e.target.value)} aria-label={t('tq.response')} />
          <div style={grid}>
            <Field text={t('tq.respondedByName')}>
              <input style={input} value={respondedBy} maxLength={200} placeholder={names[userId] ?? ''} onChange={e => setRespondedBy(e.target.value)} />
            </Field>
            <Field text={t('tq.mocRef')}>
              <input style={input} value={mocRef} maxLength={100} disabled={!designChange} onChange={e => setMocRef(e.target.value)} />
            </Field>
          </div>
          <label style={{ ...small, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={designChange} onChange={e => setDesignChange(e.target.checked)} /> {t('tq.designChangeQ')}
          </label>
          <div><button type="button" style={btn('primary', isPending || !response.trim())} disabled={isPending || !response.trim()} onClick={answer}>{t('tq.saveAnswer')}</button></div>
        </section>
      )}

      {manages && live && (
        <section style={card} aria-labelledby="tq-lifecycle">
          <h2 id="tq-lifecycle" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 8px' }}>{t('detail.lifecycle')}</h2>
          {status === 'answered' && <textarea rows={2} style={{ ...input, maxWidth: 640, marginBottom: 8 }} value={comment} onChange={e => setComment(e.target.value)} placeholder={t('tq.reissuePlaceholder')} />}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {status === 'draft' && <button type="button" style={btn('primary', isPending)} disabled={isPending} onClick={() => go('issued')}>{t('tq.issue')}</button>}
            {status === 'answered' && (
              <>
                <button type="button" style={btn('primary', isPending)} disabled={isPending} onClick={() => go('closed')}>{t('tq.close')}</button>
                <button type="button" style={btn('outline', isPending || comment.trim().length < 3)} disabled={isPending || comment.trim().length < 3} onClick={() => go('issued')}>{t('tq.reissue')}</button>
              </>
            )}
            {EDITOR_ROLES.includes(role) && <button type="button" style={btn('outline')} disabled={isPending} onClick={cancel}>{t('detail.cancel')}</button>}
            {canDelete && <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} disabled={isPending} onClick={remove}>{t('detail.delete')}</button>}
          </div>
        </section>
      )}
      {status === 'cancelled' && <Alert kind="warn">{t('action.cancelledBy', { who: who(item.cancelled_by), when: when(item.cancelled_at) })} — {item.cancel_reason}</Alert>}

      <LinkedList projectId={project.id} actions={linked.actions} decisions={linked.decisions} names={names}
        newActionHref={!isClient && status !== 'cancelled' ? `/projects/${project.id}/daily/new?kind=action&source=tq&sourceId=${item.id}` : undefined}
        newDecisionHref={!isClient && (status === 'answered' || status === 'closed') ? `/projects/${project.id}/daily/new?kind=decision&source=tq&sourceId=${item.id}` : undefined} />

      <Evidence projectId={project.id} kind="tq" entityId={item.id} attachments={attachments} names={names} canAdd={live} />

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={t('detail.data')}>
        {!editable && <div style={small}>{status === 'answered' ? t('tq.lockedAnswered') : t('detail.closed')}</div>}
        {status === 'issued' && <div style={small}>{t('tq.lockedQuestion')}</div>}
        <TqFields projectId={project.id} value={form} onChange={setForm} opts={opts} disabled={!editable} lockQuestion={status === 'issued'} />
        {editable && <div><button type="button" style={btn('outline', isPending)} disabled={isPending} onClick={save}>{t('form.save')}</button></div>}
      </section>

      <Timeline kind="tq" events={events} names={names} />
    </div>
  )
}
