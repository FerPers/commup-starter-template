'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addSystemDependency, removeSystemDependency, setSystemBoundaryFrozen, updateSystem } from '@/app/actions/systems'
import {
  BATTERY_LIMIT_KEYS,
  DEPENDENCY_KINDS,
  PRIORITIES,
  SYSTEM_TYPES,
  defaultDependencyGates,
  type BatteryLimits,
  type DependencyKind,
  type SystemType,
} from '@/lib/systems/dependencies'

export type DependencyRow = {
  id: string
  kind: DependencyKind
  notes: string | null
  source: 'manual' | 'import' | 'ai'
  other: { id: string; code: string; name: string }
  required: string
  blocked: string
}

export type BoundaryEvent = {
  id: string
  action: 'boundary_frozen' | 'boundary_unfrozen' | 'boundary_changed_after_freeze'
  payload: { op?: string; entity?: string; entity_code?: string } | null
  created_at: string
}

type Gate = { id: string; code: string; name: string; order_index: number; is_active: boolean }

type Props = {
  project: { id: string; code: string; name: string }
  system: {
    id: string
    code: string
    name: string
    area: string
    system_type: SystemType | null
    priority: number | null
    battery_limits: BatteryLimits
    frozenAt: string | null
    frozenBy: string | null
    subsystems: number
    tags: number
  }
  dependsOn: DependencyRow[]
  enables: DependencyRow[]
  otherSystems: { id: string; code: string; name: string }[]
  gates: Gate[]
  events: BoundaryEvent[]
  canEdit: boolean
  /** N2a: pestaña de la ficha única que se pinta (Datos del sistema o Dependencias). */
  section: 'data' | 'deps'
}

const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }
const h2: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 12px' }
const label: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 'var(--text-sm)', background: 'var(--card-bg)', color: 'var(--text-strong)', boxSizing: 'border-box',
}
const btn = (variant: 'primary' | 'outline' | 'danger'): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
  border: variant === 'outline' ? '1px solid var(--border)' : 'none',
  background: variant === 'primary' ? 'var(--primary-500)' : variant === 'danger' ? 'var(--danger-500)' : 'transparent',
  color: variant === 'outline' ? 'var(--text-strong)' : '#fff',
})

