'use client'

import { useState, useTransition } from 'react'
import {
  createApiKey,
  revokeApiKey,
  API_SCOPES,
  type ApiScope,
} from '@/app/actions/api-keys'

type ApiKey = {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
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

function keyStatus(k: ApiKey): { label: string; color: string; bg: string } {
  if (k.revoked_at) return { label: 'REVOCADA', color: '#b91c1c', bg: '#fef2f2' }
  if (k.expires_at && new Date(k.expires_at) < new Date()) {
    return { label: 'EXPIRADA', color: '#b45309', bg: '#fef3c7' }
  }
  return { label: 'ACTIVA', color: '#047857', bg: '#ecfdf5' }
}

export default function ApiKeysView({ keys: initialKeys }: { keys: ApiKey[] }) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys)
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<{ token: string; name: string; scopes: string[] } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleRevoke = (k: ApiKey) => {
    if (!confirm(`¿Revocar la API key "${k.name}"? Esta acción no se puede deshacer.`)) return
    setError(null)
    startTransition(async () => {
      const res = await revokeApiKey(k.id)
      if (res.error) return setError(res.error)
      setKeys(ks => ks.map(x => x.id === k.id ? { ...x, revoked_at: new Date().toISOString() } : x))
    })
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
            API Keys
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Credenciales para la{' '}
            <a href="/api/v1/openapi" style={{ color: '#3b82f6' }} target="_blank" rel="noreferrer">API pública v1</a>.
            Formato <code>sk_live_...</code> · el token solo se muestra una vez.
          </p>
        </div>
        <button onClick={() => { setCreating(true); setError(null) }} style={btnPrimary}>+ Nueva API key</button>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {keys.length === 0 && (
        <div style={{ padding: 40, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
          No hay API keys. Crea la primera para empezar a usar la API pública.
        </div>
      )}

      {keys.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={th}>Nombre</th>
                <th style={th}>Prefijo</th>
                <th style={th}>Scopes</th>
                <th style={th}>Creada</th>
                <th style={th}>Último uso</th>
                <th style={th}>Expira</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => {
                const st = keyStatus(k)
                return (
                  <tr key={k.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={td}><strong style={{ color: '#0f172a' }}>{k.name}</strong></td>
                    <td style={td}>
                      <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                        {k.key_prefix}…
                      </code>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {k.scopes.map(s => (
                          <span key={s} style={scopePill}>{s}</span>
                        ))}
                      </div>
                    </td>
                    <td style={td}>{fmtDate(k.created_at)}</td>
                    <td style={td}>{fmtDate(k.last_used_at)}</td>
                    <td style={td}>{fmtDate(k.expires_at)}</td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                        background: st.bg, color: st.color, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                      }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {!k.revoked_at && (
                        <button onClick={() => handleRevoke(k)} disabled={isPending} style={btnDanger}>
                          Revocar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateKeyModal
          onClose={() => setCreating(false)}
          onCreated={(k, token) => {
            setKeys(ks => [k, ...ks])
            setJustCreated({ token, name: k.name, scopes: k.scopes })
            setCreating(false)
          }}
        />
      )}

      {justCreated && (
        <TokenRevealModal
          token={justCreated.token}
          name={justCreated.name}
          scopes={justCreated.scopes}
          onClose={() => setJustCreated(null)}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 11,
  fontWeight: 700, color: '#475569',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}
const td: React.CSSProperties = {
  padding: '10px 12px', color: '#334155', verticalAlign: 'middle',
}
const scopePill: React.CSSProperties = {
  display: 'inline-block', padding: '2px 6px', background: '#eff6ff',
  color: '#1d4ed8', borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: 'ui-monospace, monospace',
}

// ──────────────────────────────────────────────────────────────
function CreateKeyModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (k: ApiKey, token: string) => void
}) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiScope[]>(['tags:read'])
  const [expiresAt, setExpiresAt] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const toggleScope = (s: ApiScope) => {
    setScopes(curr =>
      curr.includes(s) ? curr.filter(x => x !== s) : [...curr, s],
    )
  }

  const handleSave = async () => {
    setErr(null)
    setSaving(true)
    const res = await createApiKey({
      name,
      scopes,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
    setSaving(false)
    if (res.error || !res.token || !res.id || !res.keyPrefix) {
      return setErr(res.error ?? 'Error desconocido')
    }
    onCreated(
      {
        id:           res.id,
        name:         name.trim(),
        key_prefix:   res.keyPrefix,
        scopes:       scopes,
        created_at:   new Date().toISOString(),
        last_used_at: null,
        expires_at:   expiresAt ? new Date(expiresAt).toISOString() : null,
        revoked_at:   null,
      },
      res.token,
    )
  }

  return (
    <div style={modalBackdrop}>
      <div style={{ ...modalBox, maxWidth: 560 }}>
        <ModalHeader title="Nueva API key" onClose={onClose} />

        {err && <ModalError msg={err} />}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Nombre</label>
          <input
            style={input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Integración Power BI producción"
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Scopes</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {API_SCOPES.map(s => {
              const checked = scopes.includes(s.value)
              return (
                <label
                  key={s.value}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                    background: checked ? '#eff6ff' : '#f8fafc',
                    border: checked ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleScope(s.value)}
                    style={{ marginTop: 2 }}
                  />
                  <div style={{ fontSize: 12 }}>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#0f172a' }}>{s.label}</div>
                    <div style={{ color: '#64748b', marginTop: 1, fontSize: 11 }}>{s.description}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Fecha de expiración (opcional)</label>
          <input
            style={input}
            type="date"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
          />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            Vacío = la key nunca expira (solo se invalida al revocar).
          </div>
        </div>

        <ModalActions
          saving={saving}
          canSave={name.trim().length > 0 && scopes.length > 0}
          onCancel={onClose}
          onSave={handleSave}
          saveLabel="Crear key"
        />
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
function TokenRevealModal({
  token, name, scopes, onClose,
}: {
  token: string
  name: string
  scopes: string[]
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
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
          🔑 Tu API key está lista
        </h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
          <strong>{name}</strong> · scopes: {scopes.join(', ')}
        </p>

        <div style={{
          padding: 14, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8,
          fontSize: 13, color: '#92400e', marginBottom: 16,
        }}>
          <strong>⚠️ Copia esta key ahora.</strong> No podrás verla de nuevo — solo guardamos el hash.
          Si la pierdes, revoca esta key y crea una nueva.
        </div>

        <label style={labelStyle}>API key</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            readOnly
            value={token}
            style={{ ...input, fontFamily: 'ui-monospace, monospace', fontSize: 12, background: '#f8fafc' }}
            onFocus={e => e.currentTarget.select()}
          />
          <button
            onClick={copy}
            style={{ ...btnPrimary, minWidth: 100, background: copied ? '#10b981' : '#3b82f6' }}
          >
            {copied ? '✓ Copiada' : 'Copiar'}
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#475569', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Uso:</div>
          <pre style={{
            background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 6,
            fontSize: 11, overflow: 'auto', margin: 0,
          }}>
{`curl https://commup.app/api/v1/tags?project_id=<uuid> \\
  -H "Authorization: Bearer ${token.substring(0, 20)}…"`}
          </pre>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569', marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
          />
          He guardado la key en un lugar seguro
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
