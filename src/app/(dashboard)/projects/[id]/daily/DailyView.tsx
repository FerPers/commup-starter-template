'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  ACTION_LIVE,
  ACTION_SOURCES,
  CONSTRAINT_LIVE,
  ESCALATION_LEVELS,
  TQ_LIVE,
  compareActions,
  daysOverdue,
  todayIso,
  type ActionPriority,
  type ActionSource,
  type ActionStatus,
  type ConstraintStatus,
  type DecisionStatus,
  type MgmtKind,
  type TqStatus,
} from '@/lib/daily/catalog'
import { LevelChip, OverdueChip, PriorityChip, StatusChip, btn, card, input, linkStyle, small } from './daily-ui'

export type DailyTab = 'actions' | 'constraints' | 'tqs' | 'decisions'

export type ActionRow = {
  id: string; number: string; title: string; status: ActionStatus; priority: ActionPriority; due_date: string | null
  owner_id: string | null; source_kind: ActionSource; source_ref: string | null; system: string | null
}
export type ConstraintRow = {
  id: string; number: string; title: string; status: ConstraintStatus; escalation_level: number; need_date: string
  owner_id: string | null; impact_kind: string; system: string | null; gate: string | null
}
export type TqRow = {
  id: string; number: string; subject: string; status: TqStatus; addressed_to: string; addressed_to_name: string | null
  required_by: string | null; responded_at: string | null; design_change: boolean; system: string | null; discipline: string | null
}
export type DecisionRow = {
  id: string; number: string; title: string; status: DecisionStatus; decided_at: string; decided_by: string | null
  source_kind: string; source_ref: string | null; system: string | null
}

type Props = {
  project: { id: string; code: string; name: string }
  initialTab: DailyTab
  actions: ActionRow[]
  constraints: ConstraintRow[]
  tqs: TqRow[]
  decisions: DecisionRow[]
  names: Record<string, string>
  userId: string
  canCreate: boolean
}

const TAB_KIND: Record<DailyTab, MgmtKind> = { actions: 'action', constraints: 'constraint', tqs: 'tq', decisions: 'decision' }

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const mono: React.CSSProperties = { fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }
const dash = <span style={{ color: 'var(--gray-400)' }}>—</span>

