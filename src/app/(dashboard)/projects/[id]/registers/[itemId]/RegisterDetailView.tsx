'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { deleteRegisterItem, linkRegisterItems, transitionRegisterItem, updateRegisterItem } from '@/app/actions/registers'
import {
  NEXT_STATUS,
  OPEN_STATUSES,
  missingFieldsFor,
  transitionBlockedReason,
  type RegisterKind,
  type RegisterStatus,
} from '@/lib/registers/catalog'
import { RegisterFields, TagPicker, type TagValue } from '../RegisterFields'
import { STATUS_STYLE, StatusChip, btn, card, input, label, linkStyle, small, useStatusLabel } from '../register-ui'

type Step = { by: string | null; at: string | null }

export type RegisterDetail = {
  id: string
  number: string
  kind: RegisterKind
  title: string
  description: string | null
  status: RegisterStatus
  data: Record<string, unknown>
  system_id: string | null
  blocksGate: string | null
  steps: Record<RegisterStatus, Step>
  cancel_reason: string | null
}

export type RegisterEvent = {
  id: string
  action: 'created' | 'updated' | 'transition'
  from_status: RegisterStatus | null
  to_status: RegisterStatus | null
  user_id: string | null
  comment: string | null
  created_at: string
}

export type LinkedRegister = {
  id: string
  number: string
  kind: RegisterKind
  title: string
  status: RegisterStatus
  /** out = este registro lo vinculó (pack → ciega); in = otro registro vinculó a este. */
  direction: 'out' | 'in'
}

type Props = {
  project: { id: string; code: string; name: string }
  item: RegisterDetail
  tags: TagValue[]
  events: RegisterEvent[]
  linked: LinkedRegister[]
  blindCandidates: Omit<LinkedRegister, 'direction'>[]
  systems: { id: string; code: string; name: string }[]
  names: Record<string, string>
  userId: string
  role: string
}

const LIFECYCLE: RegisterStatus[] = ['proposed', 'authorized', 'active', 'removed', 'verified']
const AUTHORIZERS = ['owner', 'admin', 'architect', 'leader']