export default function SystemDetailView({ project, system, dependsOn, enables, otherSystems, gates, events, canEdit, section }: Props) {
  const t = useTranslations('Systems')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const [name, setName] = useState(system.name)
  const [systemType, setSystemType] = useState<SystemType | ''>(system.system_type ?? '')
  const [priority, setPriority] = useState<string>(system.priority ? String(system.priority) : '')
  const [limits, setLimits] = useState<BatteryLimits>(system.battery_limits)

  const [providerId, setProviderId] = useState('')
  const [kind, setKind] = useState<DependencyKind>('utility')
  const defaults = useMemo(() => defaultDependencyGates(kind, gates), [kind, gates])
  const [requiredGateId, setRequiredGateId] = useState(defaults?.requiredGateId ?? '')
  const [blockedGateId, setBlockedGateId] = useState(defaults?.blockedGateId ?? '')
  const [depNotes, setDepNotes] = useState('')

  // El aviso vive arriba y el formulario de dependencias más abajo: llevarlo a la vista.
  const alertRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (error) alertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [error])

  const base = { projectId: project.id, systemId: system.id }
  const linked = new Set(dependsOn.map(d => d.other.id))

  function run(fn: () => Promise<{ error?: string }>, okMessage?: string, after?: () => void) {
    setError(null); setSaved(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      if (okMessage) setSaved(okMessage)
      after?.()
      router.refresh()
    })
  }

  function changeKind(k: DependencyKind) {
    setKind(k)
    const d = defaultDependencyGates(k, gates)
    setRequiredGateId(d?.requiredGateId ?? '')
    setBlockedGateId(d?.blockedGateId ?? '')
  }

  function saveAttributes() {
    run(() => updateSystem({
      ...base, name, system_type: systemType || null, priority: priority ? Number(priority) : null,
    }), t('detail.saved'))
  }

  function saveLimits() {
    run(() => updateSystem({ ...base, battery_limits: limits }), t('detail.saved'))
  }

  function toggleFrozen() {
    const frozen = !system.frozenAt
    if (!window.confirm(frozen ? t('detail.freezeConfirm') : t('detail.unfreezeConfirm'))) return
    run(() => setSystemBoundaryFrozen({ ...base, frozen }))
  }

  function addDependency() {
    if (!providerId) return
    run(
      () => addSystemDependency({ ...base, providerId, kind, requiredGateId, blockedGateId, notes: depNotes }),
      undefined,
      () => { setProviderId(''); setDepNotes('') },
    )
  }

  function removeDependency(d: DependencyRow) {
    if (!window.confirm(t('detail.removeConfirm', { code: d.other.code }))) return
    run(() => removeSystemDependency({ ...base, dependencyId: d.id }))
  }

  const eventText = (e: BoundaryEvent) => {
    if (e.action !== 'boundary_changed_after_freeze') return t(`event.${e.action}`)
    return t('event.changed', {
      op: t(`event.op.${e.payload?.op ?? 'UPDATE'}`),
      entity: t(`event.entity.${e.payload?.entity ?? 'tag'}`),
      code: e.payload?.entity_code ?? '',
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div ref={alertRef} role="alert" style={{ padding: '10px 14px', background: 'var(--danger-50)', border: '1px solid #fecaca', borderRadius: 8, color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>{error}</div>}
      {saved && <div role="status" style={{ padding: '10px 14px', background: 'var(--success-50)', border: '1px solid #a7f3d0', borderRadius: 8, color: 'var(--success-700)', fontSize: 'var(--text-sm)' }}>{saved}</div>}

      {section === 'data' && <>
      <p style={{ ...small, margin: 0 }}>{t('detail.scope', { subsystems: system.subsystems, tags: system.tags })}</p>

      {/* Atributos */}
      <section style={card} aria-labelledby="sys-attrs">
        <h2 id="sys-attrs" style={h2}>{t('detail.attributes')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={label}>{t('detail.name')}</span>
            <input style={input} value={name} disabled={!canEdit} onChange={e => setName(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={label}>{t('col.type')}</span>
            <select style={input} value={systemType} disabled={!canEdit} onChange={e => setSystemType(e.target.value as SystemType | '')}>
              <option value="">{t('noType')}</option>
              {SYSTEM_TYPES.map(ty => <option key={ty} value={ty}>{t(`type.${ty}`)}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={label}>{t('col.priority')}</span>
            <select style={input} value={priority} disabled={!canEdit} onChange={e => setPriority(e.target.value)}>
              <option value="">—</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </select>
          </label>
        </div>
        <p style={{ ...small, margin: '10px 0 0' }}>{t('detail.typeHelp')}</p>
        {canEdit && <div style={{ marginTop: 12 }}><button type="button" style={btn('primary')} disabled={isPending} onClick={saveAttributes}>{t('detail.save')}</button></div>}
      </section>

      {/* Límites de batería + congelamiento */}
      <section style={card} aria-labelledby="sys-limits">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <h2 id="sys-limits" style={h2}>{t('detail.limits')}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ ...small, fontWeight: 600, color: system.frozenAt ? '#1d4ed8' : 'var(--text-muted)' }}>
              {system.frozenAt
                ? `🔒 ${t('detail.frozenInfo', { who: system.frozenBy ?? t('detail.someone'), when: new Date(system.frozenAt).toLocaleString() })}`
                : t('detail.notFrozen')}
            </span>
            {canEdit && <button type="button" style={btn('outline')} disabled={isPending} onClick={toggleFrozen}>{system.frozenAt ? t('detail.unfreeze') : t('detail.freeze')}</button>}
          </div>
        </div>
        <p style={{ ...small, margin: '0 0 12px' }}>{t('detail.limitsHelp')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {BATTERY_LIMIT_KEYS.map(k => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>{t(`limit.${k}`)}</span>
              <textarea rows={2} style={input} value={limits[k] ?? ''} disabled={!canEdit} placeholder={t(`limitPlaceholder.${k}`)}
                onChange={e => setLimits(s => ({ ...s, [k]: e.target.value }))} />
            </label>
          ))}
        </div>
        {canEdit && <div style={{ marginTop: 12 }}><button type="button" style={btn('primary')} disabled={isPending} onClick={saveLimits}>{t('detail.saveLimits')}</button></div>}

        {events.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ ...label, marginBottom: 6 }}>{t('detail.history')}</div>
            <ul style={{ margin: 0, paddingLeft: 18, ...small, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {events.map(e => (
                <li key={e.id} style={{ color: e.action === 'boundary_changed_after_freeze' ? '#b45309' : undefined }}>
                  {new Date(e.created_at).toLocaleString()} — {eventText(e)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      </>}

      {section === 'deps' && <>
      {/* Depende de */}
      <section style={card} aria-labelledby="sys-deps">
        <h2 id="sys-deps" style={h2}>{t('detail.dependsOn')}</h2>
        <p style={{ ...small, margin: '0 0 12px' }}>{t('detail.dependsOnHelp')}</p>
        <DependencyList rows={dependsOn} projectId={project.id} canRemove={canEdit} onRemove={removeDependency} pending={isPending} emptyText={t('detail.noDependsOn')} direction="dependsOn" />

        {canEdit && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>{t('detail.provider')}</span>
              <select style={input} value={providerId} onChange={e => setProviderId(e.target.value)}>
                <option value="">{t('detail.choose')}</option>
                {otherSystems.filter(s => !linked.has(s.id)).map(s => (
                  <option key={s.id} value={s.id}>{s.code}{s.name !== s.code ? ` — ${s.name}` : ''}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>{t('detail.kind')}</span>
              <select style={input} value={kind} onChange={e => changeKind(e.target.value as DependencyKind)}>
                {DEPENDENCY_KINDS.map(k => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>{t('detail.requiredGate')}</span>
              <select style={input} value={requiredGateId} onChange={e => setRequiredGateId(e.target.value)}>
                {gates.map(g => <option key={g.id} value={g.id}>{g.code}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>{t('detail.blockedGate')}</span>
              <select style={input} value={blockedGateId} onChange={e => setBlockedGateId(e.target.value)}>
                {gates.map(g => <option key={g.id} value={g.id}>{g.code}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: 'span 2' }}>
              <span style={label}>{t('detail.notes')}</span>
              <input style={input} value={depNotes} maxLength={1000} onChange={e => setDepNotes(e.target.value)} placeholder={t('detail.notesPlaceholder')} />
            </label>
            <div>
              <button type="button" style={btn('primary')} disabled={isPending || !providerId || !requiredGateId || !blockedGateId} onClick={addDependency}>{t('detail.add')}</button>
            </div>
            {providerId && (
              <p style={{ ...small, margin: 0, gridColumn: '1 / -1' }}>
                {t('detail.addPreview', {
                  system: system.code,
                  provider: otherSystems.find(s => s.id === providerId)?.code ?? '',
                  required: gates.find(g => g.id === requiredGateId)?.code ?? '?',
                  blocked: gates.find(g => g.id === blockedGateId)?.code ?? '?',
                })}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Habilita a */}
      <section style={card} aria-labelledby="sys-enables">
        <h2 id="sys-enables" style={h2}>{t('detail.enables')}</h2>
        <p style={{ ...small, margin: '0 0 12px' }}>{t('detail.enablesHelp')}</p>
        <DependencyList rows={enables} projectId={project.id} canRemove={false} pending={isPending} emptyText={t('detail.noEnables')} direction="enables" />
      </section>
      </>}
    </div>
  )
}

function DependencyList({ rows, projectId, canRemove, onRemove, pending, emptyText, direction }: {
  rows: DependencyRow[]
  projectId: string
  canRemove: boolean
  onRemove?: (d: DependencyRow) => void
  pending: boolean
  emptyText: string
  direction: 'dependsOn' | 'enables'
}) {
  const t = useTranslations('Systems')
  if (!rows.length) return <div style={{ ...small }}>{emptyText}</div>
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(d => (
        <li key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 'var(--text-sm)' }}>
              <Link href={`/projects/${projectId}/systems/${d.other.id}`} style={{ color: 'inherit' }}>{d.other.code}</Link>
              {d.other.name && d.other.name !== d.other.code && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> — {d.other.name}</span>}
              <span style={{ marginLeft: 8, fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>{t(`kind.${d.kind}`)}</span>
              {d.source !== 'manual' && <span style={{ marginLeft: 6, fontSize: 'var(--text-xs)', color: 'var(--gray-400)' }}>· {t(`source.${d.source}`)}</span>}
            </span>
            <span style={small}>{t(direction === 'dependsOn' ? 'detail.ruleDependsOn' : 'detail.ruleEnables', { required: d.required, blocked: d.blocked })}</span>
            {d.notes && <span style={{ ...small, fontStyle: 'italic' }}>{d.notes}</span>}
          </div>
          {canRemove && onRemove && <button type="button" style={btn('outline')} disabled={pending} onClick={() => onRemove(d)}>{t('detail.remove')}</button>}
        </li>
      ))}
    </ul>
  )
}