export default function DailyView({ project, initialTab, actions, constraints, tqs, decisions, names, userId, canCreate }: Props) {
  const t = useTranslations('Daily')
  const [tab, setTab] = useState<DailyTab>(initialTab)
  const [q, setQ] = useState('')
  const [live, setLive] = useState(true)
  const [mine, setMine] = useState(false)
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [source, setSource] = useState<'' | ActionSource>('')
  const [level, setLevel] = useState<'' | number>('')
  // Fecha local del navegador; el servidor renderiza en UTC: se fija en el cliente.
  const today = useMemo(() => todayIso(), [])

  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'
  const query = q.trim().toLowerCase()
  const hit = (...vals: (string | null)[]) => !query || vals.some(v => v?.toLowerCase().includes(query))
  const href = (kind: MgmtKind, id: string) => `/projects/${project.id}/daily/${kind}/${id}`

  function selectTab(next: DailyTab) {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(null, '', url)
  }

  const actionRows = actions
    .filter(a => (!live || ACTION_LIVE.includes(a.status)) && (!mine || a.owner_id === userId)
      && (!overdueOnly || (ACTION_LIVE.includes(a.status) && daysOverdue(a.due_date, today) > 0))
      && (!source || a.source_kind === source) && hit(a.number, a.title, a.source_ref, a.system, who(a.owner_id)))
    .sort((a, b) => compareActions(a, b, today))
  const constraintRows = constraints
    .filter(c => (!live || CONSTRAINT_LIVE.includes(c.status)) && (!mine || c.owner_id === userId) && (level === '' || c.escalation_level === level)
      && (!overdueOnly || (c.status === 'open' && daysOverdue(c.need_date, today) > 0)) && hit(c.number, c.title, c.system, c.gate))
    .sort((a, b) => b.escalation_level - a.escalation_level || a.need_date.localeCompare(b.need_date))
  const tqRows = tqs
    .filter(x => (!live || TQ_LIVE.includes(x.status)) && (!overdueOnly || (x.status === 'issued' && daysOverdue(x.required_by, today) > 0))
      && hit(x.number, x.subject, x.addressed_to_name, x.system, x.discipline))
  const decisionRows = decisions.filter(d => (!live || d.status === 'active') && hit(d.number, d.title, d.source_ref, d.system))

  const kpis: Record<DailyTab, { label: string; value: number; tone?: 'red' }[]> = {
    actions: [
      { label: t('kpi.actionsOpen'), value: actions.filter(a => a.status === 'open' || a.status === 'in_progress').length },
      { label: t('kpi.overdue'), value: actions.filter(a => (a.status === 'open' || a.status === 'in_progress') && daysOverdue(a.due_date, today) > 0).length, tone: 'red' },
      { label: t('kpi.toVerify'), value: actions.filter(a => a.status === 'done').length },
      { label: t('kpi.mine'), value: actions.filter(a => a.owner_id === userId && (a.status === 'open' || a.status === 'in_progress')).length },
    ],
    constraints: [
      { label: t('kpi.constraintsOpen'), value: constraints.filter(c => c.status === 'open').length },
      { label: t('kpi.overdue'), value: constraints.filter(c => c.status === 'open' && daysOverdue(c.need_date, today) > 0).length, tone: 'red' },
      { label: t('kpi.level4'), value: constraints.filter(c => c.status === 'open' && c.escalation_level === 4).length, tone: 'red' },
      { label: t('kpi.resolved'), value: constraints.filter(c => c.status === 'resolved').length },
    ],
    tqs: [
      { label: t('kpi.tqDraft'), value: tqs.filter(x => x.status === 'draft').length },
      { label: t('kpi.tqIssued'), value: tqs.filter(x => x.status === 'issued').length },
      { label: t('kpi.overdue'), value: tqs.filter(x => x.status === 'issued' && daysOverdue(x.required_by, today) > 0).length, tone: 'red' },
      { label: t('kpi.tqAnswered'), value: tqs.filter(x => x.status === 'answered').length },
    ],
    decisions: [
      { label: t('kpi.decisionsActive'), value: decisions.filter(d => d.status === 'active').length },
      { label: t('kpi.decisionsSuperseded'), value: decisions.filter(d => d.status === 'superseded').length },
    ],
  }

  const counts: Record<DailyTab, number> = {
    actions: actions.filter(a => ACTION_LIVE.includes(a.status)).length,
    constraints: constraints.filter(c => CONSTRAINT_LIVE.includes(c.status)).length,
    tqs: tqs.filter(x => TQ_LIVE.includes(x.status)).length,
    decisions: decisions.filter(d => d.status === 'active').length,
  }

  const toggle = (on: boolean, set: (v: boolean) => void, text: string) => (
    <label style={{ ...small, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} /> {text}
    </label>
  )

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/projects/${project.id}`} style={linkStyle}>← {project.code} · {project.name}</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
            <p style={{ ...small, margin: '4px 0 0', maxWidth: 760 }}>{t('subtitle')}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href={`/projects/${project.id}/daily/export`} style={btn('outline')}>{t('export')}</a>
            {canCreate && (
              <Link href={`/projects/${project.id}/daily/new?kind=${TAB_KIND[tab]}`} style={btn('primary')}>+ {t(`new.${TAB_KIND[tab]}`)}</Link>
            )}
          </div>
        </div>
      </div>

      <div role="tablist" aria-label={t('title')} style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {(Object.keys(TAB_KIND) as DailyTab[]).map(k => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => selectTab(k)}
            style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600,
              color: tab === k ? 'var(--primary-600, #2563eb)' : 'var(--text-muted)',
              borderBottom: tab === k ? '2px solid var(--primary-500)' : '2px solid transparent', marginBottom: -1 }}>
            {t(`tab.${k}`)} · {counts[k]}
          </button>
        ))}
        {(['lookahead', 'reports', 'handovers'] as const).map(k => (
          <Link key={k} href={`/projects/${project.id}/daily/${k}`}
            style={{ padding: '8px 14px', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-muted)', textDecoration: 'none', borderBottom: '2px solid transparent', marginBottom: -1 }}>
            {t(`tab.${k}`)}
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {kpis[tab].map(k => (
          <div key={k.label} style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, color: k.tone === 'red' && k.value > 0 ? 'var(--danger-700)' : 'var(--text-strong)' }} suppressHydrationWarning>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input aria-label={t('filter.search')} placeholder={t('filter.search')} value={q} onChange={e => setQ(e.target.value)} style={{ ...input, width: 280 }} />
        {toggle(live, setLive, tab === 'decisions' ? t('filter.activeOnly') : t('filter.liveOnly'))}
        {(tab === 'actions' || tab === 'constraints') && toggle(mine, setMine, t('filter.mine'))}
        {tab !== 'decisions' && toggle(overdueOnly, setOverdueOnly, t('filter.overdue'))}
        {tab === 'actions' && (
          <select aria-label={t('col.source')} value={source} onChange={e => setSource(e.target.value as typeof source)} style={{ ...input, width: 200 }}>
            <option value="">{t('filter.allSources')}</option>
            {ACTION_SOURCES.map(s => <option key={s} value={s}>{t(`source.${s}`)}</option>)}
          </select>
        )}
        {tab === 'constraints' && (
          <select aria-label={t('col.level')} value={level} onChange={e => setLevel(e.target.value ? Number(e.target.value) : '')} style={{ ...input, width: 220 }}>
            <option value="">{t('filter.allLevels')}</option>
            {ESCALATION_LEVELS.map(l => <option key={l} value={l}>{t('levelShort', { n: l })} — {t(`level.${l}`)}</option>)}
          </select>
        )}
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }} role="tabpanel">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          {tab === 'actions' && (
            <>
              <thead><tr>
                {['number', 'title', 'priority', 'owner', 'due', 'source', 'system', 'status'].map(c => <th key={c} style={th}>{t(`col.${c}`)}</th>)}
              </tr></thead>
              <tbody>
                {actionRows.map(a => (
                  <tr key={a.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><Link href={href('action', a.id)} style={mono}>{a.number}</Link></td>
                    <td style={td}>{a.title}</td>
                    <td style={td}><PriorityChip priority={a.priority} /></td>
                    <td style={td}>{who(a.owner_id)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }} suppressHydrationWarning>
                      {a.due_date ?? dash} {ACTION_LIVE.includes(a.status) && a.status !== 'done' && <OverdueChip days={daysOverdue(a.due_date, today)} />}
                    </td>
                    <td style={{ ...td, ...small }}>{t(`source.${a.source_kind}`)}{a.source_ref ? ` · ${a.source_ref}` : ''}</td>
                    <td style={td}>{a.system ?? dash}</td>
                    <td style={td}><StatusChip kind="action" status={a.status} /></td>
                  </tr>
                ))}
                {actionRows.length === 0 && <tr><td colSpan={8} style={{ ...td, ...small, textAlign: 'center', padding: 32 }}>{t('empty')}</td></tr>}
              </tbody>
            </>
          )}
          {tab === 'constraints' && (
            <>
              <thead><tr>
                {['number', 'title', 'level', 'system', 'gate', 'owner', 'needDate', 'impact', 'status'].map(c => <th key={c} style={th}>{t(`col.${c}`)}</th>)}
              </tr></thead>
              <tbody>
                {constraintRows.map(c => (
                  <tr key={c.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><Link href={href('constraint', c.id)} style={mono}>{c.number}</Link></td>
                    <td style={td}>{c.title}</td>
                    <td style={td}><LevelChip level={c.escalation_level} /></td>
                    <td style={td}>{c.system ?? dash}</td>
                    <td style={td}>{c.gate ?? dash}</td>
                    <td style={td}>{who(c.owner_id)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }} suppressHydrationWarning>
                      {c.need_date} {c.status === 'open' && <OverdueChip days={daysOverdue(c.need_date, today)} />}
                    </td>
                    <td style={{ ...td, ...small }}>{t(`impact.${c.impact_kind}`)}</td>
                    <td style={td}><StatusChip kind="constraint" status={c.status} /></td>
                  </tr>
                ))}
                {constraintRows.length === 0 && <tr><td colSpan={9} style={{ ...td, ...small, textAlign: 'center', padding: 32 }}>{t('empty')}</td></tr>}
              </tbody>
            </>
          )}
          {tab === 'tqs' && (
            <>
              <thead><tr>
                {['number', 'subject', 'addressedTo', 'discipline', 'system', 'requiredBy', 'status'].map(c => <th key={c} style={th}>{t(`col.${c}`)}</th>)}
              </tr></thead>
              <tbody>
                {tqRows.map(x => (
                  <tr key={x.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><Link href={href('tq', x.id)} style={mono}>{x.number}</Link></td>
                    <td style={td}>{x.subject}{x.design_change && <span style={{ ...small, marginLeft: 6, color: '#b45309' }}>· {t('tq.designChange')}</span>}</td>
                    <td style={{ ...td, ...small }}>{t(`addressee.${x.addressed_to}`)}{x.addressed_to_name ? ` · ${x.addressed_to_name}` : ''}</td>
                    <td style={td}>{x.discipline ?? dash}</td>
                    <td style={td}>{x.system ?? dash}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }} suppressHydrationWarning>
                      {x.required_by ?? dash} {x.status === 'issued' && <OverdueChip days={daysOverdue(x.required_by, today)} />}
                    </td>
                    <td style={td}><StatusChip kind="tq" status={x.status} /></td>
                  </tr>
                ))}
                {tqRows.length === 0 && <tr><td colSpan={7} style={{ ...td, ...small, textAlign: 'center', padding: 32 }}>{t('empty')}</td></tr>}
              </tbody>
            </>
          )}
          {tab === 'decisions' && (
            <>
              <thead><tr>
                {['number', 'title', 'decidedAt', 'decidedBy', 'source', 'system', 'status'].map(c => <th key={c} style={th}>{t(`col.${c}`)}</th>)}
              </tr></thead>
              <tbody>
                {decisionRows.map(d => (
                  <tr key={d.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><Link href={href('decision', d.id)} style={mono}>{d.number}</Link></td>
                    <td style={td}>{d.title}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{d.decided_at}</td>
                    <td style={td}>{who(d.decided_by)}</td>
                    <td style={{ ...td, ...small }}>{t(`decisionSource.${d.source_kind}`)}{d.source_ref ? ` · ${d.source_ref}` : ''}</td>
                    <td style={td}>{d.system ?? dash}</td>
                    <td style={td}><StatusChip kind="decision" status={d.status} /></td>
                  </tr>
                ))}
                {decisionRows.length === 0 && <tr><td colSpan={7} style={{ ...td, ...small, textAlign: 'center', padding: 32 }}>{t('empty')}</td></tr>}
              </tbody>
            </>
          )}
        </table>
      </div>
    </div>
  )
}
