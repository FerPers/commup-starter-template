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
  const [isPending, startTransition] = useTransition()

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return templates.filter(t =>
      (!discipline || t.disciplineCode === discipline) &&
      (!q || t.code.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)),
    )
  }, [templates, search, discipline])

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
      const res = await cloneTemplateToActiveOrg(t.id)
      setImportingId(null)
      if (res.error) {
        setError(res.error)
        return
      }
      setSuccess(`Template "${t.code}" importado exitosamente`)
      router.refresh()
    })
  }

  function handleImportAll(orgId: string, list: ImportableTemplate[]) {
    setBulkOrgId(orgId)
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await cloneTemplatesToActiveOrg(list.map(t => t.id))
      setBulkOrgId(null)
      if (res.error || !res.result) {
        setError(res.error ?? 'No se pudo importar')
        return
      }
      setSuccess(describeBulk(res.result))
      if (res.result.errors.length > 0) {
        setError(res.result.errors.slice(0, 5).map(e => `${e.code}: ${e.reason}`).join(' · '))
      }
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
              Se clonan en la org activa. Cada org evoluciona su copia de forma independiente. Los que ya existen (mismo código) se saltan.
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

          {byOrg.map(([orgId, list]) => (
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
                  disabled={isPending}
                  style={{
                    padding: '6px 12px', fontSize: 12, fontWeight: 600,
                    background: 'var(--card-bg)', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6,
                    cursor: isPending ? 'wait' : 'pointer', opacity: isPending && bulkOrgId !== orgId ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {bulkOrgId === orgId ? `Importando ${list.length}…` : `Importar ${discipline || search ? 'los filtrados' : 'todos'} (${list.length})`}
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
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                        {t.code} · {t.title}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                        {t.disciplineCode} / fase {t.phaseCode} · v{t.version} · {t.sectionCount} secciones · {t.itemCount} ítems
                      </p>
                    </div>
                    <button
                      onClick={() => handleImport(t)}
                      disabled={isPending}
                      style={{
                        padding: '7px 14px', fontSize: 12, fontWeight: 500,
                        background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6,
                        cursor: isPending ? 'wait' : 'pointer',
                        opacity: isPending && importingId !== t.id ? 0.6 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {isPending && importingId === t.id ? 'Importando…' : 'Importar'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function describeBulk(r: BulkCloneResult): string {
  const parts = [`${r.created} importado${r.created !== 1 ? 's' : ''}`]
  if (r.skipped > 0) parts.push(`${r.skipped} ya existía${r.skipped !== 1 ? 'n' : ''}`)
  if (r.errors.length > 0) parts.push(`${r.errors.length} con error`)
  return parts.join(' · ')
}
