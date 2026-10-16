'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Alert, Evidence, StatusChip, Timeline, btn, card, label, small } from '../../daily-ui'
import { Header, when, type CommonProps, type DecisionItem, type LinkedDecision } from './linked'

// Decisión (F5, log de decisiones): inmutable. Solo se reemplaza por otra (la anterior queda visible).
export default function DecisionDetail({ project, opts, names, role, events, attachments, item, origin, replacedBy, replaces }: CommonProps & {
  item: DecisionItem
  origin: { label: string; href: string } | null
  replacedBy: LinkedDecision | null
  replaces: LinkedDecision | null
}) {
  const t = useTranslations('Daily')
  const who = (id: string | null) => (id ? names[id] : undefined) ?? t('someone')
  const system = opts.systems.find(s => s.id === item.system_id)
  const linkTo = (d: LinkedDecision) => (
    <Link href={`/projects/${project.id}/daily/decision/${d.id}`} style={{ fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{d.number}</Link>
  )
  const block = (title: string, body: string | null) => body ? (
    <div>
      <div style={{ ...label, marginBottom: 4 }}>{title}</div>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-strong)', margin: 0, whiteSpace: 'pre-wrap' }}>{body}</p>
    </div>
  ) : null

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Header projectId={project.id} kind="decision" number={item.number} title={item.title} status={item.status} tab="decisions" />
      <p style={{ ...small, margin: '-8px 0 0' }}>
        {item.decided_at} · {who(item.decided_by)} · {t(`decisionSource.${item.source_kind}`)}{item.source_ref ? ` · ${item.source_ref}` : ''}
        {origin && <> · <Link href={origin.href} style={{ color: 'var(--primary-600, #2563eb)' }}>{origin.label}</Link></>}
        {system ? ` · ${system.code}` : ''}
      </p>

      {replacedBy && (
        <Alert kind="warn">
          {t('decision.supersededBy')} {linkTo(replacedBy)} — {replacedBy.title}{item.supersede_reason ? ` (${item.supersede_reason})` : ''}
        </Alert>
      )}

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {block(t('field.decision'), item.decision)}
        {block(t('field.context'), item.context)}
        {block(t('field.rationale'), item.rationale)}
        {block(t('field.attendees'), item.attendees)}
        <p style={{ ...small, margin: 0 }} suppressHydrationWarning>{t('decision.recordedBy', { who: who(item.recorded_by), when: when(item.created_at) })}</p>
        {replaces && (
          <p style={{ ...small, margin: 0 }}>{t('decision.replaces')} {linkTo(replaces)} — {replaces.title} <StatusChip kind="decision" status={replaces.status} /></p>
        )}
        {item.status === 'active' && role !== 'client' && (
          <div>
            <Link href={`/projects/${project.id}/daily/new?kind=decision&supersedes=${item.id}`} style={btn('outline')}>{t('decision.supersede')}</Link>
          </div>
        )}
        <p style={{ ...small, margin: 0 }}>{t('help.decisionImmutable')}</p>
      </section>

      <Evidence projectId={project.id} kind="decision" entityId={item.id} attachments={attachments} names={names}
        canAdd={item.status === 'active' && role !== 'client'} />

      <Timeline kind="decision" events={events} names={names} />
    </div>
  )
}