export default function RegisterDetailView({ project, item, tags: initialTags, events, linked, blindCandidates, systems, names, userId, role }: Props) {
  const t = useTranslations('Registers')
  const statusLabel = useStatusLabel()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description ?? '')
  const [systemId, setSystemId] = useState(item.system_id ?? '')
  const [data, setData] = useState<Record<string, unknown>>(item.data)
  const [tags, setTags] = useState<TagValue[]>(initialTags)
  const [comment, setComment] = useState('')
  const [blindToLink, setBlindToLink] = useState('')

  const open = OPEN_STATUSES.includes(item.status)
  const editable = open && role !== 'client'
  const next = NEXT_STATUS[item.status]
  const missing = next ? missingFieldsFor(item.kind, next, data) : []
  const rejected = next ? transitionBlockedReason(item.kind, next, data) === 'test_rejected' : false
  const who = (id: string | null | undefined) => (id ? names[id] : undefined) ?? t('detail.someone')
  // Hora local del navegador; los elementos que la muestran llevan suppressHydrationWarning (SSR en UTC).
  const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '')

  // Las mismas reglas que la RPC, para avisar antes de intentar.
  let blockedBy: string | null = null
  if (next === 'authorized' && item.steps.proposed.by === userId) blockedBy = who(item.steps.proposed.by)
  if (next === 'verified' && item.steps.removed.by === userId) blockedBy = who(item.steps.removed.by)
  const roleAllows = next === 'authorized' ? AUTHORIZERS.includes(role) : role !== 'client'
  const neverAuthorized = !item.steps.authorized.at
  // §8.8: verificar un pack con ciegas aún instaladas (activas) solo avisa (la ciega bloquea su gate por sí misma).
  const openBlinds = linked.filter(l => l.kind === 'blind' && l.status === 'active')
  const canLink = role !== 'client' && item.kind === 'test_pack' && item.status !== 'cancelled'
  const advanceDisabled = isPending || missing.length > 0 || rejected || !!blockedBy || !roleAllows

  const base = { projectId: project.id, itemId: item.id }
  const payload = () => ({ ...base, title, description, systemId: systemId || null, data, tags: tags.map(({ tag_id, role: r }) => ({ tag_id, role: r })) })

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null); setSaved(false)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }

  function save() { run(() => updateRegisterItem(payload()), () => setSaved(true)) }

  // Lo que no viaja en la transición (título, descripción, sistema, tags) se guarda antes solo si cambió;
  // los campos del registro van en el mismo paso.
  const tagKey = (list: TagValue[]) => list.map(x => `${x.tag_id}:${x.role}`).sort().join(',')
  const headerDirty = title !== item.title || description !== (item.description ?? '') ||
    systemId !== (item.system_id ?? '') || tagKey(tags) !== tagKey(initialTags)

  function advance() {
    if (!next) return
    run(async () => {
      if (headerDirty) {
        const upd = await updateRegisterItem(payload())
        if (upd.error) return upd
      }
      return transitionRegisterItem({ ...base, to: next, comment, data })
    }, () => setComment(''))
  }

  function cancel() {
    const reason = window.prompt(t('detail.cancelPrompt'))
    if (!reason?.trim()) return
    run(() => transitionRegisterItem({ ...base, to: 'cancelled', comment: reason }))
  }

  function link(linkedItemId: string, on: boolean) {
    run(() => linkRegisterItems({ ...base, linkedItemId, link: on }), () => setBlindToLink(''))
  }

  function remove() {
    if (!window.confirm(t('detail.deleteConfirm'))) return
    run(() => deleteRegisterItem(base), () => router.push(`/projects/${project.id}/registers`))
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/projects/${project.id}/registers`} style={linkStyle}>← {t('detail.back')}</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: 0, fontFamily: 'ui-monospace, monospace' }}>{item.number}</h1>
          <StatusChip kind={item.kind} status={item.status} />
          <span style={{ ...small, fontWeight: 600 }}>{t(`kind.${item.kind}`)}</span>
        </div>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-strong)', margin: '6px 0 2px' }}>{item.title}</p>
        <p style={{ ...small, margin: 0 }}>
          {project.code} · {item.blocksGate ? t('detail.blocks', { gate: item.blocksGate }) : t('detail.noBlock')}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <a href={`/projects/${project.id}/registers/labels?ids=${item.id}`} target="_blank" rel="noopener" style={btn('outline')}>{t('detail.label')}</a>
          {item.kind === 'test_pack' && <Link href={`/projects/${project.id}/registers/test-packs`} style={btn('outline')}>{t('testPacks.title')}</Link>}
        </div>
      </div>

      {error && <div role="alert" style={{ padding: '10px 14px', background: 'var(--danger-50)', border: '1px solid #fecaca', borderRadius: 8, color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>{error}</div>}
      {saved && <div role="status" style={{ padding: '10px 14px', background: 'var(--success-50)', border: '1px solid #a7f3d0', borderRadius: 8, color: 'var(--success-700)', fontSize: 'var(--text-sm)' }}>{t('form.saved')}</div>}

      {/* Ciclo de vida */}
      <section style={card} aria-labelledby="reg-lifecycle">
        <h2 id="reg-lifecycle" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 12px' }}>{t('detail.lifecycle')}</h2>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          {LIFECYCLE.map(s => {
            const step = item.steps[s]
            const done = !!step.at
            const current = item.status === s
            const st = STATUS_STYLE[s]
            return (
              <li key={s} aria-current={current ? 'step' : undefined}
                style={{ padding: 10, borderRadius: 8, border: `1px solid ${done ? st.border : 'var(--border)'}`, background: done ? st.bg : 'transparent', opacity: done || current ? 1 : 0.6 }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: done ? st.fg : 'var(--text-muted)' }}>{done ? '✓ ' : ''}{statusLabel(item.kind, s)}</div>
                {done && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }} suppressHydrationWarning>{t('detail.by', { who: who(step.by), when: when(step.at) })}</div>}
              </li>
            )
          })}
        </ol>
        {item.status === 'cancelled' && (
          <p style={{ ...small, margin: '10px 0 0' }} suppressHydrationWarning>
            {statusLabel(item.kind, 'cancelled')}: {t('detail.by', { who: who(item.steps.cancelled.by), when: when(item.steps.cancelled.at) })} — {item.cancel_reason}
          </p>
        )}

        {next && editable && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rejected && <div role="alert" style={{ ...small, color: 'var(--danger-700)' }}>{t('detail.rejected')}</div>}
            {missing.length > 0 && (
              <div style={{ ...small, color: '#b45309' }}>{t('detail.missing', { fields: missing.map(f => t(`field.${f}`)).join(', ') })}</div>
            )}
            {next === 'verified' && item.kind === 'test_pack' && openBlinds.length > 0 && (
              <div role="status" style={{ ...small, color: '#b45309' }}>{t('detail.openBlinds', { list: openBlinds.map(b => b.number).join(', ') })}</div>
            )}
            {blockedBy && <div style={{ ...small, color: '#b45309' }}>{t('detail.otherPerson', { who: blockedBy })}</div>}
            <input style={{ ...input, maxWidth: 560 }} placeholder={t('detail.commentPlaceholder')} value={comment} onChange={e => setComment(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={btn('primary', advanceDisabled)} onClick={advance} disabled={advanceDisabled}>
                {t('detail.advance', { status: statusLabel(item.kind, next) })}
              </button>
              {AUTHORIZERS.includes(role) && <button type="button" style={btn('outline')} disabled={isPending} onClick={cancel}>{t('detail.cancel')}</button>}
              {neverAuthorized && (item.steps.proposed.by === userId || role === 'owner' || role === 'admin') && (
                <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} disabled={isPending} onClick={remove}>{t('detail.delete')}</button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Datos */}
      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={t('form.fields')}>
        {!open && <div style={small}>{t('detail.closed')}</div>}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>{t('form.title')}</span>
          <input style={input} value={title} maxLength={200} disabled={!editable} onChange={e => setTitle(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>{t('form.description')}</span>
          <textarea rows={2} style={input} value={description} maxLength={2000} disabled={!editable} onChange={e => setDescription(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 420 }}>
          <span style={label}>{t('form.system')}</span>
          <select style={input} value={systemId} disabled={!editable} onChange={e => setSystemId(e.target.value)}>
            <option value="">{t('form.noSystem')}</option>
            {systems.map(s => <option key={s.id} value={s.id}>{s.code}{s.name !== s.code ? ` — ${s.name}` : ''}</option>)}
          </select>
        </label>
        <div>
          <div style={{ ...label, marginBottom: 6 }}>{t('form.tags')}</div>
          <TagPicker projectId={project.id} kind={item.kind} value={tags} onChange={setTags} disabled={!editable} />
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ ...label, marginBottom: 10 }}>{t('form.fields')}</div>
          <RegisterFields kind={item.kind} value={data} onChange={setData} disabled={!editable} highlight={missing} />
        </div>
        {editable && <div><button type="button" style={btn('outline')} disabled={isPending || !title.trim()} onClick={save}>{t('form.save')}</button></div>}
      </section>

      {/* Registros vinculados (ej. ciegas de la prueba de un test pack) */}
      {(linked.length > 0 || canLink) && (
        <section style={card} aria-labelledby="reg-linked">
          <h2 id="reg-linked" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>
            {item.kind === 'test_pack' ? t('detail.linkedBlinds') : t('detail.linked')}
          </h2>
          {item.kind === 'test_pack' && <p style={{ ...small, margin: '0 0 10px' }}>{t('detail.linkedBlindsHelp')}</p>}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {linked.map(l => (
              <li key={`${l.direction}:${l.id}`} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
                <Link href={`/projects/${project.id}/registers/${l.id}`} style={{ fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }}>{l.number}</Link>
                <span style={small}>{t(`kind.${l.kind}`)}</span>
                <span style={{ color: 'var(--text-strong)' }}>{l.title}</span>
                <StatusChip kind={l.kind} status={l.status} />
                {canLink && l.direction === 'out' && (
                  <button type="button" style={{ ...btn('outline'), padding: '3px 8px', fontSize: 'var(--text-xs)' }} disabled={isPending} onClick={() => link(l.id, false)}>{t('detail.unlink')}</button>
                )}
              </li>
            ))}
            {linked.length === 0 && <li style={small}>{t('detail.noLinked')}</li>}
          </ul>
          {canLink && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              <select aria-label={t('detail.pickBlind')} style={{ ...input, maxWidth: 360 }} value={blindToLink} onChange={e => setBlindToLink(e.target.value)}>
                <option value="">{t('detail.pickBlind')}</option>
                {blindCandidates.map(b => <option key={b.id} value={b.id}>{b.number} — {b.title}</option>)}
              </select>
              <button type="button" style={btn('outline', !blindToLink || isPending)} disabled={!blindToLink || isPending} onClick={() => link(blindToLink, true)}>{t('detail.link')}</button>
              <Link href={`/projects/${project.id}/registers/new?kind=blind&linkTo=${item.id}`} style={btn('outline')}>+ {t('detail.newBlind')}</Link>
            </div>
          )}
        </section>
      )}

      {/* Línea de tiempo */}
      <section style={card} aria-labelledby="reg-timeline">
        <h2 id="reg-timeline" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 10px' }}>{t('detail.timeline')}</h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...events].reverse().map(e => (
            <li key={e.id} style={{ ...small, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ whiteSpace: 'nowrap' }} suppressHydrationWarning>{when(e.created_at)}</span>
              <strong style={{ color: 'var(--text-strong)' }}>
                {e.action === 'transition' && e.from_status && e.to_status
                  ? t('detail.event.transition', { from: statusLabel(item.kind, e.from_status), to: statusLabel(item.kind, e.to_status) })
                  : t(`detail.event.${e.action === 'transition' ? 'updated' : e.action}`)}
              </strong>
              <span>· {who(e.user_id)}</span>
              {e.comment && <span style={{ fontStyle: 'italic' }}>— {e.comment}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
