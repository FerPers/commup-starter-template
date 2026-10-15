'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { OPEN_STATUSES, type RegisterKind, type RegisterStatus } from '@/lib/registers/catalog'
import { lineStates, summarize, type LineState } from '@/lib/registers/test-packs'
import { StatusChip, btn, card, input, linkStyle, small } from '../register-ui'

// El modal trae xlsx (pesado): solo se carga al abrirlo.
const ImportTestPacksModal = dynamic(() => import('./ImportTestPacksModal'), { ssr: false })

export type PackRow = {
  id: string
  number: string
  title: string
  status: RegisterStatus
  packRef: string | null
  testType: string | null
  system: string | null
  lines: { tag_id: string; tag_number: string; system: string | null }[]
  blinds: { id: string; number: string; kind: RegisterKind; status: RegisterStatus }[]
}

type Props = {
  project: { id: string; code: string; name: string }
  packs: PackRow[]
  canEdit: boolean
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }

const LINE_STYLE: Record<LineState, { bg: string; fg: string; border: string }> = {
  pending: { bg: 'var(--gray-50)', fg: 'var(--text-muted)', border: 'var(--border)' },
  in_test: { bg: '#fffbeb', fg: '#b45309', border: '#fcd34d' },
  tested:  { bg: 'var(--success-50)', fg: 'var(--success-700)', border: '#a7f3d0' },
}

const PACK_STAGE_PCT: Record<RegisterStatus, number> = { proposed: 0, authorized: 25, active: 50, removed: 75, verified: 100, cancelled: 0 }

