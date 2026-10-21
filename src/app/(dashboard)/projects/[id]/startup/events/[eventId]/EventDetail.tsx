'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addStartupEventParam, voidStartupEvent, witnessStartupEvent } from '@/app/actions/startup-events'
import type { MyCapacities } from '@/lib/constants/capacities'
import { canWitness, type EventCategory, type Milestone, type StartupEventStatus } from '@/lib/startup/catalog'
import { Alert, Chip, btn, card, input, label, small } from '../../../daily/daily-ui'
import { EVENT_TONE } from '../EventsView'
import { useLocalTime } from '@/lib/use-local-time'
import { ROLE_TIERS } from '@/lib/constants/roles'

type Param = {
  id: string; signal_id: string | null; label: string; value: number | null; value_text: string | null; unit: string | null
  quality: number | null; sampled_at: string | null; offset_s: number | null; source: string
}
type Event = {
  id: string; number: string; kind: 'milestone' | 'free'; milestone: Milestone | null; category: EventCategory | null
  occurredAt: string; title: string; description: string | null; status: StartupEventStatus; system: string; systemId: string
  run: { id: string; number: string } | null; recordedBy: string | null; recordedAt: string; witnessCapacity: string | null
  witnessBy: string | null; witnessAt: string | null; voidedBy: string | null; voidedAt: string | null; voidReason: string | null; tags: string[]
}
const LEADERS = ROLE_TIERS.editor
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)' }

