'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Download } from 'lucide-react'
import { Button, Card, Select, EmptyState } from '@/components/ui'
import {
  generateHandoverPackageAction,
  getSignedHandoverUrlsAction,
} from '@/app/actions/handover'
import type { HandoverFormat } from '@/lib/handover/generate'

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
  zip_path: string | null
  signature_hash: string | null
  metadata: Record<string, unknown>
  error_message: string | null
  created_at: string
  /** A10: anexos que no entraron; > 0 ⇔ PARTIAL. */
  omitted_count: number
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block',
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function statusStyle(s: string): React.CSSProperties {
  const base = { padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 600 }
  if (s === 'ISSUED')     return { ...base, background: 'var(--success-50)', color: 'var(--success-700)' }
  if (s === 'PARTIAL')    return { ...base, background: 'var(--warning-50)', color: 'var(--warning-700)', border: '1px solid var(--warning-200)' }
  if (s === 'FAILED')     return { ...base, background: 'var(--danger-50)',  color: 'var(--danger-700)' }
  if (s === 'GENERATING') return { ...base, background: 'var(--primary-50)', color: 'var(--primary-700)' }
  return { ...base, background: 'var(--gray-100)', color: 'var(--text-secondary)' }
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
  const [includeZip,  setIncludeZip]    = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [lastResult, setLastResult]     = useState<{ jsonUrl: string | null; pdfUrl: string | null; zipUrl: string | null; omittedCount?: number } | null>(null)
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
    const formats: HandoverFormat[] = []
    if (includeJson) formats.push('json')
    if (includePdf)  formats.push('pdf')
    if (includeZip)  formats.push('zip')
    if (formats.length === 0) return setError(t('errors.selectFormat'))

    startTransition(async () => {
      const res = await generateHandoverPackageAction({
        projectId,
        systemIds: selectedSystems.size > 0 ? [...selectedSystems] : null,
        formats,
      })
      if (res.error) return setError(res.error)

      setLastResult({ jsonUrl: res.jsonUrl ?? null, pdfUrl: res.pdfUrl ?? null, zipUrl: res.zipUrl ?? null, omittedCount: res.omittedCount ?? 0 })
      setPkgs(prev => [
        {
          id: res.packageId!,
          project_id: projectId,
          version: '3.0',
          status: res.status ?? 'ISSUED',
          omitted_count: res.omittedCount ?? 0,
          generated_by: null,
          generated_at: new Date().toISOString(),
          json_path: res.jsonUrl ? 'set' : null,
          pdf_path:  res.pdfUrl  ? 'set' : null,
          zip_path:  res.zipUrl  ? 'set' : null,
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
      setLastResult({ jsonUrl: res.jsonUrl ?? null, pdfUrl: res.pdfUrl ?? null, zipUrl: res.zipUrl ?? null })
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 4, color: 'var(--text-strong)' }}>{t('title')}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>{t('subtitle')}</p>

      {/* Generator */}
      <Card padding="md" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 12, color: 'var(--text-strong)' }}>{t('generator.title')}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle} htmlFor="ho-project">{t('generator.project')}</label>
            <Select
              id="ho-project"
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setSelected(new Set()) }}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <span style={labelStyle}>{t('generator.formats')}</span>
            <div style={{ display: 'flex', gap: 12, paddingTop: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeJson} onChange={(e) => setIncludeJson(e.target.checked)} />
                JSON
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                <input type="checkbox" checked={includePdf} onChange={(e) => setIncludePdf(e.target.checked)} />
                PDF
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeZip} onChange={(e) => setIncludeZip(e.target.checked)} />
                {t('generator.zip')}
              </label>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <span style={labelStyle}>{t('generator.systems')} ({projectSystems.length})</span>
          <div style={{
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10,
            maxHeight: 200, overflowY: 'auto', background: 'var(--gray-50)',
          }}>
            {projectSystems.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{t('generator.noSystems')}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 6 }}>
              {projectSystems.map(s => (
                <label key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-xs)',
                  background: 'var(--card-bg)', padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={selectedSystems.has(s.id)}
                    onChange={() => toggleSystem(s.id)}
                  />
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{s.code}</span>
                  <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 6 }}>
            {selectedSystems.size === 0 ? t('generator.allSystemsHint') : t('generator.selectedCount', { n: selectedSystems.size })}
          </div>
        </div>

        <Button onClick={handleGenerate} loading={isPending}>
          {t('generator.generate')}
        </Button>

        {error && (
          <div role="alert" style={{
            marginTop: 12, padding: 10, background: 'var(--danger-50)',
            border: '1px solid var(--danger-500)', borderRadius: 'var(--radius-sm)',
            color: 'var(--danger-700)', fontSize: 'var(--text-sm)',
          }}>{error}</div>
        )}

        {lastResult && (
          <div style={{
            marginTop: 12, padding: 12, background: 'var(--success-50)',
            border: '1px solid var(--success-200)', borderRadius: 'var(--radius-sm)',
            color: 'var(--success-900)', fontSize: 'var(--text-sm)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('generator.done')}</div>
            {/* A10: un paquete con anexos omitidos no es una entrega completa. */}
            {!!lastResult.omittedCount && (
              <div role="status" style={{ marginBottom: 6, color: 'var(--warning-700)', fontWeight: 600 }}>{t('partialHint', { n: lastResult.omittedCount })}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              {lastResult.jsonUrl && (
                <a href={lastResult.jsonUrl} target="_blank" rel="noopener" style={{ textDecoration: 'none' }}>
                  <Button variant="outline" size="sm" leftIcon={<Download size={14} />}>JSON</Button>
                </a>
              )}
              {lastResult.pdfUrl && (
                <a href={lastResult.pdfUrl} target="_blank" rel="noopener" style={{ textDecoration: 'none' }}>
                  <Button variant="outline" size="sm" leftIcon={<Download size={14} />}>PDF</Button>
                </a>
              )}
              {lastResult.zipUrl && (
                <a href={lastResult.zipUrl} target="_blank" rel="noopener" style={{ textDecoration: 'none' }}>
                  <Button variant="outline" size="sm" leftIcon={<Download size={14} />}>ZIP</Button>
                </a>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* History */}
      <Card padding="md">
        <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 12, color: 'var(--text-strong)' }}>{t('history.title')}</h2>

        {pkgs.length === 0 ? (
          <EmptyState title={t('history.empty')} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', textAlign: 'left' }}>
                  <th style={thStyle}>{t('history.project')}</th>
                  <th style={thStyle}>{t('history.generated')}</th>
                  <th style={thStyle}>{t('history.status')}</th>
                  <th style={thStyle}>{t('history.files')}</th>
                  <th style={thStyle}>{t('history.signature')}</th>
                  <th style={thStyle}>{t('history.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pkgs.map(pkg => {
                  const proj = projectsById[pkg.project_id]
                  return (
                    <tr key={pkg.id} style={{ borderTop: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: 8 }}>
                        <div style={{ fontFamily: 'monospace', fontSize: 'var(--text-sm)', color: 'var(--text-strong)' }}>
                          {proj?.code ?? '—'}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{proj?.name ?? pkg.project_id}</div>
                      </td>
                      <td style={{ padding: 8, color: 'var(--text-secondary)' }}>{fmtDate(pkg.generated_at)}</td>
                      <td style={{ padding: 8 }}>
                        <span style={statusStyle(pkg.status)}>{pkg.status === 'PARTIAL' ? t('status.partial') : pkg.status}</span>
                        {pkg.status === 'PARTIAL' && (
                          <div style={{ color: 'var(--warning-700)', fontSize: 'var(--text-xs)', marginTop: 4 }}>{t('history.omitted', { n: pkg.omitted_count })}</div>
                        )}
                        {pkg.error_message && (
                          <div style={{ color: 'var(--danger-700)', fontSize: 'var(--text-xs)', marginTop: 4 }}>{pkg.error_message}</div>
                        )}
                      </td>
                      <td style={{ padding: 8, color: 'var(--text-muted)' }}>
                        {[pkg.json_path && 'JSON', pkg.pdf_path && 'PDF', pkg.zip_path && 'ZIP'].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td style={{ padding: 8, color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 'var(--text-xs)' }}>
                        {pkg.signature_hash
                          ? <a href={`/verify/${pkg.signature_hash}`} target="_blank" rel="noopener" title={t('history.verify')}>{pkg.signature_hash.slice(0, 12) + '…'}</a>
                          : '—'}
                      </td>
                      <td style={{ padding: 8 }}>
                        {(pkg.json_path ?? pkg.pdf_path ?? pkg.zip_path) && (
                          <Button variant="outline" size="sm" onClick={() => handleRefreshUrls(pkg.id)} disabled={isPending}>
                            {t('history.download')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: 8, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 600,
}