function Bar({ pct }: { pct: number }) {
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
      style={{ height: 8, background: 'var(--gray-100, #f1f5f9)', borderRadius: 999, overflow: 'hidden', minWidth: 80 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--success-500, #16a34a)' }} />
    </div>
  )
}

export default function TestPacksView({ project, packs, canEdit }: Props) {
  const t = useTranslations('Registers.testPacks')
  const tr = useTranslations('Registers')
  const [tab, setTab] = useState<'packs' | 'lines'>('packs')
  const [q, setQ] = useState('')
  const [lineFilter, setLineFilter] = useState<'' | LineState>('')
  const [importing, setImporting] = useState(false)

  const states = useMemo(() => lineStates(packs.map(p => ({ id: p.id, status: p.status, lineIds: p.lines.map(l => l.tag_id) }))), [packs])

  // Una fila por línea con los packs (no cancelados primero) que la contienen.
  const lines = useMemo(() => {
    const byId = new Map<string, { tag_id: string; tag_number: string; system: string | null; packs: PackRow[] }>()
    for (const p of packs) for (const l of p.lines) {
      const row = byId.get(l.tag_id) ?? { ...l, packs: [] }
      row.packs.push(p)
      byId.set(l.tag_id, row)
    }
    return [...byId.values()].sort((a, b) => a.tag_number.localeCompare(b.tag_number))
  }, [packs])

  const total = summarize(lines.map(l => states.get(l.tag_id) ?? 'pending'))
  const bySystem = useMemo(() => {
    const m = new Map<string, LineState[]>()
    for (const l of lines) {
      const k = l.system ?? '—'
      m.set(k, [...(m.get(k) ?? []), states.get(l.tag_id) ?? 'pending'])
    }
    return [...m.entries()].map(([system, s]) => ({ system, ...summarize(s) })).sort((a, b) => a.system.localeCompare(b.system))
  }, [lines, states])

  // Avance del pack = etapa de su ciclo (§8.6).
  const packPct = (p: PackRow) => PACK_STAGE_PCT[p.status]
  const openPacks = packs.filter(p => OPEN_STATUSES.includes(p.status)).length
  const query = q.trim().toLowerCase()
  const shownPacks = packs.filter(p => !query || p.number.toLowerCase().includes(query) || (p.packRef ?? '').toLowerCase().includes(query) ||
    p.title.toLowerCase().includes(query) || p.lines.some(l => l.tag_number.toLowerCase().includes(query)))
  const shownLines = lines.filter(l => (!lineFilter || (states.get(l.tag_id) ?? 'pending') === lineFilter) &&
    (!query || l.tag_number.toLowerCase().includes(query) || l.packs.some(p => p.number.toLowerCase().includes(query) || (p.packRef ?? '').toLowerCase().includes(query))))

  const labelsHref = `/projects/${project.id}/registers/labels?kind=test_pack`
  const kpis = [
    { label: t('kpi.lines'), value: String(total.total) },
    { label: t('kpi.tested'), value: `${total.pct}%`, hint: t('kpi.testedHint', { n: total.tested }) },
    { label: t('kpi.inTest'), value: String(total.in_test) },
    { label: t('kpi.pending'), value: String(total.pending) },
    { label: t('kpi.openPacks'), value: String(openPacks), hint: t('kpi.packsHint', { n: packs.length }) },
  ]

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/projects/${project.id}/registers`} style={linkStyle}>← {tr('detail.back')}</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h1>
            <p style={{ ...small, margin: '4px 0 0', maxWidth: 760 }}>{t('subtitle')}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {packs.length > 0 && <a href={labelsHref} target="_blank" rel="noopener" style={btn('outline')}>{t('labels')}</a>}
            {canEdit && <button type="button" style={btn('outline')} onClick={() => setImporting(true)}>{t('import')}</button>}
            {canEdit && <Link href={`/projects/${project.id}/registers/new?kind=test_pack`} style={btn('primary')}>+ {t('new')}</Link>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', marginTop: 4 }}>{k.value}</div>
            {k.hint && <div style={{ ...small, fontSize: 'var(--text-xs)' }}>{k.hint}</div>}
          </div>
        ))}
      </div>

      {bySystem.length > 0 && (
        <section style={card} aria-labelledby="tp-by-system">
          <h2 id="tp-by-system" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 10px' }}>{t('bySystem')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {bySystem.map(s => (
              <div key={s.system} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                  <strong style={{ color: 'var(--text-strong)' }}>{s.system}</strong>
                  <span style={small}>{t('systemLine', { tested: s.tested, total: s.total, pct: s.pct })}</span>
                </div>
                <Bar pct={s.pct} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div role="tablist" style={{ display: 'flex', gap: 4 }}>
          {(['packs', 'lines'] as const).map(k => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              style={{ ...btn('outline'), background: tab === k ? 'var(--primary-500)' : 'var(--card-bg)', color: tab === k ? '#fff' : 'var(--text-strong)' }}>
              {t(`tab.${k}`)} · {k === 'packs' ? packs.length : lines.length}
            </button>
          ))}
        </div>
        <input aria-label={t('search')} placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} style={{ ...input, width: 260 }} />
        {tab === 'lines' && (
          <select aria-label={t('col.lineState')} value={lineFilter} onChange={e => setLineFilter(e.target.value as typeof lineFilter)} style={{ ...input, width: 180 }}>
            <option value="">{t('allStates')}</option>
            {(['pending', 'in_test', 'tested'] as const).map(s => <option key={s} value={s}>{t(`lineState.${s}`)}</option>)}
          </select>
        )}
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        {tab === 'packs' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('col.pack')}</th>
                <th style={th}>{t('col.title')}</th>
                <th style={th}>{t('col.system')}</th>
                <th style={th}>{t('col.lines')}</th>
                <th style={th}>{t('col.blinds')}</th>
                <th style={th}>{t('col.status')}</th>
                <th style={th}>{t('col.progress')}</th>
              </tr>
            </thead>
            <tbody>
              {shownPacks.map(p => {
                // «Instaladas» = estado activo; ámbar mientras alguna ciega siga sin verificar.
                const installed = p.blinds.filter(b => b.status === 'active').length
                const pendingBlinds = p.blinds.some(b => OPEN_STATUSES.includes(b.status))
                return (
                  <tr key={p.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <Link href={`/projects/${project.id}/registers/${p.id}`} style={{ fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }}>{p.number}</Link>
                      {p.packRef && <div style={{ ...small, fontSize: 'var(--text-xs)' }}>{p.packRef}</div>}
                    </td>
                    <td style={td}>
                      {p.title}
                      {p.testType && <div style={{ ...small, fontSize: 'var(--text-xs)' }}>{tr(`option.test_type.${p.testType}`)}</div>}
                    </td>
                    <td style={td}>{p.system ?? <span style={{ color: 'var(--gray-400)' }}>—</span>}</td>
                    <td style={{ ...td, ...small }}>
                      <strong style={{ color: 'var(--text-strong)' }}>{p.lines.length}</strong>
                      {p.lines.length > 0 && ` · ${p.lines.slice(0, 2).map(l => l.tag_number).join(', ')}${p.lines.length > 2 ? '…' : ''}`}
                    </td>
                    <td style={{ ...td, ...small }}>
                      {p.blinds.length === 0 ? '—' : (
                        <span style={{ color: pendingBlinds ? '#b45309' : 'var(--success-700)', fontWeight: 600 }}>
                          {t('blindsCount', { open: installed, total: p.blinds.length })}
                        </span>
                      )}
                    </td>
                    <td style={td}><StatusChip kind="test_pack" status={p.status} /></td>
                    <td style={{ ...td, minWidth: 120 }}><Bar pct={packPct(p)} /></td>
                  </tr>
                )
              })}
              {shownPacks.length === 0 && <tr><td colSpan={7} style={{ ...td, ...small, textAlign: 'center', padding: 32 }}>{t('emptyPacks')}</td></tr>}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('col.line')}</th>
                <th style={th}>{t('col.system')}</th>
                <th style={th}>{t('col.packs')}</th>
                <th style={th}>{t('col.lineState')}</th>
              </tr>
            </thead>
            <tbody>
              {shownLines.map(l => {
                const s = states.get(l.tag_id) ?? 'pending'
                const st = LINE_STYLE[s]
                return (
                  <tr key={l.tag_id}>
                    <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{l.tag_number}</td>
                    <td style={td}>{l.system ?? <span style={{ color: 'var(--gray-400)' }}>—</span>}</td>
                    <td style={{ ...td, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {l.packs.map(p => (
                        <Link key={p.id} href={`/projects/${project.id}/registers/${p.id}`}
                          style={{ ...small, textDecoration: p.status === 'cancelled' ? 'line-through' : 'none', fontFamily: 'ui-monospace, monospace' }}>
                          {p.number}
                        </Link>
                      ))}
                    </td>
                    <td style={td}>
                      <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 'var(--text-xs)', fontWeight: 600, background: st.bg, color: st.fg, border: `1px solid ${st.border}` }}>
                        {t(`lineState.${s}`)}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {shownLines.length === 0 && <tr><td colSpan={4} style={{ ...td, ...small, textAlign: 'center', padding: 32 }}>{t('emptyLines')}</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {importing && (
        <ImportTestPacksModal
          projectId={project.id}
          packs={packs}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  )
}
