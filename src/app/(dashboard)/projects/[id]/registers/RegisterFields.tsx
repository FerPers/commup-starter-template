'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { searchProjectTags, type TagSearchHit } from '@/app/actions/tag-search'
import { registerType, type RegisterKind, type RegisterStatus } from '@/lib/registers/catalog'
import { btn, input, label, small, useStatusLabel } from './register-ui'

// Editor de campos según el catálogo fijo (fase 3) y selector de tags por rol.

export type TagValue = { tag_id: string; tag_number: string; role: 'subject' | 'line' | 'gauge' }

export function RegisterFields({ kind, value, onChange, disabled, highlight }: {
  kind: RegisterKind
  value: Record<string, unknown>
  onChange: (v: Record<string, unknown>) => void
  disabled?: boolean
  /** Campos a resaltar (los que faltan para el siguiente paso). */
  highlight?: string[]
}) {
  const t = useTranslations('Registers')
  const statusLabel = useStatusLabel()
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      {registerType(kind).fields.map(f => {
        const v = value[f.key]
        const missing = highlight?.includes(f.key)
        const style = { ...input, ...(missing ? { borderColor: 'var(--warning-500)', boxShadow: '0 0 0 2px var(--warning-200)' } : {}) }
        const id = `reg-${f.key}`
        return (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: f.type === 'textarea' ? '1 / -1' : undefined }}>
            <label htmlFor={id} style={label}>
              {t(`field.${f.key}`)}{f.unit ? ` (${f.unit})` : ''}
              {f.requiredFor && (
                <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: missing ? 'var(--warning-700)' : 'var(--text-muted)' }}>
                  {' · '}{t('form.requiredFor', { status: statusLabel(kind, f.requiredFor as RegisterStatus) })}
                </span>
              )}
            </label>
            {f.type === 'select' ? (
              <select id={id} style={style} disabled={disabled} value={typeof v === 'string' ? v : ''} onChange={e => set(f.key, e.target.value || undefined)}>
                <option value="">—</option>
                {f.options!.map(o => <option key={o} value={o}>{t(`option.${f.key}.${o}`)}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea id={id} rows={2} style={style} disabled={disabled} value={typeof v === 'string' ? v : ''} onChange={e => set(f.key, e.target.value)} />
            ) : (
              <input id={id} style={style} disabled={disabled}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                step={f.type === 'number' ? 'any' : undefined}
                value={v === undefined || v === null ? '' : String(v)}
                onChange={e => set(f.key, f.type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function TagPicker({ projectId, kind, value, onChange, disabled }: {
  projectId: string
  kind: RegisterKind
  value: TagValue[]
  onChange: (v: TagValue[]) => void
  disabled?: boolean
}) {
  const t = useTranslations('Registers')
  const roles = registerType(kind).tagRoles
  const [role, setRole] = useState(roles[0])
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<TagSearchHit[]>([])
  const [, startSearch] = useTransition()

  // Búsqueda en servidor (máx. 50) con un pequeño retardo: los proyectos pueden tener miles de tags.
  useEffect(() => {
    if (!q.trim()) return
    const h = setTimeout(() => startSearch(async () => {
      const res = await searchProjectTags({ projectId, q })
      setHits(res.tags ?? [])
    }), 250)
    return () => clearTimeout(h)
  }, [q, projectId])

  const add = (hit: TagSearchHit) => {
    if (value.some(v => v.tag_id === hit.id && v.role === role)) return
    onChange([...value, { tag_id: hit.id, tag_number: hit.tag_number, role }])
    setQ(''); setHits([])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {roles.map(r => {
        const list = value.filter(v => v.role === r)
        return (
          <div key={r}>
            {roles.length > 1 && <div style={{ ...label, marginBottom: 4 }}>{t(`tagRole.${r}`)} ({list.length})</div>}
            {list.length === 0 ? <span style={small}>{t('form.noTags')}</span> : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {list.map(v => (
                  <span key={`${v.tag_id}:${v.role}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, background: 'var(--gray-100)', fontSize: 'var(--text-xs)', fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>
                    {v.tag_number}
                    {!disabled && (
                      <button type="button" aria-label={`${t('form.remove')} ${v.tag_number}`} onClick={() => onChange(value.filter(x => !(x.tag_id === v.tag_id && x.role === v.role)))}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 12 }}>✕</button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {!disabled && (
        <div style={{ position: 'relative', display: 'flex', gap: 8, maxWidth: 520 }}>
          {roles.length > 1 && (
            <select aria-label={t('form.tags')} value={role} onChange={e => setRole(e.target.value as typeof role)} style={{ ...input, width: 150 }}>
              {roles.map(r => <option key={r} value={r}>{t(`tagRole.${r}`)}</option>)}
            </select>
          )}
          <input aria-label={t('form.addTag')} placeholder={t('form.addTag')} value={q} onChange={e => setQ(e.target.value)} style={input} />
          {q.trim() && hits.length > 0 && (
            <ul role="listbox" style={{ position: 'absolute', top: '100%', left: roles.length > 1 ? 158 : 0, right: 0, zIndex: 20, margin: '4px 0 0', padding: 4, listStyle: 'none', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 240, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
              {hits.map(h => (
                <li key={h.id}>
                  <button type="button" onClick={() => add(h)} style={{ ...btn('outline'), border: 'none', width: '100%', textAlign: 'left', fontWeight: 400, padding: '6px 8px' }}>
                    <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{h.tag_number}</strong> <span style={small}>{h.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
