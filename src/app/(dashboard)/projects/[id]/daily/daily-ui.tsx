'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { addMgmtAttachment, getMgmtEvidenceUrl } from '@/app/actions/daily'
import { evidencePath, type EvidenceKind, type MgmtKind } from '@/lib/daily/catalog'
import { btn, card, input, label, small } from '../registers/register-ui'
import HubTabs from '@/components/navigation/HubTabs'
import { DAILY_TABS, dailyTabHref, type DailyHubTab } from '@/lib/navigation/hub-routes'

// Piezas compartidas de la gestión diaria (fase 5): chips de estado, prioridad y nivel, campo con
// etiqueta, línea de tiempo y evidencia. Los estilos base salen de los registros controlados (F3).
export { btn, card, input, label, small, linkStyle } from '../registers/register-ui'

export type Member = { id: string; name: string }
export type SystemOpt = { id: string; code: string; name: string }

type Tone = 'muted' | 'blue' | 'amber' | 'violet' | 'green' | 'red' | 'struck'
const TONE: Record<Tone, { bg: string; fg: string; border: string }> = {
  muted:  { bg: 'var(--gray-50)',    fg: 'var(--text-muted)',  border: 'var(--border)' },
  blue:   { bg: '#eff6ff',           fg: '#1d4ed8',            border: '#93c5fd' },
  amber:  { bg: '#fffbeb',           fg: '#b45309',            border: '#fcd34d' },
  violet: { bg: '#f5f3ff',           fg: '#6d28d9',            border: '#c4b5fd' },
  green:  { bg: 'var(--success-50)', fg: 'var(--success-700)', border: '#a7f3d0' },
  red:    { bg: 'var(--danger-50)',  fg: 'var(--danger-700)',  border: '#fecaca' },
  struck: { bg: 'var(--gray-50)',    fg: 'var(--gray-400)',    border: 'var(--border)' },
}

/** Color por estado, común a las 4 entidades. */
export const STATUS_TONE: Record<string, Tone> = {
  open: 'blue', in_progress: 'amber', done: 'violet', verified: 'green', cancelled: 'struck',
  resolved: 'violet', closed: 'green',
  draft: 'muted', issued: 'blue', answered: 'violet',
  active: 'green', superseded: 'struck',
}
const PRIORITY_TONE: Record<string, Tone> = { critical: 'red', high: 'amber', medium: 'blue', low: 'muted' }
const LEVEL_TONE: Record<number, Tone> = { 1: 'muted', 2: 'blue', 3: 'amber', 4: 'red' }

export function Chip({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  const st = TONE[tone]
  return (
    <span title={title} style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap',
      background: st.bg, color: st.fg, border: `1px solid ${st.border}`, textDecoration: tone === 'struck' ? 'line-through' : undefined,
    }}>{children}</span>
  )
}

export function StatusChip({ kind, status }: { kind: MgmtKind; status: string }) {
  const t = useTranslations('Daily')
  return <Chip tone={STATUS_TONE[status] ?? 'muted'}>{t(`status.${kind}.${status}`)}</Chip>
}

export function PriorityChip({ priority }: { priority: string }) {
  const t = useTranslations('Daily')
  return <Chip tone={PRIORITY_TONE[priority] ?? 'muted'}>{t(`priority.${priority}`)}</Chip>
}

export function LevelChip({ level }: { level: number }) {
  const t = useTranslations('Daily')
  return <Chip tone={LEVEL_TONE[level] ?? 'muted'} title={t(`level.${level}`)}>{t('levelShort', { n: level })}</Chip>
}

export function OverdueChip({ days }: { days: number }) {
  const t = useTranslations('Daily')
  if (days <= 0) return null
  return <Chip tone="red">{t('overdue', { n: days })}</Chip>
}

export function Field({ text, children, wide, required }: { text: string; children: React.ReactNode; wide?: boolean; required?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={label}>{text}{required ? ' *' : ''}</span>
      {children}
    </label>
  )
}

export const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }

export function MemberSelect({ value, onChange, members, disabled, allowEmpty, ariaLabel }: {
  value: string; onChange: (v: string) => void; members: Member[]; disabled?: boolean; allowEmpty?: string; ariaLabel?: string
}) {
  return (
    <select aria-label={ariaLabel} style={input} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  )
}

export function SystemSelect({ value, onChange, systems, disabled, emptyLabel, ariaLabel }: {
  value: string; onChange: (v: string) => void; systems: SystemOpt[]; disabled?: boolean; emptyLabel?: string; ariaLabel?: string
}) {
  return (
    <select aria-label={ariaLabel} style={input} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {systems.map(s => <option key={s.id} value={s.id}>{s.code}{s.name !== s.code ? ` — ${s.name}` : ''}</option>)}
    </select>
  )
}

export function Alert({ kind, children }: { kind: 'error' | 'ok' | 'warn'; children: React.ReactNode }) {
  const st = kind === 'error' ? TONE.red : kind === 'ok' ? TONE.green : TONE.amber
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} style={{ padding: '10px 14px', background: st.bg, border: `1px solid ${st.border}`, borderRadius: 8, color: st.fg, fontSize: 'var(--text-sm)' }}>
      {children}
    </div>
  )
}

export type MgmtEvent = {
  id: string
  action: string
  from_value: string | null
  to_value: string | null
  user_id: string | null
  comment: string | null
  created_at: string
}

