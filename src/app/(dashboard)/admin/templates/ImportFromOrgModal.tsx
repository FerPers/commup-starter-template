'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  listImportableTemplates,
  cloneTemplateToActiveOrg,
  cloneTemplatesToActiveOrg,
  type ImportableTemplate,
  type BulkCloneResult,
} from '@/app/actions/itr-templates'

// Banco de plantillas: una org marcada como catálogo expone sus templates a
// todas las demás (RLS is_catalog_org). Una org nueva no necesita saber quién
// es el catálogo: aquí aparece agrupado con la etiqueta "Catálogo público",
// filtrable por disciplina y con importación de una o de todas a la vez.
// Cada fila indica si el código es nuevo en la org activa, si ya está al día o
// si el catálogo trae una versión distinta («Actualizar» crea una revisión
// inactiva que el editor activa cuando la revisa).

type StateFilter = '' | 'new' | 'outdated' | 'same'

export default function ImportFromOrgModal({ onClose }: { onClose: () => void }) {
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
      setSuccess(res.kind === 'revision'
        ? `"${t.code}": revisión nueva creada (inactiva). Revísala y pulsa «Activar esta revisión».`
        : res.kind === 'unchanged'
          ? `"${t.code}" ya estaba al día.`
          : `Template "${t.code}" importado exitosamente`)
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
        setError(res.error ?? 'No se pudo importar')
        return
      }
      setSuccess(describeBulk(res.result))
      if (res.result.errors.length > 0) {
        setError(res.result.errors.slice(0, 5).map(e => `${e.code}: ${e.reason}`).join(' · '))
      }
      await reload()
      router.refresh()
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
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
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>
              Importar templates del catálogo
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Los códigos nuevos se clonan activos. Los que ya existen con contenido distinto reciben una revisión inactiva para revisar y activar; los idénticos no se tocan.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}
            aria-label="Cerrar"
          >×</button>
        </div>

        {/* Filtros */}
        {!loading && templates.length > 0 && (
          <div style={{ display: 'flex', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por código o título…"
              style={{ flex: 1, minWidth: 200, padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card-bg)', color: 'var(--text-strong)' }}
            />
            <select
              value={discipline}
              onChange={e => setDiscipline(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card-bg)', color: 'var(--text-strong)' }}
            >
              <option value="">Todas las disciplinas</option>
              {disciplines.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value as StateFilter)}
              style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--card-bg)', color: 'var(--text-strong)' }}
            >
              <option value="">Todos los estados</option>
              <option value="new">Nuevos ({counts.new})</option>
              <option value="outdated">Actualizables ({counts.outdated})</option>
              <option value="same">Al día ({counts.same})</option>
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} de {templates.length}</span>
          </div>
        )}

        <div style={{ overflowY: 'auto', padding: 20 }}>
          {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando templates…</p>}

          {!loading && templates.length === 0 && !error && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No hay templates disponibles: ninguna organización está marcada como catálogo público y no eres miembro de otra org con templates.
            </p>
          )}

          {error && (
            <div style={{
              padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5',
              borderRadius: 8, color: '#dc2626', fontSize: 13, marginBottom: 12,
            }}>{error}</div>
          )}

          {success && (
            <div style={{
              padding: '10px 14px', background: '#ecfdf5', border: '1px solid #6ee7b7',
              borderRadius: 8, color: '#059669', fontSize: 13, marginBottom: 12,
            }}>{success}</div>
          )}

          {byOrg.map(([orgId, list]) => {
            const pending = list.filter(t => t.localState !== 'same')
            return (
            <div key={orgId} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 0 8px' }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {list[0].sourceOrgName}
                  {list[0].sourceOrgIsCatalog && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
                      background: '#ecfdf5', color: '#059669', border: '1px solid #6ee7b7',
                      letterSpacing: '0.04em',
                    }}>
                      CATÁLOGO PÚBLICO
                    </span>
                  )}
                </p>
                <button
                  onClick={() => handleImportAll(orgId, list)}
                  disabled={isPending || pending.length === 0}
                  title="Clona los códigos nuevos y crea una revisión inactiva para los que difieren del catálogo"
                  style={{
                    padding: '6px 12px', fontSize: 12, fontWeight: 600,
                    background: 'var(--card-bg)', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6,
                    cursor: isPending || pending.length === 0 ? 'default' : 'pointer',
                    opacity: (isPending && bulkOrgId !== orgId) || pending.length === 0 ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {bulkOrgId === orgId
                    ? `Importando ${pending.length}…`
                    : pending.length === 0
                      ? 'Todo al día'
                      : `Importar nuevos y actualizar ${discipline || search || stateFilter ? 'los filtrados' : 'todos'} (${pending.length})`}
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
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                        {t.disciplineCode} / fase {t.phaseCode} · v{t.version} · {t.sectionCount} secciones · {t.itemCount} ítems
                      </p>
                    </div>
                    <button
                      onClick={() => handleImport(t)}
                      disabled={isPending || t.localState === 'same'}
                      style={{
                        padding: '7px 14px', fontSize: 12, fontWeight: 500,
                        background: t.localState === 'same' ? 'var(--gray-200, #e5e7eb)' : t.localState === 'outdated' ? '#d97706' : '#3b82f6',
                        color: t.localState === 'same' ? 'var(--text-muted)' : 'white', border: 'none', borderRadius: 6,
                        cursor: isPending || t.localState === 'same' ? 'default' : 'pointer',
                        opacity: isPending && importingId !== t.id ? 0.6 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {isPending && importingId === t.id ? 'Importando…' : t.localState === 'same' ? 'Al día' : t.localState === 'outdated' ? 'Actualizar' : 'Importar'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StateBadge({ t }: { t: ImportableTemplate }) {
  const style = { fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999, letterSpacing: '0.04em', whiteSpace: 'nowrap' as const }
  if (t.localState === 'new') return <span style={{ ...style, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>NUEVO</span>
  if (t.localState === 'outdated') return <span style={{ ...style, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }} title="Tu copia local difiere del catálogo">ACTUALIZABLE · local v{t.localVersion}</span>
  return <span style={{ ...style, background: '#ecfdf5', color: '#059669', border: '1px solid #6ee7b7' }}>AL DÍA · v{t.localVersion}</span>
}

function describeBulk(r: BulkCloneResult): string {
  const parts = [`${r.created} importado${r.created !== 1 ? 's' : ''}`]
  if (r.revisions > 0) parts.push(`${r.revisions} revisión${r.revisions !== 1 ? 'es' : ''} nueva${r.revisions !== 1 ? 's' : ''} (inactivas, para revisar y activar)`)
  if (r.unchanged > 0) parts.push(`${r.unchanged} ya al día`)
  if (r.skipped > 0) parts.push(`${r.skipped} ya existía${r.skipped !== 1 ? 'n' : ''}`)
  if (r.errors.length > 0) parts.push(`${r.errors.length} con error`)
  return parts.join(' · ')
}
