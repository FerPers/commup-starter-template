'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getStartupPrerequisites, recordStartupEvent } from '@/app/actions/startup-events'
import {
  BACKDATE_DAYS, EVENT_CATEGORIES, GATED_MILESTONES, MILESTONES, milestoneCapacity, needsBackdateReason,
  type EventCategory, type Milestone, type StartupEventStatus,
} from '@/lib/startup/catalog'
import { TagPicker } from '../../registers/RegisterFields'
import { Alert, Chip, Field, SystemSelect, btn, card, grid, input, small } from '../../daily/daily-ui'
import StartupTabs from '../StartupTabs'
import { useLocalTime } from '@/lib/use-local-time'

type Ev = {
  id: string; number: string; systemId: string; kind: 'milestone' | 'free'; milestone: Milestone | null; category: EventCategory | null
  occurredAt: string; title: string; status: StartupEventStatus; recordedBy: string | null; witnessBy: string | null; witnessAt: string | null; params: number
}
type Sig = { id: string; tag: string; type: string; unit: string | null; systemId: string | null }
type Prereq = { gate_ok: boolean; gate_code: string | null; gate_status: string; pssr_ok: boolean; pssr_number: string | null; pssr_status: string }

export const EVENT_TONE: Record<StartupEventStatus, 'amber' | 'green' | 'blue' | 'struck'> = { pending_witness: 'amber', witnessed: 'green', recorded: 'blue', voided: 'struck' }
const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }

