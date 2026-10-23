'use client'

import { useLocale, useTranslations } from 'next-intl'

import { useId, useState, useTransition } from 'react'
import { createApiKey, revokeApiKey } from '@/app/actions/api-keys'
import { API_SCOPES, type ApiScope } from '@/lib/constants/api-scopes'
import { useAskDialog } from '@/components/ui/AskDialog'
import { DialogSurface } from '@/components/ui/dialog-a11y'
import { ink } from '@/lib/theme'

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
  padding: '8px 14px', background: 'var(--primary-600)', color: '#fff',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnOutline: React.CSSProperties = {
  padding: '6px 12px', background: 'var(--card-bg)', color: 'var(--text-muted)',
  border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const btnDanger: React.CSSProperties = {
  padding: '6px 12px', background: 'var(--danger-50)', color: 'var(--danger-700)',
  border: '1px solid var(--danger-200)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13,
  fontFamily: 'inherit', width: '100%', background: 'var(--card-bg)',
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block',
}

function fmtDate(s: string | null, locale: string): string {
  if (!s) return '—'
  return new Date(s).toLocaleString(locale === 'en' ? 'en-US' : 'es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function keyStatus(k: ApiKey): { status: 'revoked' | 'expired' | 'active'; color: string; bg: string } {
  if (k.revoked_at) return { status: 'revoked', color: 'var(--danger-700)', bg: 'var(--danger-50)' }
  if (k.expires_at && new Date(k.expires_at) < new Date()) {
    return { status: 'expired', color: 'var(--warning-700)', bg: 'var(--warning-100)' }
  }
  return { status: 'active', color: 'var(--success-700)', bg: 'var(--success-50)' }
}

// Clave i18n de la descripción de un scope (los códigos ':' y '*' no van en la clave).
function scopeKey(s: ApiScope): 'tags_read' | 'tags_write' | 'itrs_read' | 'itrs_write' | 'punches_read' | 'punches_write' | 'certificates_read' | 'systems_read' | 'events_read' | 'all' {
  return s === '*' ? 'all' : (s.replace(':', '_') as 'tags_read')
}

export default function ApiKeysView({ keys: initialKeys }: { keys: ApiKey[] }) {
  // N0 (H-13): título = etiqueta del menú.
  const tNav = useTranslations('Sidebar.nav')
  const tx = useTranslations('ApiKeys')
  const locale = useLocale()
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys)
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<{ token: string; name: string; scopes: string[] } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { dialog, confirm } = useAskDialog() // G-08: diálogo propio

  const handleRevoke = async (k: ApiKey) => {
    if (!(await confirm({ message: tx('revokeConfirm', { name: k.name }), confirmLabel: tx('revoke'), danger: true }))) return
    setError(null)
    startTransition(async () => {
      const res = await revokeApiKey(k.id)
      if (res.error) return setError(res.error)
      setKeys(ks => ks.map(x => x.id === k.id ? { ...x, revoked_at: new Date().toISOString() } : x))
    })
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {dialog}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
            {tNav('apiKeys')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {tx.rich('subtitle', {
              api: c => <a href="/api/v1/openapi" style={{ color: 'var(--primary-700)' }} target="_blank" rel="noreferrer">{c}</a>,
              code: c => <code>{c}</code>,
            })}
          </p>
        </div>
        <button onClick={() => { setCreating(true); setError(null) }} style={btnPrimary}>{tx('newKey')}</button>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'var(--danger-50)', border: '1px solid var(--danger-200)', borderRadius: 6, color: 'var(--danger-700)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {keys.length === 0 && (
        <div style={{ padding: 40, background: 'var(--gray-50)', border: '1px dashed var(--gray-300)', borderRadius: 8, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          {tx('empty')}
        </div>
      )}

      {keys.length > 0 && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                <th style={th}>{tx('col.name')}</th>
                <th style={th}>{tx('col.prefix')}</th>
                <th style={th}>{tx('col.scopes')}</th>
                <th style={th}>{tx('col.created')}</th>
                <th style={th}>{tx('col.lastUsed')}</th>
                <th style={th}>{tx('col.expires')}</th>
                <th style={th}>{tx('col.status')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{tx('col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => {
                const st = keyStatus(k)
                return (
                  <tr key={k.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                    <td style={td}><strong style={{ color: 'var(--text-strong)' }}>{k.name}</strong></td>
                    <td style={td}>
                      <code style={{ background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
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
                    <td style={td}>{fmtDate(k.created_at, locale)}</td>
                    <td style={td}>{fmtDate(k.last_used_at, locale)}</td>
                    <td style={td}>{fmtDate(k.expires_at, locale)}</td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                        background: st.bg, color: ink(st.color), fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                      }}>
                        {tx(`status.${st.status}`)}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {!k.revoked_at && (
                        <button onClick={() => handleRevoke(k)} disabled={isPending} style={btnDanger}>
                          {tx('revoke')}
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
  fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}
const td: React.CSSProperties = {
  padding: '10px 12px', color: 'var(--text-body)', verticalAlign: 'middle',
}
const scopePill: React.CSSProperties = {
  display: 'inline-block', padding: '2px 6px', background: 'var(--primary-50)',
  color: 'var(--primary-700)', borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: 'ui-monospace, monospace',
}

// ──────────────────────────────────────────────────────────────
function CreateKeyModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (k: ApiKey, token: string) => void
}) {
  const tx = useTranslations('ApiKeys')
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiScope[]>(['tags:read'])
  const [expiresAt, setExpiresAt] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const titleId = useId()
  const uid = useId()

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
      return setErr(res.error ?? tx('unknownError'))
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
      <DialogSurface onClose={saving ? undefined : onClose} labelledBy={titleId} style={{ ...modalBox, maxWidth: 560 }}>
        <ModalHeader id={titleId} title={tx('create.title')} onClose={onClose} />

        {err && <ModalError msg={err} />}

        <div style={{ marginBottom: 14 }}>
          <label htmlFor={`${uid}-name`} style={labelStyle}>{tx('create.name')}</label>
          <input
            id={`${uid}-name`}
            style={input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={tx('create.namePlaceholder')}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={labelStyle}>{tx('create.scopes')}</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {API_SCOPES.map(s => {
              const checked = scopes.includes(s.value)
              return (
                <label
                  key={s.value}
                  style={{
                    display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'start', columnGap: 8,
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    background: checked ? 'var(--primary-50)' : 'var(--gray-50)',
                    border: checked ? '1px solid var(--primary-300)' : '1px solid var(--border)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleScope(s.value)}
                    style={{ marginTop: 2, gridRow: 'span 2' }}
                  />
                  <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: 'var(--text-strong)' }}>{s.label}</div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 1, fontSize: 11 }}>{tx(`scope.${scopeKey(s.value)}`)}</div>
                </label>
              )
            })}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label htmlFor={`${uid}-expiry`} style={labelStyle}>{tx('create.expiry')}</label>
          <input
            id={`${uid}-expiry`}
            style={input}
            type="date"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {tx('create.expiryHint')}
          </div>
        </div>

        <ModalActions
          saving={saving}
          canSave={name.trim().length > 0 && scopes.length > 0}
          onCancel={onClose}
          onSave={handleSave}
          saveLabel={tx('create.submit')}
        />
      </DialogSurface>
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
  const tx = useTranslations('ApiKeys')
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const titleId = useId()
  const uid = useId()

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
      <DialogSurface onClose={confirmed ? onClose : undefined} labelledBy={titleId} style={{ ...modalBox, maxWidth: 640 }}>
        <h2 id={titleId} style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-strong)' }}>
          {tx('reveal.title')}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          <strong>{name}</strong> · {tx('reveal.scopesLine', { scopes: scopes.join(', ') })}
        </p>

        <div style={{
          padding: 14, background: 'var(--warning-50)', border: '1px solid var(--warning-300)', borderRadius: 8,
          fontSize: 13, color: 'var(--warning-800)', marginBottom: 16,
        }}>
          {tx.rich('reveal.warning', { strong: c => <strong>{c}</strong> })}
        </div>

        <label htmlFor={`${uid}-token`} style={labelStyle}>{tx('reveal.label')}</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            id={`${uid}-token`}
            readOnly
            value={token}
            style={{ ...input, fontFamily: 'ui-monospace, monospace', fontSize: 12, background: 'var(--gray-50)' }}
            onFocus={e => e.currentTarget.select()}
          />
          <button
            onClick={copy}
            style={{ ...btnPrimary, minWidth: 100, background: copied ? 'var(--success-500)' : 'var(--primary-600)' }}
          >
            {copied ? tx('reveal.copied') : tx('reveal.copy')}
          </button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tx('reveal.usage')}</div>
          <pre style={{
            background: 'var(--gray-900)', color: 'var(--gray-200)', padding: 12, borderRadius: 6,
            fontSize: 11, overflow: 'auto', margin: 0,
          }}>
{`curl https://commup.app/api/v1/tags?project_id=<uuid> \\
  -H "Authorization: Bearer ${token.substring(0, 20)}…"`}
          </pre>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
          />
          {tx('reveal.saved')}
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={!confirmed}
            style={{ ...btnPrimary, opacity: confirmed ? 1 : 0.5 }}
          >
            {tx('close')}
          </button>
        </div>
      </DialogSurface>
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
  background: 'var(--card-bg)', borderRadius: 10, width: '100%', padding: 24,
}

function ModalHeader({ id, title, onClose }: { id?: string; title: string; onClose: () => void }) {
  const tx = useTranslations('ApiKeys')
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <h2 id={id} style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-strong)' }}>{title}</h2>
      <button onClick={onClose} aria-label={tx('close')} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
    </div>
  )
}

function ModalError({ msg }: { msg: string }) {
  return (
    <div style={{ padding: 10, background: 'var(--danger-50)', border: '1px solid var(--danger-200)', borderRadius: 6, color: 'var(--danger-700)', fontSize: 13, marginBottom: 14 }}>
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
  const tx = useTranslations('ApiKeys')
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
      <button onClick={onCancel} style={btnOutline} disabled={saving}>{tx('cancel')}</button>
      <button
        onClick={onSave}
        style={{ ...btnPrimary, opacity: canSave && !saving ? 1 : 0.5 }}
        disabled={saving || !canSave}
      >
        {saving ? tx('saving') : saveLabel}
      </button>
    </div>
  )
}