/** Línea de tiempo común. Los valores de transición se traducen con el estado del tipo. */
export function Timeline({ kind, events, names }: { kind: MgmtKind; events: MgmtEvent[]; names: Record<string, string> }) {
  const t = useTranslations('Daily')
  const who = (id: string | null) => (id ? names[id] : undefined) ?? t('someone')
  const status = (s: string | null) => (s ? (t.has(`status.${kind}.${s}`) ? t(`status.${kind}.${s}`) : s) : '')
  const describe = (e: MgmtEvent) => {
    switch (e.action) {
      case 'transition': return t('event.transition', { from: status(e.from_value), to: status(e.to_value) })
      case 'rejected': return t('event.rejected')
      case 'escalated': case 'deescalated': return t(`event.${e.action}`, { from: e.from_value ?? '', to: e.to_value ?? '' })
      case 'reassigned': return t('event.reassigned', { to: who(e.to_value) })
      case 'due_date': case 'need_date': return t('event.dateChanged', { from: e.from_value ?? '—', to: e.to_value ?? '—' })
      default: return t.has(`event.${e.action}`) ? t(`event.${e.action}`) : e.action
    }
  }
  return (
    <section style={card} aria-labelledby="daily-timeline">
      <h2 id="daily-timeline" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 10px' }}>{t('timeline')}</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[...events].reverse().map(e => (
          <li key={e.id} style={{ ...small, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Hora local del navegador: difiere del render del servidor (UTC). */}
            <span style={{ whiteSpace: 'nowrap' }} suppressHydrationWarning>{new Date(e.created_at).toLocaleString()}</span>
            <strong style={{ color: 'var(--text-strong)' }}>{describe(e)}</strong>
            <span>· {who(e.user_id)}</span>
            {e.comment && e.action !== 'reassigned' && <span style={{ fontStyle: 'italic' }}>— {e.comment}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export type Attachment = { id: string; file_name: string; file_path: string; mime_type: string | null; created_at: string; uploaded_by: string | null }

/** Evidencia inmutable: subir al bucket mgmt-evidence y registrar por RPC; abrir con URL firmada. */
export function Evidence({ projectId, kind, entityId, attachments, names, canAdd, required }: {
  projectId: string; kind: EvidenceKind; entityId: string; attachments: Attachment[]; names: Record<string, string>; canAdd: boolean; required?: boolean
}) {
  const t = useTranslations('Daily')
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function upload(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    startTransition(async () => {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) { setError(t('evidence.tooBig', { name: file.name })); return }
        const path = evidencePath(projectId, kind, entityId, file.name)
        const { error: upErr } = await createClient().storage.from('mgmt-evidence').upload(path, file, { contentType: file.type || 'application/octet-stream' })
        if (upErr) { setError(upErr.message); return }
        const res = await addMgmtAttachment({ projectId, kind, entityId, filePath: path, fileName: file.name, mimeType: file.type, sizeBytes: file.size })
        if (res.error) { setError(res.error); return }
      }
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    })
  }

  function open(path: string) {
    startTransition(async () => {
      const res = await getMgmtEvidenceUrl({ projectId, path })
      if (res.error || !res.url) { setError(res.error ?? t('evidence.openError')); return }
      window.open(res.url, '_blank', 'noopener')
    })
  }

  return (
    <section style={card} aria-labelledby={`evidence-${entityId}`}>
      <h2 id={`evidence-${entityId}`} style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('evidence.title')}</h2>
      <p style={{ ...small, margin: '0 0 10px' }}>{required ? t('evidence.required') : t('evidence.help')}</p>
      {error && <div style={{ marginBottom: 10 }}><Alert kind="error">{error}</Alert></div>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {attachments.map(a => (
          <li key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
            <button type="button" onClick={() => open(a.file_path)} disabled={isPending}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary-600, #2563eb)', cursor: 'pointer', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
              📎 {a.file_name}
            </button>
            <span style={small} suppressHydrationWarning>{(a.uploaded_by ? names[a.uploaded_by] : undefined) ?? t('someone')} · {new Date(a.created_at).toLocaleString()}</span>
          </li>
        ))}
        {attachments.length === 0 && <li style={small}>{t('evidence.none')}</li>}
      </ul>
      {canAdd && (
        <div style={{ marginTop: 12 }}>
          <input ref={fileRef} type="file" multiple aria-label={t('evidence.add')} style={{ display: 'none' }} onChange={e => upload(e.target.files)} />
          <button type="button" style={btn('outline', isPending)} disabled={isPending} onClick={() => fileRef.current?.click()}>
            {isPending ? t('evidence.uploading') : `+ ${t('evidence.add')}`}
          </button>
        </div>
      )}
    </section>
  )
}

/** Cabecera y pestañas como enlaces (para subpáginas del hub, p. ej. el look-ahead). */
/** H-18: cabecera del hub Gestión diaria con pestañas por ruta (`HubTabs`); el look-ahead vive en Planificación (N2c). */
export function DailyTabs({ projectId, active, counts, subtitle, actions }: {
  projectId: string
  active: DailyHubTab
  counts?: Partial<Record<DailyHubTab, number>>
  subtitle?: string
  actions?: React.ReactNode
}) {
  const t = useTranslations('Daily')
  return (
    <div>
      <HubTabs
        title={t('title')}
        current={active}
        aside={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href={`/projects/${projectId}/planning/lookahead`} style={{ ...small, textDecoration: 'none', color: 'var(--primary-600, #2563eb)', fontWeight: 600 }}>{t('tab.lookahead')} →</Link>
            {actions}
          </div>
        )}
        tabs={DAILY_TABS.map(k => ({ key: k, href: dailyTabHref(projectId, k), label: t(`tab.${k}`), count: counts?.[k] }))}
      />
      {subtitle && <p style={{ ...small, margin: '-8px 0 0', maxWidth: 760 }}>{subtitle}</p>}
    </div>
  )
}
