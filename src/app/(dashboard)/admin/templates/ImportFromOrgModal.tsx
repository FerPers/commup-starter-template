'use client'

import { useEffect, useId, useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  listImportableTemplates,
  cloneTemplateToActiveOrg,
  cloneTemplatesToActiveOrg,
  type ImportableTemplate,
  type BulkCloneResult,
} from '@/app/actions/itr-templates'
import { DialogSurface } from '@/components/ui/dialog-a11y'

// Banco de plantillas: una org marcada como catálogo expone sus templates a
// todas las demás (RLS is_catalog_org). Una org nueva no necesita saber quién
// es el catálogo: aquí aparece agrupado con la etiqueta "Catálogo público",
// filtrable por disciplina y con importación de una o de todas a la vez.
// Cada fila indica si el código es nuevo en la org activa, si ya está al día o
// si el catálogo trae una versión distinta («Actualizar» crea una revisión
// inactiva que el editor activa cuando la revisa).

type StateFilter = '' | 'new' | 'outdated' | 'same'

export default function ImportFromOrgModal({ onClose }: { onClose: () => void }) {
  // `ti` (no `t`): las plantillas se recorren como `t`.
  const ti = useTranslations('TemplateImport')
  const titleId = useId()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ImportableTemplate[]>([])
  const [importingId, setImportingId] = useState<string | null>(null)
  const [bulkOrgId, setBulkOrgId] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [stateFilter, setStateFilter] = useState<StateFilter>('')
  const [isPending, startTransition] = useTransition()

  function reload() {
    setLoading(true)
    return listImportableTemplates().then(res => {
      if (res.error) setError(res.error)
      setTemplates(res.templates ?? [])
      setLoading(false)
    })
  }

  useEffect(() => {
    let cancelled = false
    void listImportableTemplates().then(res => {
      if (cancelled) return
      if (res.error) setError(res.error)
      setTemplates(res.templates ?? [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const disciplines = useMemo(
    () => [...new Set(templates.map(t => t.disciplineCode).filter((d): d is string => !!d))].sort(),
    [templates],
  )

  const counts = useMemo(() => ({
    new: templates.filter(t => t.localState === 'new').length,
    outdated: templates.filter(t => t.localState === 'outdated').length,
    same: templates.filter(t => t.localState === 'same').length,
  }), [templates])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return templates.filter(t =>
      (!discipline || t.disciplineCode === discipline) &&
      (!stateFilter || t.localState === stateFilter) &&
      (!q || t.code.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)),
    )
  }, [templates, search, discipline, stateFilter])

  // Group by source org (catálogo público primero)
  const byOrg = useMemo(() => {
    const map = new Map<string, ImportableTemplate[]>()
    for (const t of filtered) {
      if (!map.has(t.sourceOrgId)) map.set(t.sourceOrgId, [])
      map.get(t.sourceOrgId)!.push(t)
    }
    return [...map.entries()].sort(([, a], [, b]) => Number(b[0].sourceOrgIsCatalog) - Number(a[0].sourceOrgIsCatalog))
  }, [filtered])

  function handleImport(t: ImportableTemplate) {
    setImportingId(t.id)
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await cloneTemplateToActiveOrg(t.id, { updateExisting: t.localState === 'outdated' })
      setImportingId(null)
      if (res.error) {
        setError(res.error)
        return
      }
      setSuccess(ti(res.kind === 'revision' ? 'okRevision' : res.kind === 'unchanged' ? 'okUnchanged' : 'okImported', { code: t.code }))
      await reload()
      router.refresh()
    })
  }

  function handleImportAll(orgId: string, list: ImportableTemplate[]) {
    const pending = list.filter(t => t.localState !== 'same')
    if (pending.length === 0) return
    setBulkOrgId(orgId)
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await cloneTemplatesToActiveOrg(pending.map(t => t.id), { updateExisting: true })
      setBulkOrgId(null)
      if (res.error || !res.result) {
        setError(res.error ?? ti('error'))
        return
      }
      setSuccess(describeBulk(res.result, ti))
      if (res.result.errors.length > 0) {
        setError(res.result.errors.slice(0, 5).map(e => `${e.code}: ${e.reason}`).join(' · '))
      }
      await reload()
      router.refresh()
    })
  }

  return (
    <div
      role="presentation"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, zIndex: 100,
      }}
    >
      <DialogSurface onClose={onClose} labelledBy={titleId}
        style={{
          background: 'var(--card-bg)', borderRadius: 14,
          maxWidth: 760, width: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <h2 id={titleId} style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>
              {ti('title')}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              {ti('subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}
            aria-label={ti('close')}
          >×</button>
        </div>

        {/* Filtros */}
        {!loading && templates.length > 0 && (
          <div style={{ display: 'flex', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={ti('search')}
              style={{ flex: 1, minWidth: 200, padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card-bg)', color: 'var(--text-strong)' }}
            />
            <select
              value={discipline}
              onChange={e => setDiscipline(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card-bg)', color: 'var(--text-strong)' }}
            >
              <option value="">{ti('allDisciplines')}</option>
              {disciplines.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value as StateFilter)}
              style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card-bg)', color: 'var(--text-strong)' }}
            >
              <option value="">{ti('allStates')}</option>
              <option value="new">{ti('stateNew', { n: counts.new })}</option>
              <option value="outdated">{ti('stateOutdated', { n: counts.outdated })}</option>
              <option value="same">{ti('stateSame', { n: counts.same })}</option>
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ti('of', { n: filtered.length, total: templates.length })}</span>
          </div>
        )}

        <div style={{ overflowY: 'auto', padding: 20 }}>
          {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{ti('loading')}</p>}

          {!loading && templates.length === 0 && !error && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {ti('none')}
            </p>
          )}

          {error && (
            <div style={{
              padding: '10px 14px', background: 'var(--danger-100)', border: '1px solid var(--danger-300)',
              borderRadius: 8, color: 'var(--danger-700)', fontSize: 13, marginBottom: 12,
            }}>{error}</div>
          )}

          {success && (
            <div style={{
              padding: '10px 14px', background: 'var(--success-50)', border: '1px solid var(--success-300)',
              borderRadius: 8, color: 'var(--success-700)', fontSize: 13, marginBottom: 12,
            }}>{success}</div>
          )}

          {byOrg.map(([orgId, list]) => {
            const pending = list.filter(t => t.localState !== 'same')
            return (
            <div key={orgId} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 0 8px' }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {list[0].sourceOrgName}
                  {list[0].sourceOrgIsCatalog && (
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
                      background: 'var(--success-50)', color: 'var(--success-700)', border: '1px solid var(--success-300)',
                      letterSpacing: '0.04em',
                    }}>
                      {ti('publicCatalog')}
                    </span>
                  )}
                </p>
                <button
                  onClick={() => handleImportAll(orgId, list)}
                  disabled={isPending || pending.length === 0}
                  title={ti('importAllHint')}
                  style={{
                    padding: '6px 12px', fontSize: 12, fontWeight: 600,
                    background: 'var(--card-bg)', color: 'var(--primary-700)', border: '1px solid var(--primary-200)', borderRadius: 6,
                    cursor: isPending || pending.length === 0 ? 'default' : 'pointer',
                    opacity: (isPending && bulkOrgId !== orgId) || pending.length === 0 ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {bulkOrgId === orgId
                    ? ti('importingN', { n: pending.length })
                    : pending.length === 0
                      ? ti('allUpToDate')
                      : ti(discipline || search || stateFilter ? 'importFiltered' : 'importAll', { n: pending.length })}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8,
                    background: 'var(--gray-50)',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span>{t.code} · {t.title}</span>
                        <StateBadge t={t} />
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        {t.disciplineCode} / {ti('phase', { code: t.phaseCode ?? '' })} · v{t.version} · {ti('sections', { n: t.sectionCount })} · {ti('items', { n: t.itemCount })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleImport(t)}
                      disabled={isPending || t.localState === 'same'}
                      style={{
                        padding: '7px 14px', fontSize: 12, fontWeight: 500,
                        background: t.localState === 'same' ? 'var(--gray-200)' : t.localState === 'outdated' ? 'var(--warning-600)' : 'var(--primary-500)',
                        color: t.localState === 'same' ? 'var(--text-muted)' : 'white', border: 'none', borderRadius: 6,
                        cursor: isPending || t.localState === 'same' ? 'default' : 'pointer',
                        opacity: isPending && importingId !== t.id ? 0.6 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {isPending && importingId === t.id ? ti('importing') : t.localState === 'same' ? ti('upToDate') : t.localState === 'outdated' ? ti('update') : ti('import')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            )
          })}
        </div>
      </DialogSurface>
    </div>
  )
}

function StateBadge({ t }: { t: ImportableTemplate }) {
  const ti = useTranslations('TemplateImport')
  const style = { fontSize: 12, fontWeight: 700, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.04em', whiteSpace: 'nowrap' as const }
  if (t.localState === 'new') return <span style={{ ...style, background: 'var(--primary-50)', color: 'var(--primary-700)', border: '1px solid var(--primary-200)' }}>{ti('badgeNew')}</span>
  if (t.localState === 'outdated') return <span style={{ ...style, background: 'var(--warning-50)', color: 'var(--warning-700)', border: '1px solid var(--warning-200)' }} title={ti('badgeOutdatedHint')}>{ti('badgeOutdated', { v: t.localVersion ?? '' })}</span>
  return <span style={{ ...style, background: 'var(--success-50)', color: 'var(--success-700)', border: '1px solid var(--success-300)' }}>{ti('badgeSame', { v: t.localVersion ?? '' })}</span>
}

function describeBulk(r: BulkCloneResult, ti: (key: string, values?: Record<string, number>) => string): string {
  const parts = [ti('bulk.created', { n: r.created })]
  if (r.revisions > 0) parts.push(ti('bulk.revisions', { n: r.revisions }))
  if (r.unchanged > 0) parts.push(ti('bulk.unchanged', { n: r.unchanged }))
  if (r.skipped > 0) parts.push(ti('bulk.skipped', { n: r.skipped }))
  if (r.errors.length > 0) parts.push(ti('bulk.errors', { n: r.errors.length }))
  return parts.join(' · ')
}
