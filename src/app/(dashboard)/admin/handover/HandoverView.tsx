'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  generateHandoverPackageAction,
  getSignedHandoverUrlsAction,
} from '@/app/actions/handover'

type Project = { id: string; name: string; code: string }
type SystemRow = { id: string; project_id: string; code: string; name: string }
type Pkg = {
  id: string
  project_id: string
  version: string
  status: string
  generated_by: string | null
  generated_at: string
  json_path: string | null
  pdf_path: string | null
  signature_hash: string | null
  metadata: Record<string, unknown>
  error_message: string | null
  created_at: string
}

const btnPrimary: React.CSSProperties = {
  padding: '10px 16px', background: '#3b82f6', color: 'white',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnOutline: React.CSSProperties = {
  padding: '6px 12px', background: 'white', color: '#475569',
  border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
  fontFamily: 'inherit', width: '100%', background: 'white',
}
const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#475569',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block',
}
const card: React.CSSProperties = {
  background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginBottom: 20,
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function statusStyle(s: string): React.CSSProperties {
  const base = { padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }
  if (s === 'ISSUED')     return { ...base, background: '#dcfce7', color: '#166534' }
  if (s === 'FAILED')     return { ...base, background: '#fee2e2', color: '#991b1b' }
  if (s === 'GENERATING') return { ...base, background: '#dbeafe', color: '#1e40af' }
  return { ...base, background: '#f1f5f9', color: '#475569' }
}

export default function HandoverView({
  projects, systems, packages: initialPkgs,
}: { projects: Project[]; systems: SystemRow[]; packages: Pkg[] }) {
  const t = useTranslations('AdminHandover')

  const [pkgs, setPkgs]                 = useState<Pkg[]>(initialPkgs)
  const [projectId, setProjectId]       = useState<string>(projects[0]?.id ?? '')
  const [selectedSystems, setSelected]  = useState<Set<string>>(new Set())
  const [includeJson, setIncludeJson]   = useState(true)
  const [includePdf,  setIncludePdf]    = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [lastResult, setLastResult]     = useState<{ jsonUrl: string | null; pdfUrl: string | null } | null>(null)
  const [isPending, startTransition]    = useTransition()

  const projectSystems = useMemo(
    () => systems.filter(s => s.project_id === projectId),
    [systems, projectId],
  )
  const projectsById = useMemo(() => {
    const m: Record<string, Project> = {}
    for (const p of projects) m[p.id] = p
    return m
  }, [projects])

  const toggleSystem = (sid: string) => {
    setSelected(prev => {
      const nx = new Set(prev)
      if (nx.has(sid)) nx.delete(sid); else nx.add(sid)
      return nx
    })
  }

  const handleGenerate = () => {
    setError(null); setLastResult(null)
    if (!projectId) return setError(t('errors.selectProject'))
    const formats: ('json' | 'pdf')[] = []
    if (includeJson) formats.push('json')
    if (includePdf)  formats.push('pdf')
    if (formats.length === 0) return setError(t('errors.selectFormat'))

    startTransition(async () => {
      const res = await generateHandoverPackageAction({
        projectId,
        systemIds: selectedSystems.size > 0 ? [...selectedSystems] : null,
        formats,
      })
      if (res.error) return setError(res.error)

      setLastResult({ jsonUrl: res.jsonUrl ?? null, pdfUrl: res.pdfUrl ?? null })
      setPkgs(prev => [
        {
          id: res.packageId!,
          project_id: projectId,
          version: '2.0',
          status: 'ISSUED',
          generated_by: null,
          generated_at: new Date().toISOString(),
          json_path: res.jsonUrl ? 'set' : null,
          pdf_path:  res.pdfUrl  ? 'set' : null,
          signature_hash: res.signatureHash ?? null,
          metadata: {},
          error_message: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ])
    })
  }

  const handleRefreshUrls = (pkgId: string) => {
    setError(null)
    startTransition(async () => {
      const res = await getSignedHandoverUrlsAction(pkgId)
      if (res.error) return setError(res.error)
      setLastResult({ jsonUrl: res.jsonUrl ?? null, pdfUrl: res.pdfUrl ?? null })
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{t('title')}</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>{t('subtitle')}</p>

      {/* Generator */}
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{t('generator.title')}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={label}>{t('generator.project')}</label>
            <select
              value={projectId}
              onChange={e => { setProjectId(e.target.value); setSelected(new Set()) }}
              style={input}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>{t('generator.formats')}</label>
            <div style={{ display: 'flex', gap: 12, paddingTop: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={includeJson} onChange={e => setIncludeJson(e.target.checked)} />
                JSON
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={includePdf} onChange={e => setIncludePdf(e.target.checked)} />
                PDF
              </label>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={label}>{t('generator.systems')} ({projectSystems.length})</label>
          <div style={{
            border: '1px solid #e2e8f0', borderRadius: 6, padding: 10,
            maxHeight: 200, overflowY: 'auto', background: '#f8fafc',
          }}>
            {projectSystems.length === 0 && (
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{t('generator.noSystems')}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 6 }}>
              {projectSystems.map(s => (
                <label key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                  background: 'white', padding: '6px 8px', borderRadius: 4,
                  border: '1px solid #e2e8f0', cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={selectedSystems.has(s.id)}
                    onChange={() => toggleSystem(s.id)}
                  />
                  <span style={{ fontFamily: 'monospace', color: '#475569' }}>{s.code}</span>
                  <span style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
            {selectedSystems.size === 0 ? t('generator.allSystemsHint') : t('generator.selectedCount', { n: selectedSystems.size })}
          </div>
        </div>

        <button style={btnPrimary} onClick={handleGenerate} disabled={isPending}>
          {isPending ? t('generator.generating') : t('generator.generate')}
        </button>

        {error && (
          <div style={{
            marginTop: 12, padding: 10, background: '#fef2f2',
            border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 13,
          }}>{error}</div>
        )}

        {lastResult && (
          <div style={{
            marginTop: 12, padding: 12, background: '#ecfdf5',
            border: '1px solid #a7f3d0', borderRadius: 6, color: '#064e3b', fontSize: 13,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('generator.done')}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {lastResult.jsonUrl && (
                <a href={lastResult.jsonUrl} target="_blank" rel="noopener" style={{ ...btnOutline, textDecoration: 'none' }}>
                  ⬇ JSON
                </a>
              )}
              {lastResult.pdfUrl && (
                <a href={lastResult.pdfUrl} target="_blank" rel="noopener" style={{ ...btnOutline, textDecoration: 'none' }}>
                  ⬇ PDF
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{t('history.title')}</h2>

        {pkgs.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>{t('history.empty')}</div>
        )}

        {pkgs.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: 8, fontSize: 11, color: '#475569' }}>{t('history.project')}</th>
                <th style={{ padding: 8, fontSize: 11, color: '#475569' }}>{t('history.generated')}</th>
                <th style={{ padding: 8, fontSize: 11, color: '#475569' }}>{t('history.status')}</th>
                <th style={{ padding: 8, fontSize: 11, color: '#475569' }}>{t('history.files')}</th>
                <th style={{ padding: 8, fontSize: 11, color: '#475569' }}>{t('history.signature')}</th>
                <th style={{ padding: 8, fontSize: 11, color: '#475569' }}>{t('history.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pkgs.map(pkg => {
                const proj = projectsById[pkg.project_id]
                return (
                  <tr key={pkg.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 8 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#0f172a' }}>
                        {proj?.code ?? '—'}
                      </div>
                      <div style={{ color: '#64748b', fontSize: 11 }}>{proj?.name ?? pkg.project_id}</div>
                    </td>
                    <td style={{ padding: 8, color: '#475569' }}>{fmtDate(pkg.generated_at)}</td>
                    <td style={{ padding: 8 }}>
                      <span style={statusStyle(pkg.status)}>{pkg.status}</span>
                      {pkg.error_message && (
                        <div style={{ color: '#991b1b', fontSize: 11, marginTop: 4 }}>{pkg.error_message}</div>
                      )}
                    </td>
                    <td style={{ padding: 8, color: '#64748b' }}>
                      {pkg.json_path ? 'JSON' : ''}{pkg.json_path && pkg.pdf_path ? ' · ' : ''}{pkg.pdf_path ? 'PDF' : ''}
                      {!pkg.json_path && !pkg.pdf_path ? '—' : ''}
                    </td>
                    <td style={{ padding: 8, color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>
                      {pkg.signature_hash ? pkg.signature_hash.slice(0, 12) + '…' : '—'}
                    </td>
                    <td style={{ padding: 8 }}>
                      {(pkg.json_path || pkg.pdf_path) && (
                        <button style={btnOutline} onClick={() => handleRefreshUrls(pkg.id)} disabled={isPending}>
                          {t('history.download')}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
