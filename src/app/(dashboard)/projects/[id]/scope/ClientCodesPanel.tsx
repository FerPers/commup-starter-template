'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setTemplateClientCodes } from '@/app/actions/itr-requirements'
import { clientCodeChanges, effectiveClientCode, type ClientCodeDraft } from '@/lib/itr/client-codes'

export type ClientCodeTemplate = { code: string; title: string; discipline: string; phase: string | null; org: string | null; project: string | null }

const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12 }
const th: React.CSSProperties = { textAlign: 'left', padding: '8px', verticalAlign: 'bottom', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 8px', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }
const input: React.CSSProperties = { width: '100%', minWidth: 120, height: 36, border: '1px solid var(--border)', borderRadius: 6, padding: '0 8px', fontSize: 'var(--text-sm)', fontFamily: 'ui-monospace, monospace', background: 'var(--card-bg)', color: 'var(--text-strong)' }
const MAX = 60

/**
 * R2b (maquetas M): código del cliente por plantilla, por proyecto con defecto de la org. Lista las plantillas de
 * las disciplinas del alcance; quien puede (Propietario, Administrador, Arquitecto) edita las dos columnas y guarda
 * en lote. La RPC vuelve a validar.
 */
export default function ClientCodesPanel({ projectId, templates, canEdit }: { projectId: string; templates: ClientCodeTemplate[]; canEdit: boolean }) {
  const t = useTranslations('ClientCodes')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [q, setQ] = useState('')
  const [drafts, setDrafts] = useState<Record<string, ClientCodeDraft>>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const changes = useMemo(() => clientCodeChanges(templates, drafts), [templates, drafts])
  const needle = q.trim().toUpperCase()
  const shown = needle
    ? templates.filter(x => [x.code, x.title, x.org, x.project, drafts[x.code]?.org, drafts[x.code]?.project].some(v => v?.toUpperCase().includes(needle)))
    : templates

  function set(code: string, level: 'org' | 'project', value: string) {
    setDone(false)
    setError(null)
    setDrafts(prev => ({ ...prev, [code]: { ...prev[code], [level]: value.slice(0, MAX) } }))
  }

  function save() {
    setError(null)
    startTransition(async () => {
      for (const level of ['org', 'project'] as const) {
        if (Object.keys(changes[level]).length === 0) continue
        const res = await setTemplateClientCodes({ projectId, level, codes: changes[level] })
        if (res.error) {
          setError(['template_not_found', 'client_code_too_long', 'invalid_client_codes'].includes(res.error) ? t(`error.${res.error as 'template_not_found'}`) : res.error)
          return
        }
      }
      setDrafts({})
      setDone(true)
      router.refresh()
    })
  }

  return (
    <div style={{ padding: '0 clamp(12px, 4vw, 32px) clamp(12px, 4vw, 32px)', maxWidth: 1100, margin: '0 auto' }}>
      <section style={card} aria-labelledby="client-codes">
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 id="client-codes" style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('title')}</h2>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 760 }}>{t('intro')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('onlyScope', { count: templates.length })}</span>
            <label htmlFor="cc-q" style={{ position: 'absolute', left: -9999 }}>{t('search')}</label>
            <input id="cc-q" value={q} onChange={e => setQ(e.target.value)} placeholder={t('search')}
              style={{ ...input, fontFamily: 'inherit', width: 220, minWidth: 0, marginLeft: 'auto' }} />
          </div>
        </div>

        {shown.length === 0 ? (
          <p style={{ margin: 0, padding: '16px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('empty')}</p>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1 }}>
                <tr>
                  <th style={th}>{t('col.code')}</th>
                  <th style={th}>{t('col.template')}</th>
                  <th style={th}>{t('col.discipline')}</th>
                  <th style={th}>{t('col.phase')}</th>
                  <th style={{ ...th, minWidth: 140 }}>{t('col.org')}</th>
                  <th style={{ ...th, minWidth: 140 }}>{t('col.project')}</th>
                  {!canEdit && <th style={th}>{t('col.effective')}</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map(x => {
                  const d = drafts[x.code]
                  const org = d?.org ?? x.org ?? ''
                  const project = d?.project ?? x.project ?? ''
                  return (
                    <tr key={x.code} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{x.code}</td>
                      <td style={{ ...td, color: 'var(--text-muted)' }}>{x.title}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{x.discipline}</td>
                      <td style={td}>{x.phase ?? '—'}</td>
                      {canEdit ? (
                        <>
                          <td style={td}>
                            <input aria-label={`${t('col.org')} · ${x.code}`} value={org} maxLength={MAX} onChange={e => set(x.code, 'org', e.target.value)} placeholder={t('placeholder')} disabled={isPending} style={input} />
                          </td>
                          <td style={td}>
                            <input aria-label={`${t('col.project')} · ${x.code}`} value={project} maxLength={MAX} onChange={e => set(x.code, 'project', e.target.value)}
                              placeholder={org || t('placeholder')} disabled={isPending} style={input} />
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{x.org ?? '—'}</td>
                          <td style={{ ...td, fontFamily: 'ui-monospace, monospace' }}>{x.project ?? '—'}</td>
                          <td style={{ ...td, fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{effectiveClientCode(x) ?? '—'}</td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div aria-live="polite" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--danger-700)' }}>{error}</p>}
          {done && !error && <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--success-700)' }}>{t('saved')}</p>}
          {canEdit ? (
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button type="button" onClick={() => { setDrafts({}); setError(null) }} disabled={changes.count === 0 || isPending}
                style={{ minHeight: 44, padding: '0 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: 'var(--text-sm)', cursor: changes.count ? 'pointer' : 'default' }}>
                {t('undo')}
              </button>
              <button type="button" onClick={save} disabled={changes.count === 0 || isPending}
                style={{ minHeight: 44, padding: '0 16px', border: 0, borderRadius: 8, background: changes.count && !isPending ? 'var(--primary-600)' : 'var(--gray-300)', color: '#ffffff', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: changes.count ? 'pointer' : 'not-allowed' }}>
                {isPending ? t('saving') : t('save', { count: changes.count })}
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t('readOnly')}</p>
          )}
        </div>
      </section>
    </div>
  )
}