export default function EventDetail({ project, event: e, params, series, names, userId, role, caps }: {
  project: { id: string; code: string; name: string }; event: Event; params: Param[]
  series: { signalId: string; bucket: string; value: number | null }[]; names: Record<string, string>; userId: string; role: string
  /** S14 (D14): capacidades del usuario en el proyecto. */
  caps: MyCapacities
}) {
  const t = useTranslations('Startup')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState({ label: '', value: '', unit: '' })
  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'
  const localTime = useLocalTime()  // S10 (E-15b): hora local con su zona, no la UTC del servidor
  const when = (iso: string | null) => localTime(iso)
  const ids = { projectId: project.id, eventId: e.id }
  const open = e.status === 'pending_witness' || e.status === 'recorded'
  const root = `/projects/${project.id}/startup`
  const eventMs = Date.parse(e.occurredAt)

  function act(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }
  function doVoid() {
    const reason = window.prompt(t('events.voidPrompt'))
    if (reason?.trim()) act(() => voidStartupEvent({ ...ids, reason }))
  }

  const fmtVal = (p: Param) => (p.value !== null ? p.value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : p.value_text ?? '—')
  const charts = params.filter(p => p.signal_id).map(p => ({
    param: p,
    data: series.filter(s => s.signalId === p.signal_id).map(s => ({ t: Date.parse(s.bucket), v: s.value })),
  }))

  return (
    <div style={{ padding: '24px 16px', maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <Link href={`${root}/events`} style={{ ...small, textDecoration: 'none', color: 'var(--primary-600, #2563eb)' }}>← {t('tab.events')}</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, fontFamily: 'ui-monospace, monospace', color: 'var(--text-strong)' }}>{e.number}</h1>
          <Chip tone={e.kind === 'milestone' ? 'violet' : 'muted'}>{e.kind === 'milestone' ? t(`milestone.${e.milestone}`) : t(`category.${e.category}`)}</Chip>
          <Chip tone={EVENT_TONE[e.status]}>{t(`eventStatus.${e.status}`)}</Chip>
          <a href={`${root}/events/${e.id}/pdf`} target="_blank" rel="noopener" style={{ ...btn('outline'), marginLeft: 'auto', textDecoration: 'none' }} title="PDF">PDF</a>
        </div>
        <p style={{ margin: '4px 0 0', color: 'var(--text-strong)', fontSize: 'var(--text-base)' }}>{e.title}</p>
        <p style={{ ...small, margin: '2px 0 0' }} suppressHydrationWarning>
          {e.system} · {when(e.occurredAt)}
          {e.run && <> · <Link href={`${root}/runs/${e.run.id}`} style={{ color: 'var(--primary-600, #2563eb)' }}>{e.run.number}</Link></>}
          {e.tags.length > 0 && ` · ${e.tags.join(', ')}`}
        </p>
        {e.description && <p style={{ ...small, margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{e.description}</p>}
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {e.status === 'voided' && <Alert kind="warn">{t('events.voided', { who: who(e.voidedBy), when: when(e.voidedAt), reason: e.voidReason ?? '' })}</Alert>}

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={label}>{t('events.signatures')}</div>
        <span style={small} suppressHydrationWarning>{t('events.recordedBy', { who: who(e.recordedBy), when: when(e.recordedAt) })}</span>
        {e.kind === 'milestone' && (
          e.witnessAt
            ? <span style={small} suppressHydrationWarning>{t('events.witnessedBy', { who: who(e.witnessBy), cap: t(`capacity.${e.witnessCapacity}`), when: when(e.witnessAt) })}</span>
            : e.status === 'pending_witness' && (
              canWitness(caps, e.milestone!, userId, e.recordedBy)
                ? <div><button type="button" style={btn('primary', isPending)} disabled={isPending} onClick={() => act(() => witnessStartupEvent(ids))}>✓ {t('events.witness', { cap: t(`capacity.${e.witnessCapacity}`) })}</button></div>
                : <span style={{ ...small, color: '#b45309' }}>{e.recordedBy === userId ? t('events.witnessOther') : t('events.witnessRole', { cap: t(`capacity.${e.witnessCapacity}`) })}</span>
            )
        )}
        {open && LEADERS.includes(role) && <div><button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} disabled={isPending} onClick={doVoid}>{t('events.void')}</button></div>}
      </section>

      <section style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['param', 'value', 'source', 'sampledAt'].map(c => <th key={c} style={th}>{t(`events.col.${c}`)}</th>)}</tr></thead>
          <tbody>
            {params.map(p => (
              <tr key={p.id}>
                <td style={{ ...td, fontFamily: p.signal_id ? 'ui-monospace, monospace' : undefined, fontWeight: 600 }}>{p.label}</td>
                <td style={td}>{fmtVal(p)}{p.unit ? ` ${p.unit}` : ''}</td>
                <td style={td}>
                  <Chip tone={p.source === 'iiot' ? 'blue' : p.source === 'manual' ? 'muted' : 'amber'}>{t(`events.source.${p.source}`)}</Chip>
                  {p.source === 'iiot' && p.quality !== null && p.quality !== 0 && <span style={{ ...small, marginLeft: 6, color: '#b45309' }}>q{p.quality}</span>}
                </td>
                <td style={{ ...td, ...small }} suppressHydrationWarning>
                  {p.sampled_at ? `${new Date(p.sampled_at).toLocaleTimeString()} (${p.offset_s !== null && p.offset_s >= 0 ? '+' : ''}${p.offset_s ?? 0} s)` : '—'}
                </td>
              </tr>
            ))}
            {params.length === 0 && <tr><td colSpan={4} style={{ ...td, ...small, textAlign: 'center' }}>{t('events.noParams')}</td></tr>}
          </tbody>
        </table>
        {open && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: 10 }}>
            <input aria-label={t('events.param')} placeholder={t('events.param')} style={{ ...input, width: 220 }} value={manual.label} onChange={ev => setManual({ ...manual, label: ev.target.value })} />
            <input aria-label={t('events.value')} placeholder={t('events.value')} style={{ ...input, width: 140 }} value={manual.value} onChange={ev => setManual({ ...manual, value: ev.target.value })} />
            <input aria-label={t('events.unit')} placeholder={t('events.unit')} style={{ ...input, width: 100 }} value={manual.unit} onChange={ev => setManual({ ...manual, unit: ev.target.value })} />
            <button type="button" style={btn('outline', isPending || !manual.label.trim() || !manual.value.trim())} disabled={isPending || !manual.label.trim() || !manual.value.trim()}
              onClick={() => act(() => addStartupEventParam({ ...ids, ...manual }), () => setManual({ label: '', value: '', unit: '' }))}>+ {t('events.addParam')}</button>
          </div>
        )}
      </section>

      {charts.length > 0 && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          {charts.map(({ param, data }) => (
            <div key={param.id} style={{ ...card, padding: 12 }}>
              <div style={{ ...label, marginBottom: 6 }}>{param.label}{param.unit ? ` (${param.unit})` : ''} · {t('events.window')}</div>
              {data.length === 0 ? <p style={{ ...small, margin: 0 }}>{t('events.noSeries')}</p> : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 10 }}
                      tickFormatter={v => new Date(Number(v)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={v => new Date(Number(v)).toLocaleTimeString()} formatter={v => [String(v), param.label]} />
                    <ReferenceLine x={eventMs} stroke="var(--danger-500, #ef4444)" strokeDasharray="4 2" label={{ value: e.number, fontSize: 10, position: 'top' }} />
                    <Line type="monotone" dataKey="v" stroke="var(--primary-500, #2563eb)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
