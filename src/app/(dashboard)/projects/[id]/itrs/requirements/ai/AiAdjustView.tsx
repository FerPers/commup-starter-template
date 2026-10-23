'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { decideItrAdjust, runItrAdjustBatch } from '@/app/actions/itr-ai-adjust'
import type { AiProposal, AiSignature, AiSignaturePage } from '@/lib/itr/ai-adjust'

const MAX_ROUNDS = 40
const btn: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const outline: React.CSSProperties = { ...btn, background: 'var(--card-bg)', color: 'var(--text-strong)', border: '1px solid var(--border)' }
const primary: React.CSSProperties = { ...btn, background: 'var(--primary-600)', color: '#ffffff', border: '1px solid var(--primary-600)' }
const chip: React.CSSProperties = { padding: '2px 7px', borderRadius: 5, fontSize: 12, fontWeight: 600, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }

export default function AiAdjustView({ projectId, page, toReview, estimateUsd, canRun, canDecide, filters, pager }: {
  projectId: string
  page: AiSignaturePage
  toReview: number
  estimateUsd: number
  canRun: boolean
  canDecide: boolean
  filters: { key: 'open' | 'pending' | 'all'; href: string; active: boolean; count: number }[]
  pager: { page: number; pages: number; prev: string | null; next: string | null }
}) {
  const t = useTranslations('ItrAiAdjust')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ reviewed: number; proposals: number; cost: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stopRef = useRef(false)

  async function run() {
    setError(null); setRunning(true); stopRef.current = false
    let reviewed = 0, proposals = 0, cost = 0
    setProgress({ reviewed, proposals, cost })
    for (let i = 0; i < MAX_ROUNDS && !stopRef.current; i++) {
      const res = await runItrAdjustBatch({ projectId })
      if (res.error) { setError(res.error); break }
      reviewed += res.reviewed ?? 0; proposals += res.proposals ?? 0; cost += res.costUsd ?? 0
      setProgress({ reviewed, proposals, cost })
      if (!res.remaining) break
    }
    setRunning(false)
    router.refresh()
  }

  const decide = (ids: string[], decision: 'accept' | 'reject') => new Promise<string | null>(resolve => {
    startTransition(async () => {
      const res = await decideItrAdjust({ projectId, proposalIds: ids, decision })
      if (res.error) { resolve(t.has(`error.${res.error}`) ? t(`error.${res.error as 'already_decided'}`) : res.error); return }
      resolve(null)
      router.refresh()
    })
  })

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 'var(--text-sm)' }}>
        <strong>{t('summary.groups', { count: page.groups_total, tags: page.tags_total })}</strong>
        <span style={{ color: 'var(--text-muted)' }}>{t('summary.detail', { reviewed: page.reviewed, pending: page.pending, stale: page.stale, open: page.open_proposals })}</span>
        <span style={{ flex: 1 }} />
        {canRun && toReview > 0 && !running && (
          <button type="button" onClick={run} disabled={isPending} style={primary} title={t('run.hint')}>
            {t('run.start', { count: toReview, cost: estimateUsd < 0.01 ? '< 0,01' : estimateUsd.toFixed(2) })}
          </button>
        )}
        {running && (
          <>
            <span role="status" style={{ fontWeight: 600 }}>{t('run.progress', { reviewed: progress?.reviewed ?? 0, total: toReview })}</span>
            <button type="button" onClick={() => { stopRef.current = true }} style={outline}>{t('run.pause')}</button>
          </>
        )}
      </div>
      {!running && progress && <p role="status" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--success-800)' }}>{t('run.done', { reviewed: progress.reviewed, proposals: progress.proposals, cost: progress.cost.toFixed(3) })}</p>}
      {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--danger-700)' }}>{error}</p>}
      {!canDecide && <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('readOnly')}</p>}

      <nav aria-label={t('filtersLabel')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {filters.map(f => (
          <Link key={f.key} href={f.href} aria-current={f.active ? 'true' : undefined} style={{
            minHeight: 36, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRadius: 999, fontSize: 'var(--text-sm)', fontWeight: 600, textDecoration: 'none',
            border: `1px solid ${f.active ? 'var(--text-strong)' : 'var(--border)'}`, background: f.active ? 'var(--text-strong)' : 'var(--card-bg)', color: f.active ? 'var(--card-bg)' : 'var(--text-strong)',
          }}>{t(`filter.${f.key}`)}<span style={{ fontWeight: 500, opacity: 0.8 }}>{f.count}</span></Link>
        ))}
      </nav>

      {page.groups.length === 0 ? (
        <p style={{ margin: 0, padding: '24px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          {page.groups_total === 0 ? t('emptyAll') : t('empty')}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {page.groups.map(g => <SignatureCard key={`${g.equipment_type_id}|${g.prefix}|${g.discipline_id}|${g.desc_norm}`} g={g} canDecide={canDecide} busy={isPending || running} onDecide={decide} />)}
        </div>
      )}

      {pager.pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', fontSize: 'var(--text-sm)' }}>
          {pager.prev && <Link href={pager.prev} style={{ ...outline, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>‹ {t('prev')}</Link>}
          <span style={{ color: 'var(--text-muted)' }}>{t('pageOf', { page: pager.page, pages: pager.pages })}</span>
          {pager.next && <Link href={pager.next} style={{ ...outline, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>{t('next')} ›</Link>}
        </div>
      )}
    </>
  )
}

function SignatureCard({ g, canDecide, busy, onDecide }: {
  g: AiSignature
  canDecide: boolean
  busy: boolean
  onDecide: (ids: string[], decision: 'accept' | 'reject') => Promise<string | null>
}) {
  const t = useTranslations('ItrAiAdjust')
  const [err, setErr] = useState<string | null>(null)
  const open = g.proposals.filter(p => p.status === 'proposed')
  const decide = async (ids: string[], d: 'accept' | 'reject') => { setErr(null); setErr(await onDecide(ids, d)) }
  const stateStyle: React.CSSProperties = g.review_state === 'reviewed'
    ? { background: 'var(--success-50)', color: 'var(--success-800)', border: '1px solid var(--success-200)' }
    : g.review_state === 'stale'
      ? { background: 'var(--warning-50)', color: 'var(--warning-800)', border: '1px solid var(--warning-200)' }
      : { border: '1.5px dashed var(--gray-400)', color: 'var(--text-muted)' }

  return (
    <article style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15, color: 'var(--text-strong)' }}>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{g.type_code}</span> · {g.prefix || '—'} · «{(g.description ?? '').trim() || t('noDescription')}»
        </strong>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.discipline_name ?? '—'} · {t('tags', { count: g.n })}</span>
        <span style={{ flex: 1 }} />
        <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, ...stateStyle }}>{t(`state.${g.review_state}`)}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={g.samples.join(', ')}>
        {g.samples.join(', ')}{g.n > g.samples.length ? ' …' : ''}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('base')}</span>
        {g.base.map(c => <span key={c} style={{ ...chip, background: 'var(--gray-100)', color: 'var(--text-strong)' }}>{c}</span>)}
      </div>

      {g.review_state === 'reviewed' && g.proposals.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{t('noAdjusts')}</p>
      )}
      {g.proposals.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {g.proposals.map(p => <ProposalRow key={p.id} p={p} n={g.n} canDecide={canDecide} busy={busy} onDecide={d => decide([p.id], d)} />)}
        </ul>
      )}
      {canDecide && open.length > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" disabled={busy} onClick={() => decide(open.map(p => p.id), 'reject')} style={outline}>{t('rejectAll', { count: open.length })}</button>
          <button type="button" disabled={busy} onClick={() => decide(open.map(p => p.id), 'accept')} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{t('acceptAll', { count: open.length })}</button>
        </div>
      )}
      {err && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--danger-700)' }}>{err}</p>}
    </article>
  )
}

