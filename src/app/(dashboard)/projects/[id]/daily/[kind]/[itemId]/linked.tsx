'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Tables } from '@/types/supabase.generated'
import { Alert, StatusChip, btn, card, small, type Attachment, type Member, type MgmtEvent, type SystemOpt } from '../../daily-ui'
import type { Options } from '../../forms'
import { ROLE_TIERS } from '@/lib/constants/roles'

// Piezas comunes de los detalles: props compartidas, cabecera, acciones/decisiones vinculadas y el
// runner de server actions (error + refresh).

export type LinkedAction = { id: string; number: string; title: string; status: string; owner_id: string | null; due_date: string | null }
export type LinkedDecision = { id: string; number: string; title: string; status: string; decided_at: string }

export type CommonProps = {
  project: { id: string; code: string; name: string }
  opts: Options
  names: Record<string, string>
  userId: string
  role: string
  events: MgmtEvent[]
  attachments: Attachment[]
}
export type ActionItem = Tables<'actions'>
export type ConstraintItem = Tables<'project_constraints'>
export type TqItem = Tables<'technical_queries'>
export type DecisionItem = Tables<'decisions'>
export type { Member, SystemOpt }

export const EDITOR_ROLES = ROLE_TIERS.editor

export function useRunner() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  function run(fn: () => Promise<{ error?: string }>, after?: () => void, markSaved = false) {
    setError(null); setSaved(false)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.()
      if (markSaved) setSaved(true)
      router.refresh()
    })
  }
  return { run, isPending, error, saved, router }
}

export function Messages({ error, saved }: { error: string | null; saved: boolean }) {
  const t = useTranslations('Daily')
  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      {saved && <Alert kind="ok">{t('form.saved')}</Alert>}
    </>
  )
}

export function when(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString() : ''
}

export function LinkedList({ projectId, actions, decisions, names, newActionHref, newDecisionHref }: {
  projectId: string; actions: LinkedAction[]; decisions: LinkedDecision[]; names: Record<string, string>
  newActionHref?: string; newDecisionHref?: string
}) {
  const t = useTranslations('Daily')
  const row: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }
  const mono: React.CSSProperties = { fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }
  return (
    <section style={card} aria-labelledby="daily-linked">
      <h2 id="daily-linked" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 10px' }}>{t('linked.title')}</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {actions.map(a => (
          <li key={a.id} style={row}>
            <Link href={`/projects/${projectId}/daily/action/${a.id}`} style={mono}>{a.number}</Link>
            <span style={{ color: 'var(--text-strong)' }}>{a.title}</span>
            <StatusChip kind="action" status={a.status} />
            <span style={small}>{(a.owner_id ? names[a.owner_id] : undefined) ?? '—'}{a.due_date ? ` · ${a.due_date}` : ''}</span>
          </li>
        ))}
        {decisions.map(d => (
          <li key={d.id} style={row}>
            <Link href={`/projects/${projectId}/daily/decision/${d.id}`} style={mono}>{d.number}</Link>
            <span style={{ color: 'var(--text-strong)' }}>{d.title}</span>
            <StatusChip kind="decision" status={d.status} />
            <span style={small}>{d.decided_at}</span>
          </li>
        ))}
        {actions.length === 0 && decisions.length === 0 && <li style={small}>{t('linked.none')}</li>}
      </ul>
      {(!!newActionHref || !!newDecisionHref) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {newActionHref && <Link href={newActionHref} style={btn('outline')}>+ {t('new.action')}</Link>}
          {newDecisionHref && <Link href={newDecisionHref} style={btn('outline')}>+ {t('new.decision')}</Link>}
        </div>
      )}
    </section>
  )
}

export function Header({ projectId, kind, number, title, status, children, tab }: {
  projectId: string; kind: 'action' | 'constraint' | 'tq' | 'decision'; number: string; title: string; status: string
  children?: React.ReactNode; tab: string
}) {
  const t = useTranslations('Daily')
  return (
    <div>
      <Link href={`/projects/${projectId}/daily?tab=${tab}`} style={{ fontSize: 'var(--text-sm)', color: 'var(--primary-600, #2563eb)', textDecoration: 'none', fontWeight: 500 }}>
        ← {t('title')}
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: 0, fontFamily: 'ui-monospace, monospace' }}>{number}</h1>
        <StatusChip kind={kind} status={status} />
        {children}
      </div>
      <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-strong)', margin: '6px 0 0' }}>{title}</p>
    </div>
  )
}
