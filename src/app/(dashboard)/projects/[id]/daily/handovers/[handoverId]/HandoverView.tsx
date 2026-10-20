'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { formatInZone } from '@/lib/time/zone'
import { acceptShiftHandover, deleteShiftHandoverDraft, handOverShift, updateShiftHandover } from '@/app/actions/daily-report'
import type { HandoverSnapshot } from '@/lib/pdf/daily-report'
import { Alert, Chip, btn, card, input, label, small } from '../../daily-ui'

type Handover = {
  id: string; number: string; date: string; label: 'day' | 'night' | 'other'; status: 'draft' | 'handed_over' | 'accepted'
  snapshot: HandoverSnapshot; snapshotAt: string; pending: string; safety: string
  openedBy: string | null; handedBy: string | null; handedAt: string | null
  receivedBy: string | null; receivedAt: string | null; receiverComment: string | null; hash: string | null
}

const TONE = { draft: 'amber', handed_over: 'blue', accepted: 'green' } as const
const KIND_TONE: Record<string, 'red' | 'amber' | 'violet' | 'blue' | 'muted'> = {
  bypass: 'red', blind: 'amber', temporary: 'violet', energization: 'red', reinstatement: 'blue', test_pack: 'muted',
}

export default function HandoverView({ project, handover: h, isOpener, canReceive }: {
  project: { id: string; code: string; name: string; timezone: string }; handover: Handover; isOpener: boolean; canReceive: boolean
}) {
  const t = useTranslations('Daily')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(h.pending)
  const [safety, setSafety] = useState(h.safety)
  const [comment, setComment] = useState('')
  const editable = h.status === 'draft' && isOpener
  const dirty = pending !== h.pending || safety !== h.safety
  const base = { projectId: project.id, handoverId: h.id }
  const s = h.snapshot
  const locale = useLocale()
  const when = (iso: string | null) => (iso ? formatInZone(iso, project.timezone, locale) : '')  // S10: zona del proyecto

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }
  const save = () => run(() => updateShiftHandover({ ...base, pending, safety }))
  function handOver() {
    if (!window.confirm(t('handover.handOverConfirm'))) return
    run(async () => {
      if (dirty) {
        const r = await updateShiftHandover({ ...base, pending, safety })
        if (r.error) return r
      }
      return handOverShift(base)
    })
  }
  const accept = () => run(() => acceptShiftHandover({ ...base, comment }))
  function remove() {
    if (!window.confirm(t('detail.deleteConfirm'))) return
    run(() => deleteShiftHandoverDraft(base), () => router.push(`/projects/${project.id}/daily/handovers`))
  }

  const href = {
    register: (id: string) => `/projects/${project.id}/registers/${id}`,
    constraint: (id: string) => `/projects/${project.id}/daily/constraint/${id}`,
    action: (id: string) => `/projects/${project.id}/daily/action/${id}`,
  }
  const linkSt: React.CSSProperties = { fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }
  const box = (title: string, count: number, children: React.ReactNode) => (
    <section style={card}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 8px' }}>{title} ({count})</h2>
      {count === 0 ? <p style={{ ...small, margin: 0 }}>{t('report.list.none')}</p> : children}
    </section>
  )
  const ul: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)' }

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/projects/${project.id}/daily/handovers`} style={{ fontSize: 'var(--text-sm)', color: 'var(--primary-600, #2563eb)', textDecoration: 'none', fontWeight: 500 }}>← {t('tab.handovers')}</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', margin: 0, fontFamily: 'ui-monospace, monospace' }}>{h.number}</h1>
          <Chip tone={TONE[h.status]}>{t(`handover.status.${h.status}`)}</Chip>
          <Chip tone="muted">{h.date} · {t(`handover.label.${h.label}`)}</Chip>
        </div>
        <p style={{ ...small, margin: '6px 0 0' }}>
          {t('handover.snapshotAt', { when: when(h.snapshotAt) })}
          {h.status === 'draft' && <> · {t('handover.snapshotRefresh')}</>}
        </p>
        {h.hash && <p style={{ ...small, fontSize: 'var(--text-xs)', margin: '4px 0 0', fontFamily: 'ui-monospace, monospace' }}>sha256 {h.hash}</p>}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>{t('handover.safety')}</span>
          <textarea rows={3} style={input} value={safety} disabled={!editable} maxLength={8000} placeholder={editable ? t('handover.safetyHint') : ''} onChange={e => setSafety(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>{t('handover.pending')}</span>
          <textarea rows={4} style={input} value={pending} disabled={!editable} maxLength={8000} placeholder={editable ? t('handover.pendingHint') : ''} onChange={e => setPending(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {editable && <button type="button" style={btn('outline', isPending || !dirty)} disabled={isPending || !dirty} onClick={save}>{t('form.save')}</button>}
          {editable && <button type="button" style={btn('primary', isPending)} disabled={isPending} onClick={handOver}>{t('handover.handOver')}</button>}
          {editable && <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} disabled={isPending} onClick={remove}>{t('detail.delete')}</button>}
          <a href={`/projects/${project.id}/daily/handovers/${h.id}/pdf`} target="_blank" rel="noopener" style={btn('outline')}>PDF</a>
        </div>
        {h.status === 'draft' && !isOpener && <p style={{ ...small, margin: 0 }}>{t('handover.onlyOpener', { who: h.openedBy ?? '—' })}</p>}
      </section>

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }} aria-label={t('handover.signatures')}>
        <div style={label}>{t('handover.signatures')}</div>
        <p style={{ ...small, margin: 0 }}>
          {t('handover.handedBy')}: <strong style={{ color: 'var(--text-strong)' }}>{h.handedBy ?? '—'}</strong> {when(h.handedAt)}
        </p>
        <p style={{ ...small, margin: 0 }}>
          {t('handover.receivedBy')}: <strong style={{ color: 'var(--text-strong)' }}>{h.receivedBy ?? '—'}</strong> {when(h.receivedAt)}
          {h.receiverComment && <em> — {h.receiverComment}</em>}
        </p>
        {canReceive && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <input style={{ ...input, maxWidth: 480 }} placeholder={t('handover.commentHint')} value={comment} onChange={e => setComment(e.target.value)} />
            <button type="button" style={btn('primary', isPending)} disabled={isPending} onClick={accept}>{t('handover.accept')}</button>
          </div>
        )}
        {h.status === 'handed_over' && !canReceive && <p style={{ ...small, margin: 0 }}>{t('handover.waiting')}</p>}
      </section>

      {box(t('handover.registers'), s.registers.length, (
        <ul style={ul}>
          {s.registers.map(r => (
            <li key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href={href.register(r.id)} style={linkSt}>{r.number}</Link>
              <Chip tone={KIND_TONE[r.kind] ?? 'muted'}>{r.kind}</Chip>
              <span>{r.title}</span>
              {r.system && <span style={small}>[{r.system}]</span>}
              <span style={small}>· {r.status}</span>
            </li>
          ))}
        </ul>
      ))}
      {box(t('handover.punchesA'), s.punches_a.length, (
        <ul style={ul}>{s.punches_a.map(p => <li key={p.id}><strong>{p.number}</strong> {p.description}{p.tag ? ` · ${p.tag}` : ''}</li>)}</ul>
      ))}
      {box(t('handover.constraints'), s.constraints.length, (
        <ul style={ul}>
          {s.constraints.map(c => (
            <li key={c.id}>
              <Link href={href.constraint(c.id)} style={linkSt}>{c.number}</Link>
              {' '}N{c.level} · {c.title} <span style={small}>[{c.system}] · {c.need_date}</span>
            </li>
          ))}
        </ul>
      ))}
      {box(t('handover.actionsOverdue'), s.actions_overdue.length, (
        <ul style={ul}>
          {s.actions_overdue.map(a => (
            <li key={a.id}>
              <Link href={href.action(a.id)} style={linkSt}>{a.number}</Link>
              {' '}{a.title} <span style={small}>· {a.due_date}</span>
            </li>
          ))}
        </ul>
      ))}
      {box(t('handover.itrs'), s.itrs_in_progress_total, (
        <ul style={ul}>{s.itrs_in_progress.map(i => <li key={i.id}><strong>{i.number}</strong>{i.tag ? ` · ${i.tag}` : ''} <span style={small}>· {Math.round(Number(i.progress))} %</span></li>)}</ul>
      ))}
    </div>
  )
}
