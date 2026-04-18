'use client'

import { useState, useTransition, useMemo } from 'react'
import {
  createWebhookSubscription,
  setWebhookEnabled,
  deleteWebhookSubscription,
  WEBHOOK_EVENT_TYPES,
} from '@/app/actions/webhooks'

type Sub = {
  id: string
  name: string
  endpoint_url: string
  project_id: string | null
  event_types: string[]
  enabled: boolean
  created_at: string
  last_success_at: string | null
  last_error_at: string | null
  failure_count: number
}

type Project = { id: string; name: string }

type DeliveryStatus = 'pending' | 'delivered' | 'abandoned'
type Delivery = {
  id: string
  subscription_id: string
  domain_event_id: string
  status: string
  attempts: number
  next_retry_at: string
  last_response_code: number | null
  delivered_at: string | null
  created_at: string
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 14px', background: '#3b82f6', color: 'white',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnOutline: React.CSSProperties = {
  padding: '6px 12px', background: 'white', color: '#475569',
  border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const btnDanger: React.CSSProperties = {
  padding: '6px 12px', background: '#fef2f2', color: '#b91c1c',
  border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
  fontFamily: 'inherit', width: '100%', background: 'white',
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#475569',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block',
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function statusColors(st: string): { fg: string; bg: string } {
  if (st === ('delivered' satisfies DeliveryStatus)) return { fg: '#047857', bg: '#ecfdf5' }
  if (st === ('abandoned' satisfies DeliveryStatus)) return { fg: '#b91c1c', bg: '#fef2f2' }
  return { fg: '#b45309', bg: '#fef3c7' }
}

export default function WebhooksView({
  subs: initialSubs,
  projects,
  deliveries,
}: {
  subs: Sub[]
  projects: Project[]
  deliveries: Delivery[]
}) {
  const [subs, setSubs] = useState<Sub[]>(initialSubs)
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<{ secret: string; name: string } | null>(null)
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const projectsById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of projects) m[p.id] = p.name
    return m
  }, [projects])

  const deliveriesBySub = useMemo(() => {
    const m: Record<string, Delivery[]> = {}
    for (const d of deliveries) {
      const arr = (m[d.subscription_id] ??= [])
      if (arr.length < 50) arr.push(d)
    }
    return m
  }, [deliveries])

  const handleToggle = (s: Sub) => {
    setError(null)
    startTransition(async () => {
      const res = await setWebhookEnabled(s.id, !s.enabled)
      if (res.error) return setError(res.error)
      setSubs(ss => ss.map(x => x.id === s.id ? { ...x, enabled: !x.enabled } : x))
    })
  }

  const handleDelete = (s: Sub) => {
    if (!confirm(`¿Eliminar la subscription "${s.name}"? También se eliminarán sus deliveries pendientes.`)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteWebhookSubscription(s.id)
      if (res.error) return setError(res.error)
      setSubs(ss => ss.filter(x => x.id !== s.id))
      if (expandedSubId === s.id) setExpandedSubId(null)
    })
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Webhooks
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Endpoints HTTPS que reciben eventos de dominio en tiempo real. Firmados con HMAC-SHA256 en{' '}
            <code>X-CommUp-Signature</code>. Reintentos automáticos con backoff exponencial.
          </p>
        </div>
        <button onClick={() => { setCreating(true); setError(null) }} style={btnPrimary}>+ Nueva subscription</button>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {subs.length === 0 && (
        <div style={{ padding: 40, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
          No hay subscriptions. Crea la primera para empezar a recibir eventos.
        </div>
      )}

      {subs.map(s => {
        const isExpanded = expandedSubId === s.id
        const subDeliveries = deliveriesBySub[s.id] ?? []
        return (
          <div key={s.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <button
                onClick={() => handleToggle(s)}
                disabled={isPending}
                title={s.enabled ? 'Desactivar' : 'Activar'}
                style={{
                  width: 32, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', flexShrink: 0,
                  background: s.enabled ? '#10b981' : '#cbd5e1', position: 'relative', padding: 0,
                }}
              >
                <div style={{
                  position: 'absolute', top: 2, left: s.enabled ? 16 : 2,
                  width: 14, height: 14, borderRadius: '50%', background: 'white',
                  transition: 'left 0.15s',
                }} />
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {s.name}
                  {s.project_id
                    ? <span style={{ fontSize: 10, fontWeight: 600, background: '#eff6ff', color: '#1d4ed8', padding: '2px 6px', borderRadius: 4 }}>
                        proyecto: {projectsById[s.project_id] ?? s.project_id.slice(0, 8)}
                      </span>
                    : <span style={{ fontSize: 10, fontWeight: 600, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4 }}>
                        todos los proyectos
                      </span>
                  }
                  {s.failure_count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, background: '#fef2f2', color: '#b91c1c', padding: '2px 6px', borderRadius: 4 }}>
                      {s.failure_count} fallos
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.endpoint_url}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>eventos: <strong style={{ color: '#475569' }}>{s.event_types.join(', ')}</strong></span>
                  <span>último OK: <strong style={{ color: '#475569' }}>{fmtDate(s.last_success_at)}</strong></span>
                  <span>último error: <strong style={{ color: s.last_error_at ? '#b91c1c' : '#475569' }}>{fmtDate(s.last_error_at)}</strong></span>
                </div>
              </div>

              <button
                onClick={() => setExpandedSubId(isExpanded ? null : s.id)}
                style={btnOutline}
              >
                {isExpanded ? 'Ocultar' : `Deliveries (${subDeliveries.length})`}
              </button>
              <button onClick={() => handleDelete(s)} disabled={isPending} style={btnDanger}>Eliminar</button>
            </div>

            {isExpanded && (
              <DeliveriesTable deliveries={subDeliveries} />
            )}
          </div>
        )
      })}

      {creating && (
        <CreateSubscriptionModal
          projects={projects}
          onClose={() => setCreating(false)}
          onCreated={(s, secret) => {
            setSubs(ss => [s, ...ss])
            setJustCreated({ secret, name: s.name })
            setCreating(false)
          }}
        />
      )}

      {justCreated && (
        <SecretRevealModal
          secret={justCreated.secret}
          name={justCreated.name}
          onClose={() => setJustCreated(null)}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
function DeliveriesTable({ deliveries }: { deliveries: Delivery[] }) {
  if (deliveries.length === 0) {
    return (
      <div style={{ padding: 20, borderTop: '1px solid #f1f5f9', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
        Sin deliveries registradas aún.
      </div>
    )
  }

  return (
    <div style={{ borderTop: '1px solid #f1f5f9', maxHeight: 340, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
          <tr>
            <th style={th}>Estado</th>
            <th style={th}>Creada</th>
            <th style={th}>Entregada</th>
            <th style={th}>Intentos</th>
            <th style={th}>Siguiente retry</th>
            <th style={th}>HTTP</th>
            <th style={th}>Event ID</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map(d => {
            const c = statusColors(d.status)
            return (
              <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={td}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                    background: c.bg, color: c.fg, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                  }}>
                    {d.status.toUpperCase()}
                  </span>
                </td>
                <td style={td}>{fmtDate(d.created_at)}</td>
                <td style={td}>{fmtDate(d.delivered_at)}</td>
                <td style={td}>{d.attempts}</td>
                <td style={td}>{d.status === 'pending' ? fmtDate(d.next_retry_at) : '—'}</td>
                <td style={td}>
                  {d.last_response_code ? (
                    <code style={{
                      background: d.last_response_code >= 200 && d.last_response_code < 300 ? '#ecfdf5' : '#fef2f2',
                      color:      d.last_response_code >= 200 && d.last_response_code < 300 ? '#047857' : '#b91c1c',
                      padding: '1px 6px', borderRadius: 4, fontSize: 11,
                    }}>
                      {d.last_response_code}
                    </code>
                  ) : '—'}
                </td>
                <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#64748b' }}>
                  {d.domain_event_id.slice(0, 8)}…
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
const th: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontSize: 10,
  fontWeight: 700, color: '#475569',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}
const td: React.CSSProperties = {
  padding: '8px 12px', color: '#334155', verticalAlign: 'middle',
}

// ──────────────────────────────────────────────────────────────
function CreateSubscriptionModal({
  projects, onClose, onCreated,
}: {
  projects: Project[]
  onClose: () => void
  onCreated: (s: Sub, secret: string) => void
}) {
  const [name, setName] = useState('')
  const [endpointUrl, setEndpointUrl] = useState('https://')
  const [projectId, setProjectId] = useState<string>('')
  const [eventTypes, setEventTypes] = useState<string[]>(['*'])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const toggleEvent = (v: string) => {
    setEventTypes(curr => {
      if (v === '*') return ['*']
      const without = curr.filter(x => x !== '*')
      return without.includes(v) ? without.filter(x => x !== v) : [...without, v]
    })
  }

  const handleSave = async () => {
    setErr(null)
    setSaving(true)
    const res = await createWebhookSubscription({
      name,
      endpointUrl,
      projectId: projectId || null,
      eventTypes,
    })
    setSaving(false)
    if (res.error || !res.id || !res.secret) {
      return setErr(res.error ?? 'Error desconocido')
    }
    onCreated(
      {
        id:              res.id,
        name:            name.trim(),
        endpoint_url:    endpointUrl.trim(),
        project_id:      projectId || null,
        event_types:     eventTypes,
        enabled:         true,
        created_at:      new Date().toISOString(),
        last_success_at: null,
        last_error_at:   null,
        failure_count:   0,
      },
      res.secret,
    )
  }

  const canSave = name.trim().length > 0 && endpointUrl.startsWith('https://') && endpointUrl.length > 10 && eventTypes.length > 0

  return (
    <div style={modalBackdrop}>
      <div style={{ ...modalBox, maxWidth: 620 }}>
        <ModalHeader title="Nueva subscription" onClose={onClose} />

        {err && <ModalError msg={err} />}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Nombre</label>
          <input
            style={input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: SAP integration webhook"
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Endpoint URL (https)</label>
          <input
            style={{ ...input, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            value={endpointUrl}
            onChange={e => setEndpointUrl(e.target.value)}
            placeholder="https://api.tuservicio.com/commup/hook"
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Proyecto (opcional)</label>
          <select
            style={input}
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
          >
            <option value="">Todos los proyectos del org</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Event types</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, maxHeight: 220, overflow: 'auto', padding: 2 }}>
            {WEBHOOK_EVENT_TYPES.map(ev => {
              const checked = eventTypes.includes(ev.value)
              return (
                <label
                  key={ev.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                    background: checked ? '#eff6ff' : '#f8fafc',
                    border: checked ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                    fontSize: 12, fontFamily: 'ui-monospace, monospace',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleEvent(ev.value)}
                  />
                  {ev.label}
                </label>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            Seleccionar <code>*</code> incluye todos los eventos actuales y futuros.
          </div>
        </div>

        <ModalActions
          saving={saving}
          canSave={canSave}
          onCancel={onClose}
          onSave={handleSave}
          saveLabel="Crear subscription"
        />
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
function SecretRevealModal({
  secret, name, onClose,
}: {
  secret: string
  name: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // noop
    }
  }

  return (
    <div style={modalBackdrop}>
      <div style={{ ...modalBox, maxWidth: 640 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>
          🔐 Secret del webhook
        </h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
          Subscription: <strong>{name}</strong>
        </p>

        <div style={{
          padding: 14, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8,
          fontSize: 13, color: '#92400e', marginBottom: 16,
        }}>
          <strong>⚠️ Copia este secret ahora.</strong> No podrás verlo de nuevo. Lo necesitas en tu servidor
          para verificar la firma <code>X-CommUp-Signature</code>.
        </div>

        <label style={labelStyle}>Secret (signing key)</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            readOnly
            value={secret}
            style={{ ...input, fontFamily: 'ui-monospace, monospace', fontSize: 12, background: '#f8fafc' }}
            onFocus={e => e.currentTarget.select()}
          />
          <button
            onClick={copy}
            style={{ ...btnPrimary, minWidth: 100, background: copied ? '#10b981' : '#3b82f6' }}
          >
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#475569', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Verificación de firma (Node.js):</div>
          <pre style={{
            background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 6,
            fontSize: 11, overflow: 'auto', margin: 0,
          }}>
{`import crypto from 'crypto'

const sig = req.headers['x-commup-signature'] // "sha256=<hex>"
const expected = 'sha256=' + crypto
  .createHmac('sha256', process.env.COMMUP_WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex')

if (sig !== expected) return res.status(401).end()`}
          </pre>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569', marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
          />
          He guardado el secret en un lugar seguro
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={!confirmed}
            style={{ ...btnPrimary, opacity: confirmed ? 1 : 0.5 }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: 40, zIndex: 100, overflow: 'auto',
}
const modalBox: React.CSSProperties = {
  background: 'white', borderRadius: 10, width: '100%', padding: 24,
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0f172a' }}>{title}</h2>
      <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b' }}>×</button>
    </div>
  )
}

function ModalError({ msg }: { msg: string }) {
  return (
    <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 13, marginBottom: 14 }}>
      {msg}
    </div>
  )
}

function ModalActions({
  saving, canSave, onCancel, onSave, saveLabel,
}: {
  saving: boolean
  canSave: boolean
  onCancel: () => void
  onSave: () => void
  saveLabel: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
      <button onClick={onCancel} style={btnOutline} disabled={saving}>Cancelar</button>
      <button
        onClick={onSave}
        style={{ ...btnPrimary, opacity: canSave && !saving ? 1 : 0.5 }}
        disabled={saving || !canSave}
      >
        {saving ? 'Guardando…' : saveLabel}
      </button>
    </div>
  )
}
