'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { openShiftHandover } from '@/app/actions/daily-report'
import { todayIso } from '@/lib/daily/catalog'
import { Alert, Chip, DailyTabs, btn, card, input, small } from '../daily-ui'

type Row = {
  id: string; number: string; date: string; label: 'day' | 'night' | 'other'; status: 'draft' | 'handed_over' | 'accepted'
  openedBy: string | null; handedBy: string | null; handedAt: string | null; receivedBy: string | null; receivedAt: string | null
  mineToReceive: boolean
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const TONE = { draft: 'amber', handed_over: 'blue', accepted: 'green' } as const

export default function HandoversListView({ project, rows, canOpen }: { project: { id: string; code: string; name: string }; rows: Row[]; canOpen: boolean }) {
  const t = useTranslations('Daily')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const today = useMemo(() => todayIso(), [])
  const [date, setDate] = useState(today)
  const [label, setLabel] = useState<'day' | 'night' | 'other'>('day')
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '')

  function open() {
    setError(null)
    startTransition(async () => {
      const res = await openShiftHandover({ projectId: project.id, shiftLabel: label, shiftDate: date })
      if (res.error || !res.id) { setError(res.error ?? t('form.error')); return }
      router.push(`/projects/${project.id}/daily/handovers/${res.id}`)
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DailyTabs project={project} active="handovers" />

      {canOpen && (
        <section style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={small}>{t('handover.date')}</span>
            <input type="date" style={{ ...input, width: 170 }} value={date} max={today} onChange={e => setDate(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={small}>{t('handover.shift')}</span>
            <select style={{ ...input, width: 160 }} value={label} onChange={e => setLabel(e.target.value as typeof label)}>
              {(['day', 'night', 'other'] as const).map(l => <option key={l} value={l}>{t(`handover.label.${l}`)}</option>)}
            </select>
          </label>
          <button type="button" style={btn('primary', isPending || !date)} disabled={isPending || !date} onClick={open}>{t('handover.open')}</button>
          <p style={{ ...small, margin: 0, flexBasis: '100%' }}>{t('handover.openHelp')}</p>
        </section>
      )}
      {error && <Alert kind="error">{error}</Alert>}

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['number', 'date', 'shift', 'status', 'handedBy', 'receivedBy'].map(c => <th key={c} style={th}>{t(`handover.col.${c}`)}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(h => (
              <tr key={h.id} style={h.mineToReceive ? { background: '#eff6ff' } : undefined}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <Link href={`/projects/${project.id}/daily/handovers/${h.id}`} style={{ fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }}>{h.number}</Link>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{h.date}</td>
                <td style={td}>{t(`handover.label.${h.label}`)}</td>
                <td style={td}>
                  <Chip tone={TONE[h.status]}>{t(`handover.status.${h.status}`)}</Chip>
                  {h.mineToReceive && <span style={{ ...small, marginLeft: 6, color: '#1d4ed8', fontWeight: 600 }}>{t('handover.toReceive')}</span>}
                </td>
                <td style={{ ...td, ...small }} suppressHydrationWarning>{h.handedBy ? `${h.handedBy} · ${when(h.handedAt)}` : `${h.openedBy ?? '—'} (${t('handover.status.draft').toLowerCase()})`}</td>
                <td style={{ ...td, ...small }} suppressHydrationWarning>{h.receivedBy ? `${h.receivedBy} · ${when(h.receivedAt)}` : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} style={{ ...td, ...small, textAlign: 'center', padding: 32 }}>{t('handover.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
