'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Modal } from '@/components/ui'
import { applySystemSuggestions, suggestSystemization, type ApplySuggestionsResult } from '@/app/actions/systems-ai'
import type { ReconciledSuggestions } from '@/lib/systems/ai'
import { TypeChip } from './system-ui'

// Revisión humana de las sugerencias de IA: nada se guarda hasta «Aplicar seleccionadas».
// Los sistemas ya definidos por una persona llegan desmarcados; la baja confianza también.

const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }
const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const btn = (primary: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
  border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--primary-600)' : 'transparent',
  color: primary ? '#fff' : 'var(--text-strong)',
})

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 75 ? 'var(--success-700)' : pct >= 50 ? 'var(--warning-700)' : 'var(--danger-700)'
  return <span style={{ fontWeight: 700, color }}>{pct}%</span>
}

export default function AiSuggestionsModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const t = useTranslations('Systems')
  const router = useRouter()
  const [data, setData] = useState<ReconciledSuggestions | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attrOn, setAttrOn] = useState<Set<string>>(new Set())
  const [depOn, setDepOn] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<ApplySuggestionsResult | null>(null)
  const [loading, startLoading] = useTransition()
  const [applying, startApplying] = useTransition()

  // Una sola consulta por apertura (StrictMode monta dos veces en desarrollo y cada llamada cuesta).
  const requested = useRef(false)
  useEffect(() => {
    if (requested.current) return
    requested.current = true
    startLoading(async () => {
      const res = await suggestSystemization({ projectId })
      if (res.error || !res.suggestions) { setError(res.error ?? t('ai.failed')); return }
      setData(res.suggestions)
      setTruncated(!!res.truncated)
      setAttrOn(new Set(res.suggestions.attributes.filter(a => !a.humanDecided && a.confidence >= 0.5).map(a => a.system_id)))
      setDepOn(new Set(res.suggestions.dependencies.filter(d => d.confidence >= 0.6).map(d => `${d.system_id}:${d.provider_id}`)))
    })
  }, [projectId, t])

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setter(next)
  }

  function apply() {
    if (!data) return
    startApplying(async () => {
      const res = await applySystemSuggestions({
        projectId,
        attributes: data.attributes.filter(a => attrOn.has(a.system_id)).map(a => ({
          systemId: a.system_id, system_type: a.system_type, priority: a.priority,
          // Solo se renombra si el nombre actual es el código (sin nombre descriptivo).
          name: a.current.name === a.system_code ? a.suggested_name : undefined,
        })),
        dependencies: data.dependencies.filter(d => depOn.has(`${d.system_id}:${d.provider_id}`)).map(d => ({
          systemId: d.system_id, providerId: d.provider_id, kind: d.kind, notes: `${t('ai.notePrefix')} ${d.reason}`,
        })),
      })
      setResult(res)
      if (!res.error) router.refresh()
    })
  }

  const selected = attrOn.size + depOn.size

  return (
    <Modal open onClose={onClose} title={t('ai.title')} size="xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
          <button type="button" style={btn(false)} onClick={onClose}>{result ? t('import.close') : t('import.cancel')}</button>
          {data && !result && (
            <button type="button" style={btn(true)} disabled={applying || selected === 0} onClick={apply}>
              {applying ? t('ai.applying') : t('ai.apply', { count: selected })}
            </button>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ ...small, margin: 0, lineHeight: 1.5 }}>{t('ai.help')}</p>
        {loading && <div role="status" style={{ ...small, padding: 24, textAlign: 'center' }}>{t('ai.loading')}</div>}
        {error && <div role="alert" style={{ color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>{error}</div>}
        {truncated && <div style={{ ...small, color: 'var(--warning-700)' }}>{t('ai.truncated')}</div>}

        {result && (
          <div role="status" style={{ fontSize: 'var(--text-sm)' }}>
            {result.error ? <span style={{ color: 'var(--danger-700)' }}>{result.error}</span> : (
              <strong style={{ color: 'var(--text-strong)' }}>{t('ai.done', { systems: result.systemsUpdated, dependencies: result.dependenciesCreated })}</strong>
            )}
            {result.errors.length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--danger-700)' }}>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            )}
          </div>
        )}

        {data && !result && (
          <>
            <section aria-labelledby="ai-attrs">
              <h3 id="ai-attrs" style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-strong)' }}>{t('ai.attributes', { count: data.attributes.length })}</h3>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={th}><span className="sr-only">{t('ai.select')}</span></th>
                    <th style={th}>{t('col.system')}</th>
                    <th style={th}>{t('ai.proposal')}</th>
                    <th style={th}>{t('ai.confidence')}</th>
                    <th style={th}>{t('ai.reason')}</th>
                  </tr></thead>
                  <tbody>
                    {data.attributes.map(a => (
                      <tr key={a.system_id} style={{ opacity: attrOn.has(a.system_id) ? 1 : 0.65 }}>
                        <td style={td}><input type="checkbox" aria-label={t('ai.selectSystem', { code: a.system_code })} checked={attrOn.has(a.system_id)} onChange={() => toggle(attrOn, setAttrOn, a.system_id)} /></td>
                        <td style={td}>
                          <strong style={{ color: 'var(--text-strong)' }}>{a.system_code}</strong>
                          {a.humanDecided && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning-700)' }}>{t('ai.humanDecided', { type: a.current.system_type ? t(`type.${a.current.system_type}`) : '—', priority: a.current.priority ? `P${a.current.priority}` : '—' })}</div>}
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <TypeChip type={a.system_type} label={t(`type.${a.system_type}`)} />
                            <strong>P{a.priority}</strong>
                          </div>
                          {a.current.name === a.system_code && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{t('ai.rename', { name: a.suggested_name })}</div>}
                        </td>
                        <td style={td}><Confidence value={a.confidence} /></td>
                        <td style={{ ...td, ...small }}>{a.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="ai-deps">
              <h3 id="ai-deps" style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-strong)' }}>{t('ai.dependencies', { count: data.dependencies.length })}</h3>
              {data.dependencies.length === 0 ? <div style={small}>{t('ai.noDependencies')}</div> : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={th}><span className="sr-only">{t('ai.select')}</span></th>
                      <th style={th}>{t('ai.dependency')}</th>
                      <th style={th}>{t('detail.kind')}</th>
                      <th style={th}>{t('ai.confidence')}</th>
                      <th style={th}>{t('ai.reason')}</th>
                    </tr></thead>
                    <tbody>
                      {data.dependencies.map(d => {
                        const key = `${d.system_id}:${d.provider_id}`
                        return (
                          <tr key={key} style={{ opacity: depOn.has(key) ? 1 : 0.65 }}>
                            <td style={td}><input type="checkbox" aria-label={t('ai.selectDependency', { system: d.system_code, provider: d.depends_on_code })} checked={depOn.has(key)} onChange={() => toggle(depOn, setDepOn, key)} /></td>
                            <td style={td}><strong style={{ color: 'var(--text-strong)' }}>{d.system_code}</strong> {t('ai.dependsOnArrow')} <strong style={{ color: 'var(--text-strong)' }}>{d.depends_on_code}</strong></td>
                            <td style={td}>{t(`kind.${d.kind}`)}</td>
                            <td style={td}><Confidence value={d.confidence} /></td>
                            <td style={{ ...td, ...small }}>{d.reason}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ ...small, margin: '6px 0 0' }}>{t('ai.gatesNote')}</p>
            </section>

            {data.discarded.length > 0 && (
              <details style={small}>
                <summary>{t('ai.discarded', { count: data.discarded.length })}</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{data.discarded.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </details>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
