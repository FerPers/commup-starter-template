'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { listImportablePssrTemplates, clonePssrTemplateToActiveOrg, type ImportablePssrTemplate } from '@/app/actions/pssr'

export default function ImportPssrFromOrgModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ImportablePssrTemplate[]>([])
  const [importingId, setImportingId] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    void listImportablePssrTemplates().then(res => {
      if (cancelled) return
      if (res.error) setError(res.error)
      setTemplates(res.templates)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  function handleImport(t: ImportablePssrTemplate) {
    setImportingId(t.id)
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await clonePssrTemplateToActiveOrg(t.id)
      setImportingId(null)
      if (res.error) {
        setError(res.error)
        return
      }
      setSuccess(`Template "${t.name}" importado exitosamente`)
      router.refresh()
    })
  }

  const byOrg = new Map<string, ImportablePssrTemplate[]>()
  for (const t of templates) {
    if (!byOrg.has(t.sourceOrgId)) byOrg.set(t.sourceOrgId, [])
    byOrg.get(t.sourceOrgId)!.push(t)
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
          maxWidth: 720, width: '100%', maxHeight: '85vh',
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
              Importar template PSSR de otra organización
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Se clona en la org activa. Cada org evoluciona su copia de forma independiente.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}
            aria-label="Cerrar"
          >×</button>
        </div>

        <div style={{ overflowY: 'auto', padding: 20 }}>
          {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando templates…</p>}

          {!loading && templates.length === 0 && !error && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No hay templates PSSR disponibles en otras organizaciones de las que seas miembro.
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

          {Array.from(byOrg.entries()).map(([orgId, list]) => (
            <div key={orgId} style={{ marginBottom: 20 }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8,
                    background: 'var(--gray-50)',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                        {t.name}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                        {t.itemCount} ítems{t.isActive ? '' : ' · inactivo'}
                        {t.description ? ` · ${t.description}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => handleImport(t)}
                      disabled={isPending && importingId === t.id}
                      style={{
                        padding: '7px 14px', fontSize: 12, fontWeight: 500,
                        background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6,
                        cursor: isPending && importingId === t.id ? 'wait' : 'pointer',
                        opacity: isPending && importingId === t.id ? 0.6 : 1,
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
