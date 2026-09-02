'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  generateMatrixWithAi, reviewMatrixRows, addMatrixRow, deleteMatrixRow,
  type MatrixRow, type GenerateResult,
} from '@/app/actions/itr-matrix'

// ── Matriz "tipo de equipo × plantilla ITR" ─────────────────────────────────
// La IA propone (con motivo y confianza), un editor acepta o rechaza, y la
// matriz aceptada alimenta las sugerencias del Tag 360. Regenerar nunca pisa
// una decisión humana.

type EquipmentType = { id: string; code: string; name: string; category: string | null }
type TemplateOption = { id: string; code: string; title: string; discipline_code: string | null; phase_code: string | null }
type Phase = { code: string; name: string; order_index: number }

const BATCH = 12

const STATUS_STYLE: Record<MatrixRow['status'], { bg: string; color: string; label: string }> = {
  proposed: { bg: '#fef3c7', color: '#92400e', label: 'Propuesta' },
  accepted: { bg: '#dcfce7', color: '#166534', label: 'Aceptada' },
  rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rechazada' },
}

export default function MatrixView({
  equipmentTypes, templates, phases, initialRows, loadError, aiEnabled,
}: {
  equipmentTypes: EquipmentType[]
  templates: TemplateOption[]
  phases: Phase[]
  initialRows: MatrixRow[]
  loadError: string | null
  aiEnabled: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(loadError)
  const [progress, setProgress] = useState<{ done: number; total: number; log: string[] } | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'empty'>('all')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [addTemplate, setAddTemplate] = useState('')

  const rowsByType = useMemo(() => {
    const m = new Map<string, MatrixRow[]>()
    for (const r of initialRows) {
      if (!m.has(r.equipment_type_id)) m.set(r.equipment_type_id, [])
      m.get(r.equipment_type_id)!.push(r)
    }
    return m
  }, [initialRows])

  const phaseOrder = useMemo(() => new Map(phases.map(p => [p.code, p.order_index])), [phases])
  const categories = useMemo(() => [...new Set(equipmentTypes.map(t => t.category ?? ''))], [equipmentTypes])

  const stats = useMemo(() => {
    let withAccepted = 0, pending = 0, accepted = 0, rejected = 0
    for (const t of equipmentTypes) {
      const rows = rowsByType.get(t.id) ?? []
      if (rows.some(r => r.status === 'accepted')) withAccepted++
      pending += rows.filter(r => r.status === 'proposed').length
      accepted += rows.filter(r => r.status === 'accepted').length
      rejected += rows.filter(r => r.status === 'rejected').length
    }
    return { withAccepted, pending, accepted, rejected }
  }, [equipmentTypes, rowsByType])

  const visibleTypes = useMemo(() => {
    const q = search.trim().toLowerCase()
    return equipmentTypes.filter(t => {
      const rows = rowsByType.get(t.id) ?? []
      if (category && (t.category ?? '') !== category) return false
      if (q && !t.code.toLowerCase().includes(q) && !t.name.toLowerCase().includes(q)) return false
      if (filter === 'pending') return rows.some(r => r.status === 'proposed')
      if (filter === 'empty') return rows.length === 0
      return true
    })
  }, [equipmentTypes, rowsByType, filter, search, category])

  function act(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      router.refresh()
    })
  }

  async function generate(typeIds: string[]) {
    if (typeIds.length === 0) return
    setError(null)
    const log: string[] = []
    setProgress({ done: 0, total: typeIds.length, log })
    const summary: GenerateResult = { proposed: 0, keptHumanDecision: 0, unknownCodes: [], typesWithoutProposals: [] }
    for (let i = 0; i < typeIds.length; i += BATCH) {
      const chunk = typeIds.slice(i, i + BATCH)
      const res = await generateMatrixWithAi(chunk)
      if (res.error) { log.push(`✕ Lote ${i / BATCH + 1}: ${res.error}`); setError(res.error) }
      else if (res.result) {
        summary.proposed += res.result.proposed
        summary.keptHumanDecision += res.result.keptHumanDecision
        summary.unknownCodes.push(...res.result.unknownCodes)
        summary.typesWithoutProposals.push(...res.result.typesWithoutProposals)
        log.push(`✓ Lote ${i / BATCH + 1}: ${res.result.proposed} propuestas${res.result.typesWithoutProposals.length ? ` · sin propuesta: ${res.result.typesWithoutProposals.join(', ')}` : ''}`)
      }
      setProgress({ done: Math.min(i + BATCH, typeIds.length), total: typeIds.length, log: [...log] })
      router.refresh()
    }
    log.push(`Listo: ${summary.proposed} propuestas nuevas · ${summary.keptHumanDecision} decisiones tuyas respetadas${summary.unknownCodes.length ? ` · ${summary.unknownCodes.length} códigos desconocidos ignorados` : ''}`)
    setProgress({ done: typeIds.length, total: typeIds.length, log: [...log] })
    router.refresh()
  }

  const busy = isPending || (progress !== null && progress.done < progress.total)

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <Link href="/admin/templates" style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>← Plantillas ITR</Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', margin: '12px 0 20px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>Matriz ITR por tipo de equipo</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0', maxWidth: '70ch' }}>
            Qué plantillas aplican a cada tipo de equipo, por fase. La IA propone con motivo y confianza; tú aceptas o rechazas. Lo aceptado se sugiere primero al asignar ITRs a un tag.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button
            disabled={busy || !aiEnabled}
            onClick={() => generate(equipmentTypes.filter(t => (rowsByType.get(t.id) ?? []).length === 0).map(t => t.id))}
            title={aiEnabled ? 'Genera propuestas solo para los tipos que aún no tienen ninguna fila' : 'IA no configurada en este entorno'}
            style={btn('#6d28d9', '#f5f3ff', '#ddd6fe', busy || !aiEnabled)}
          >
            ✦ Generar con IA (tipos vacíos)
          </button>
          <button
            disabled={busy || !aiEnabled}
            onClick={() => generate(equipmentTypes.map(t => t.id))}
            title="Vuelve a proponer para todos los tipos. Tus decisiones (aceptadas/rechazadas) no se tocan."
            style={btn('#6d28d9', 'var(--card-bg)', '#ddd6fe', busy || !aiEnabled)}
          >
            Regenerar todo
          </button>
        </div>
      </div>

      {!aiEnabled && (
        <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', color: '#92400e', fontSize: '13px', marginBottom: '14px' }}>
          La IA no está configurada en este entorno (falta la clave ANTHROPIC_API_KEY en Cloudflare). Puedes construir la matriz a mano con «+ Añadir plantilla».
        </div>
      )}
      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px', marginBottom: '14px' }}>{error}</div>
      )}
      {progress && (
        <div style={{ padding: '12px 14px', background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: '8px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#5b21b6', fontWeight: 600, marginBottom: '6px' }}>
            <span>{progress.done < progress.total ? 'Generando propuestas…' : 'Generación terminada'}</span>
            <span>{progress.done} / {progress.total} tipos</span>
          </div>
          <div style={{ height: '6px', background: '#ede9fe', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((progress.done / progress.total) * 100)}%`, height: '100%', background: '#7c3aed', transition: 'width .3s' }} />
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>
            {progress.log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '18px' }}>
        <Stat label="Tipos con matriz aceptada" value={`${stats.withAccepted} / ${equipmentTypes.length}`} />
        <Stat label="Propuestas por revisar" value={String(stats.pending)} accent={stats.pending > 0 ? '#b45309' : undefined} />
        <Stat label="Filas aceptadas" value={String(stats.accepted)} accent="#166534" />
        <Stat label="Rechazadas" value={String(stats.rejected)} />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tipo (P, TK, bomba…)" style={{ ...input, width: '220px' }} />
        <select value={category} onChange={e => setCategory(e.target.value)} style={input}>
          <option value="">Todas las categorías</option>
          {categories.map(c => <option key={c || '__none'} value={c}>{c || 'Sin categoría'}</option>)}
        </select>
        {(['all', 'pending', 'empty'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...chip, background: filter === f ? '#0B1D3A' : 'var(--card-bg)', color: filter === f ? '#fff' : 'var(--text-muted)' }}>
            {f === 'all' ? 'Todos' : f === 'pending' ? 'Con propuestas pendientes' : 'Sin filas'}
          </button>
        ))}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{visibleTypes.length} tipos</span>
      </div>

      {/* Tipos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {visibleTypes.map(t => {
          const rows = [...(rowsByType.get(t.id) ?? [])].sort((a, b) =>
            (phaseOrder.get(a.template.phase_code ?? '') ?? 99) - (phaseOrder.get(b.template.phase_code ?? '') ?? 99)
            || a.template.code.localeCompare(b.template.code))
          const pendingIds = rows.filter(r => r.status === 'proposed').map(r => r.id)
          const usedTemplateIds = new Set(rows.map(r => r.itr_template_id))
          return (
            <div key={t.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: rows.length ? '10px' : 0, flexWrap: 'wrap' }}>
                <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, fontFamily: 'ui-monospace, monospace', background: 'var(--gray-100)', color: 'var(--text-strong)' }}>{t.code}</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>{t.name}</span>
                {t.category && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.category}</span>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                  {pendingIds.length > 0 && (
                    <button disabled={busy} onClick={() => act(() => reviewMatrixRows(pendingIds, 'accepted'))} style={btn('#166534', '#dcfce7', '#bbf7d0', busy)}>
                      Aceptar {pendingIds.length} propuesta{pendingIds.length !== 1 ? 's' : ''}
                    </button>
                  )}
                  {aiEnabled && (
                    <button disabled={busy} onClick={() => generate([t.id])} style={btn('#6d28d9', 'var(--card-bg)', '#ddd6fe', busy)} title="Proponer solo para este tipo">✦</button>
                  )}
                  <button disabled={busy} onClick={() => { setAddingFor(addingFor === t.id ? null : t.id); setAddTemplate('') }} style={btn('#1e40af', '#eff6ff', '#bfdbfe', busy)}>+ Añadir plantilla</button>
                </span>
              </div>

              {addingFor === t.id && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px', background: '#eff6ff', borderRadius: '8px', marginBottom: '10px' }}>
                  <select value={addTemplate} onChange={e => setAddTemplate(e.target.value)} style={{ ...input, flex: 1 }}>
                    <option value="">Elige una plantilla…</option>
                    {templates.filter(tp => !usedTemplateIds.has(tp.id)).map(tp => (
                      <option key={tp.id} value={tp.id}>{tp.code} · {tp.title} ({tp.discipline_code ?? '?'} / fase {tp.phase_code ?? '?'})</option>
                    ))}
                  </select>
                  <button
                    disabled={busy || !addTemplate}
                    onClick={() => act(async () => { const r = await addMatrixRow({ equipmentTypeId: t.id, templateId: addTemplate }); if (!r.error) { setAddingFor(null); setAddTemplate('') } return r })}
                    style={btn('#fff', '#2563eb', '#2563eb', busy || !addTemplate)}
                  >
                    Añadir como aceptada
                  </button>
                </div>
              )}

              {rows.length === 0 ? (
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--gray-400)' }}>Sin plantillas asociadas todavía.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {rows.map(r => {
                    const st = STATUS_STYLE[r.status]
                    return (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', background: r.status === 'rejected' ? 'var(--gray-50)' : 'transparent', border: '1px solid #f1f5f9', opacity: r.status === 'rejected' ? 0.7 : 1 }}>
                        <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: '#e0e7ff', color: '#3730a3', whiteSpace: 'nowrap' }}>Fase {r.template.phase_code ?? '?'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
                            <span style={{ fontFamily: 'ui-monospace, monospace' }}>{r.template.code}</span> · {r.template.title}
                            {r.template.discipline_code && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>{r.template.discipline_code}</span>}
                          </div>
                          {r.reason && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.reason}</div>}
                        </div>
                        {r.confidence !== null && (
                          <span title="Confianza de la IA" style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', color: r.confidence >= 0.7 ? '#15803d' : r.confidence >= 0.4 ? '#b45309' : '#dc2626' }}>{Math.round(r.confidence * 100)}%</span>
                        )}
                        <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>{st.label}{r.source === 'manual' ? ' · manual' : ''}</span>
                        <span style={{ display: 'flex', gap: '4px' }}>
                          {r.status !== 'accepted' && <button disabled={busy} onClick={() => act(() => reviewMatrixRows([r.id], 'accepted'))} title="Aceptar" style={btnIcon('#166534')}>✓</button>}
                          {r.status !== 'rejected' && <button disabled={busy} onClick={() => act(() => reviewMatrixRows([r.id], 'rejected'))} title="Rechazar" style={btnIcon('#991b1b')}>✕</button>}
                          <button disabled={busy} onClick={() => act(() => deleteMatrixRow(r.id))} title="Eliminar fila" style={btnIcon('var(--gray-400)')}>🗑</button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {visibleTypes.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Ningún tipo de equipo coincide con el filtro.</p>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: accent ?? 'var(--text-strong)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function btn(color: string, bg: string, border: string, disabled: boolean): React.CSSProperties {
  return { padding: '7px 12px', fontSize: '12px', fontWeight: 600, color, background: bg, border: `1px solid ${border}`, borderRadius: '7px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap' }
}
function btnIcon(color: string): React.CSSProperties {
  return { width: '28px', height: '28px', fontSize: '13px', color, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }
}
const input: React.CSSProperties = { padding: '7px 10px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card-bg)', color: 'var(--text-strong)' }
const chip: React.CSSProperties = { padding: '6px 12px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--border)', borderRadius: '999px', cursor: 'pointer' }