/** Hora local "YYYY-MM-DDTHH:mm" para <input type="datetime-local">. */
function localNow() {
  const d = new Date(); d.setSeconds(0, 0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export default function EventsView({ project, systems, initialSystemId, initialOpen, initialTag, events, runs, signals, names, canRecord }: {
  project: { id: string; code: string; name: string }
  systems: { id: string; code: string; name: string }[]
  initialSystemId: string
  /** N3b: ＋ Crear abre el formulario de una vez (`?new=1`), con el tag de la ficha de origen. */
  initialOpen?: boolean
  initialTag?: { tag_id: string; tag_number: string } | null
  events: Ev[]
  runs: { id: string; number: string; system_id: string | null; status: string }[]
  signals: Sig[]
  names: Record<string, string>
  canRecord: boolean
}) {
  const t = useTranslations('Startup')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState(initialSystemId)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    systemId: initialSystemId, kind: 'milestone' as 'milestone' | 'free', code: 'first_rotation' as string, occurredAt: '', title: '', description: '', runId: '', backdateReason: '',
  })
  const [tags, setTags] = useState<{ tag_id: string; tag_number: string; role: 'subject' }[]>(() => initialTag ? [{ ...initialTag, role: 'subject' }] : [])
  const [sigIds, setSigIds] = useState<string[]>([])
  const [manual, setManual] = useState<{ label: string; value: string; unit: string }[]>([])
  const [prereq, setPrereq] = useState<Prereq | null>(null)
  const root = `/projects/${project.id}/startup`
  const who = (id: string | null) => (id ? names[id] : undefined) ?? '—'
  const localTime = useLocalTime()  // S10 (E-15b): hora local con su zona, no la UTC del servidor
  const when = (iso: string) => localTime(iso)
  const sysCode = (id: string) => systems.find(s => s.id === id)?.code ?? '—'

  const live = events.filter(e => e.status !== 'voided')
  const milestoneOf = (sys: string, m: Milestone) => live.find(e => e.systemId === sys && e.milestone === m)
  const shownSystems = filter ? systems.filter(s => s.id === filter) : systems.filter(s => live.some(e => e.systemId === s.id))
  const timeline = events.filter(e => !filter || e.systemId === filter)
  const sysSignals = signals.filter(s => s.systemId === form.systemId)
  const gated = form.kind === 'milestone' && GATED_MILESTONES.includes(form.code as Milestone)
  // S25 (E-16): más de 7 días atrás lo registra un líder+ con motivo.
  const backdated = !!form.occurredAt && needsBackdateReason(new Date(form.occurredAt).toISOString())
  const backdateMissing = backdated && form.backdateReason.trim().length < 10
  const blocked = gated && !!prereq && !(prereq.gate_ok && prereq.pssr_ok)
  const already = form.kind === 'milestone' && !!form.systemId && !!milestoneOf(form.systemId, form.code as Milestone)

  // Prerrequisitos solo cuando importan (primer arranque / primer HC).
  useEffect(() => {
    if (!gated || !form.systemId) return
    let alive = true
    void getStartupPrerequisites({ projectId: project.id, systemId: form.systemId }).then(res => { if (alive) setPrereq(res.data ?? null) })
    return () => { alive = false }
  }, [gated, form.systemId, project.id])

  function openForm() {
    setOpen(true); setError(null)
    setForm(f => ({ ...f, occurredAt: f.occurredAt || localNow(), systemId: f.systemId || filter }))
  }
  // La hora local solo existe en el navegador: por eso el formulario se abre después de montar y no en el SSR.
  useEffect(() => {
    if (initialOpen && canRecord) openForm()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])
  function setCode(kind: 'milestone' | 'free', code: string) {
    setForm(f => ({ ...f, kind, code, title: f.title || '' }))
  }
  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await recordStartupEvent({
        projectId: project.id, systemId: form.systemId, kind: form.kind, code: form.code as Milestone | EventCategory,
        occurredAt: new Date(form.occurredAt).toISOString(),
        title: form.title.trim() || (form.kind === 'milestone' ? t(`milestone.${form.code}`) : t(`category.${form.code}`)),
        description: form.description, tagIds: tags.map(x => x.tag_id), runId: form.runId || null, signalIds: sigIds,
        backdateReason: backdated ? form.backdateReason : undefined,
        manual: manual.filter(m => m.label.trim() && m.value.trim()),
      })
      if (res.error || !res.id) { setError(res.error ?? t('error')); return }
      router.push(`${root}/events/${res.id}`)
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1300, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <StartupTabs
        projectId={project.id}
        active="events"
        subtitle={t('events.subtitle')}
        actions={canRecord && <button type="button" style={btn('primary')} onClick={openForm}>+ {t('events.record')}</button>}
      />

      {error && <Alert kind="error">{error}</Alert>}

      {open && canRecord && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={grid}>
            <Field text={t('field.system')} required><SystemSelect value={form.systemId} onChange={v => { setForm({ ...form, systemId: v }); setSigIds([]); setPrereq(null) }} systems={systems} emptyLabel={t('field.pick')} /></Field>
            <Field text={t('events.type')} required>
              <select style={input} value={`${form.kind}:${form.code}`} onChange={e => { const [k, c] = e.target.value.split(':'); setCode(k as 'milestone' | 'free', c); setPrereq(null) }}>
                <optgroup label={t('events.milestones')}>
                  {MILESTONES.map(m => <option key={m} value={`milestone:${m}`}>{t(`milestone.${m}`)}</option>)}
                </optgroup>
                <optgroup label={t('events.free')}>
                  {EVENT_CATEGORIES.map(c => <option key={c} value={`free:${c}`}>{t(`category.${c}`)}</option>)}
                </optgroup>
              </select>
            </Field>
            <Field text={t('events.occurredAt')} required><input type="datetime-local" style={input} value={form.occurredAt} max={localNow()} onChange={e => setForm({ ...form, occurredAt: e.target.value })} /></Field>
            <Field text={t('field.title')}><input style={input} value={form.title} maxLength={200} placeholder={form.kind === 'milestone' ? t(`milestone.${form.code}`) : t(`category.${form.code}`)} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
            {backdated && (
              <Field text={t('events.backdateReason', { days: BACKDATE_DAYS })} wide required>
                <textarea rows={2} style={input} value={form.backdateReason} placeholder={t('events.backdateHint')} onChange={e => setForm({ ...form, backdateReason: e.target.value })} />
              </Field>
            )}
            <Field text={t('events.description')} wide><textarea rows={2} style={input} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
            <Field text={t('events.run')}>
              <select style={input} value={form.runId} onChange={e => setForm({ ...form, runId: e.target.value })}>
                <option value="">—</option>
                {runs.filter(r => !form.systemId || r.system_id === form.systemId).map(r => <option key={r.id} value={r.id}>{r.number} · {t(`runStatus.${r.status}`)}</option>)}
              </select>
            </Field>
          </div>
          {form.kind === 'milestone' && <p style={{ ...small, margin: 0 }}>{t('events.witnessBy', { who: t(`capacity.${milestoneCapacity(form.code as Milestone)}`) })}</p>}
          {already && <Alert kind="warn">{t('events.already')}</Alert>}
          {gated && prereq && blocked && (
            <Alert kind="error">
              {t('events.blocked')}{' '}
              {!prereq.gate_ok && <strong>{t('events.needGate', { gate: prereq.gate_code ?? '?', status: prereq.gate_status })} </strong>}
              {!prereq.pssr_ok && <strong>{t('events.needPssr', { pssr: prereq.pssr_number ?? '—', status: prereq.pssr_status })}</strong>}
            </Alert>
          )}
          {gated && prereq && !blocked && <Alert kind="ok">{t('events.prereqOk', { gate: prereq.gate_code ?? '', pssr: prereq.pssr_number ?? '' })}</Alert>}

          <div>
            <div style={{ ...small, fontWeight: 600, marginBottom: 6 }}>{t('events.signals')}</div>
            {!form.systemId ? <p style={{ ...small, margin: 0 }}>{t('events.pickSystem')}</p> : sysSignals.length === 0 ? <p style={{ ...small, margin: 0 }}>{t('events.noSignals')}</p> : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {sysSignals.map(s => {
                  const on = sigIds.includes(s.id)
                  return (
                    <button key={s.id} type="button" aria-pressed={on} onClick={() => setSigIds(l => (on ? l.filter(x => x !== s.id) : [...l, s.id]))}
                      style={{ ...btn(on ? 'primary' : 'outline'), padding: '4px 10px', fontSize: 'var(--text-xs)' }}>
                      {s.tag}{s.unit ? ` (${s.unit})` : ''}
                    </button>
                  )
                })}
              </div>
            )}
            <p style={{ ...small, margin: '6px 0 0', fontSize: 'var(--text-xs)' }}>{t('events.snapshotHelp')}</p>
          </div>

          <div>
            <div style={{ ...small, fontWeight: 600, marginBottom: 6 }}>{t('events.manual')}</div>
            {manual.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <input aria-label={t('events.param')} placeholder={t('events.param')} style={{ ...input, width: 220 }} value={m.label} onChange={e => setManual(l => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <input aria-label={t('events.value')} placeholder={t('events.value')} style={{ ...input, width: 140 }} value={m.value} onChange={e => setManual(l => l.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <input aria-label={t('events.unit')} placeholder={t('events.unit')} style={{ ...input, width: 100 }} value={m.unit} onChange={e => setManual(l => l.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                <button type="button" style={{ ...btn('outline'), color: 'var(--danger-700)' }} aria-label={t('step.remove')} onClick={() => setManual(l => l.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button type="button" style={btn('outline')} onClick={() => setManual(l => [...l, { label: '', value: '', unit: '' }])}>+ {t('events.addParam')}</button>
          </div>
          <div>
            <div style={{ ...small, fontWeight: 600, marginBottom: 6 }}>{t('field.tags')}</div>
            <TagPicker projectId={project.id} kind="temporary" value={tags} onChange={v => setTags(v.map(x => ({ tag_id: x.tag_id, tag_number: x.tag_number, role: 'subject' as const })))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn('primary', isPending || !form.systemId || !form.occurredAt || blocked || already || backdateMissing)}
              disabled={isPending || !form.systemId || !form.occurredAt || blocked || already || backdateMissing} onClick={submit}>{t('events.save')}</button>
            <button type="button" style={btn('outline')} onClick={() => setOpen(false)}>{t('events.cancel')}</button>
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={small}>{t('field.system')}:</span>
        <div style={{ width: 320 }}><SystemSelect value={filter} onChange={v => setFilter(v)} systems={systems} emptyLabel={t('events.allSystems')} /></div>
      </div>

      {/* Franja de hitos por sistema */}
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>{t('field.system')}</th>{MILESTONES.map(m => <th key={m} style={th}>{t(`milestoneShort.${m}`)}</th>)}</tr></thead>
          <tbody>
            {shownSystems.map(s => (
              <tr key={s.id}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}><strong style={{ fontFamily: 'ui-monospace, monospace' }}>{s.code}</strong></td>
                {MILESTONES.map(m => {
                  const e = milestoneOf(s.id, m)
                  return (
                    <td key={m} style={td} suppressHydrationWarning>
                      {e ? (
                        <Link href={`${root}/events/${e.id}`} style={{ textDecoration: 'none' }}>
                          <Chip tone={EVENT_TONE[e.status]}>{e.status === 'witnessed' ? '✓' : '⏳'} {new Date(e.occurredAt).toLocaleDateString()}</Chip>
                        </Link>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
            {shownSystems.length === 0 && <tr><td colSpan={7} style={{ ...td, ...small, textAlign: 'center', padding: 24 }}>{t('events.noMilestones')}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Línea de tiempo */}
      <section style={{ ...card, padding: 0 }}>
        {timeline.map(e => (
          <div key={e.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', opacity: e.status === 'voided' ? 0.55 : 1 }}>
            <span style={{ ...small, whiteSpace: 'nowrap', minWidth: 150 }} suppressHydrationWarning>{when(e.occurredAt)}</span>
            <Link href={`${root}/events/${e.id}`} style={{ fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace', textDecoration: 'none' }}>{e.number}</Link>
            <Chip tone={e.kind === 'milestone' ? 'violet' : e.category === 'trip' || e.category === 'shutdown' ? 'red' : 'muted'}>
              {e.kind === 'milestone' ? t(`milestone.${e.milestone}`) : t(`category.${e.category}`)}
            </Chip>
            <span style={{ color: 'var(--text-strong)' }}>{e.title}</span>
            <span style={small}>{sysCode(e.systemId)} · {who(e.recordedBy)}{e.params ? ` · ${t('events.paramsN', { n: e.params })}` : ''}</span>
            <span style={{ marginLeft: 'auto' }}><Chip tone={EVENT_TONE[e.status]}>{t(`eventStatus.${e.status}`)}</Chip></span>
          </div>
        ))}
        {timeline.length === 0 && <p style={{ ...small, textAlign: 'center', padding: 24, margin: 0 }}>{t('events.empty')}</p>}
      </section>
    </div>
  )
}