function ProposalRow({ p, n, canDecide, busy, onDecide }: { p: AiProposal; n: number; canDecide: boolean; busy: boolean; onDecide: (d: 'accept' | 'reject') => void }) {
  const t = useTranslations('ItrAiAdjust')
  const add = p.action === 'add'
  return (
    <li style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: 'var(--gray-50)', opacity: p.status === 'proposed' ? 1 : 0.75 }}>
      <span style={{ ...chip, background: add ? 'var(--success-50)' : 'var(--danger-50)', color: add ? 'var(--success-800)' : 'var(--danger-700)', border: `1px solid ${add ? 'var(--success-200)' : 'var(--danger-200)'}` }}>
        {add ? '+' : '−'} {p.code}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--violet-700)' }}>{t(add ? 'add' : 'exclude')} · {t('confidence', { value: (p.confidence ?? 0).toFixed(2) })}</span>
      <span style={{ flex: '1 1 260px', fontSize: 13, color: 'var(--text-strong)' }}>{p.reason}</span>
      {p.status === 'proposed' ? (
        canDecide && (
          <span style={{ display: 'flex', gap: 6 }}>
            <button type="button" disabled={busy} onClick={() => onDecide('reject')} style={{ ...outline, minHeight: 36 }}>{t('reject')}</button>
            <button type="button" disabled={busy} onClick={() => onDecide('accept')} style={{ ...primary, minHeight: 36, opacity: busy ? 0.6 : 1 }}>{t('accept', { count: n })}</button>
          </span>
        )
      ) : (
        <span style={{ fontSize: 12, fontWeight: 600, color: p.status === 'accepted' ? 'var(--success-800)' : 'var(--text-muted)' }}>
          {p.status === 'accepted' ? t('accepted', { applied: p.applied_tags ?? 0, skipped: p.skipped_tags ?? 0 }) : t('rejected')}
        </span>
      )}
    </li>
  )
}
