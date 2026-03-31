'use client'

import { useState, useTransition, useRef } from 'react'
import * as XLSX from 'xlsx'
import { bulkImportCatalog, type CatalogRow, type BulkImportResult } from '@/app/actions/itr-templates'
import { detectItrPhase } from '@/lib/utils'

interface Discipline { id: string; code: string; name: string; color: string }
interface Phase { id: string; code: string; name: string; color: string; order_index: number }

interface Props {
  disciplines: Discipline[]
  phases: Phase[]
  onClose: () => void
  onSuccess: () => void
}

// ── Parser ─────────────────────────────────────────────────────

interface ParsedCatalog {
  rows: CatalogRow[]
  discLetters: string[]            // unique disc letters found
  templateCount: number
  itemCount: number
  phaseBreakdown: Record<string, number>  // A/B/C → count
}

function parseCatalog(raw: unknown[][]): ParsedCatalog {
  const rows: CatalogRow[] = []
  const discLetters = new Set<string>()
  const templateCodes = new Set<string>()
  const phaseBreakdown: Record<string, number> = { A: 0, B: 0, C: 0 }

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i]
    const discLetter = String(r[0] ?? '').trim().toUpperCase()
    const code       = String(r[1] ?? '').trim().toUpperCase()
    const tipo       = String(r[2] ?? '').trim()
    const itemNo     = String(r[3] ?? '').trim()
    const description = String(r[4] ?? '').trim()

    if (!code || !description) continue

    rows.push({ discLetter, code, tipo, itemNo, description })
    discLetters.add(discLetter)

    if (!templateCodes.has(code)) {
      templateCodes.add(code)
      const phase = detectItrPhase(code)
      phaseBreakdown[phase] = (phaseBreakdown[phase] ?? 0) + 1
    }
  }

  return {
    rows,
    discLetters: [...discLetters].sort(),
    templateCount: templateCodes.size,
    itemCount: rows.length,
    phaseBreakdown,
  }
}


// ── Component ──────────────────────────────────────────────────

export default function BulkImportCatalogModal({ disciplines, phases, onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<'upload' | 'map' | 'done'>('upload')
  const [parsed, setParsed] = useState<ParsedCatalog | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // discipline mapping: discLetter → discipline_id
  const [discMap, setDiscMap] = useState<Record<string, string>>({})
  // phase mapping: 'A'|'B'|'C' → phase_id (auto-detect from phase codes)
  const [phaseMap, setPhaseMap] = useState<Record<string, string>>({})
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null)

  // Auto-set phase map when phases are available
  function buildDefaultPhaseMap(): Record<string, string> {
    const map: Record<string, string> = {}
    for (const p of phases) {
      const code = p.code.toUpperCase()
      if (code === 'A') map['A'] = p.id
      else if (code === 'B') map['B'] = p.id
      else if (code === 'C') map['C'] = p.id
    }
    return map
  }

  function processFile(file: File) {
    setParseError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (raw.length < 2) { setParseError('El archivo está vacío.'); return }

        const result = parseCatalog(raw)
        if (result.templateCount === 0) { setParseError('No se detectaron templates válidos.'); return }

        setParsed(result)
        setPhaseMap(buildDefaultPhaseMap())
        // Auto-map obvious disciplines
        const autoDisc: Record<string, string> = {}
        for (const letter of result.discLetters) {
          const match = disciplines.find(d =>
            d.code.toUpperCase().startsWith(letter) ||
            (letter === 'E' && d.code === 'ELEC') ||
            (letter === 'H' && d.code === 'HVAC') ||
            (letter === 'I' && d.code === 'INST') ||
            (letter === 'M' && d.code === 'MECH') ||
            (letter === 'P' && d.code === 'PIPE') ||
            (letter === 'T' && (d.code === 'TELE' || d.code === 'TELEC'))
          )
          if (match) autoDisc[letter] = match.id
        }
        setDiscMap(autoDisc)
        setStep('map')
      } catch {
        setParseError('Error al leer el archivo.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  function handleImport() {
    if (!parsed) return
    startTransition(async () => {
      const res = await bulkImportCatalog(parsed.rows, discMap, phaseMap)
      setImportResult(res)
      setStep('done')
    })
  }

  const mappedCount = Object.keys(discMap).filter(k => discMap[k]).length
  const totalDiscLetters = parsed?.discLetters.length ?? 0
  const allMapped = mappedCount === totalDiscLetters
  const sortedPhases = [...phases].sort((a, b) => a.order_index - b.order_index)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '600px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '22px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
              Importar Catálogo Completo
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              {step === 'upload' && 'Carga el archivo Catalogo_CommUp_Definitivo.xlsx'}
              {step === 'map' && `${parsed!.templateCount} templates · ${parsed!.itemCount} ítems detectados`}
              {step === 'done' && 'Importación completada'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px', padding: '2px' }}>✕</button>
        </div>

        {/* STEP: upload */}
        {step === 'upload' && (
          <div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? '#3b82f6' : '#cbd5e1'}`, borderRadius: '12px', padding: '44px 20px', textAlign: 'center', cursor: 'pointer', background: dragOver ? '#eff6ff' : '#fafafa', transition: 'all 0.15s' }}
            >
              <div style={{ fontSize: '36px', marginBottom: '10px', opacity: 0.5 }}>📋</div>
              <p style={{ fontSize: '14px', fontWeight: 500, color: '#475569', margin: '0 0 4px' }}>Arrastra el catálogo aquí</p>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 12px' }}>Catalogo_CommUp_Definitivo.xlsx o cualquier .xlsx/.xls</p>
              <p style={{ fontSize: '11px', color: '#64748b', margin: 0, padding: '8px 14px', background: '#f1f5f9', borderRadius: '6px', display: 'inline-block' }}>
                Columnas esperadas: Disciplina · Codigo_ITR · Tipo_Item · Item_No · Descripcion_Inspeccion
              </p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} style={{ display: 'none' }} />
            </div>
            {parseError && <p style={{ fontSize: '13px', color: '#ef4444', margin: '12px 0 0', padding: '10px 14px', background: '#fee2e2', borderRadius: '8px' }}>{parseError}</p>}
          </div>
        )}

        {/* STEP: map disciplines + preview */}
        {step === 'map' && parsed && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>

              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '20px' }}>
                {[
                  { label: 'Templates', value: parsed.templateCount, color: '#3b82f6' },
                  { label: 'Ítems', value: parsed.itemCount, color: '#10b981' },
                  { label: 'Disciplinas', value: parsed.discLetters.length, color: '#8b5cf6' },
                ].map(c => (
                  <div key={c.label} style={{ padding: '12px 14px', background: `${c.color}08`, border: `1px solid ${c.color}20`, borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: c.color }}>{c.value}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{c.label}</div>
                  </div>
                ))}
              </div>

              {/* Phase breakdown */}
              <div style={{ marginBottom: '20px', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px' }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Distribución por fase (detectada del código)</p>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {sortedPhases.map(p => {
                    const count = parsed.phaseBreakdown[p.code] ?? 0
                    const phaseId = phaseMap[p.code]
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: `${p.color}18`, color: p.color }}>{p.code}</span>
                        <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: 500 }}>{count} templates</span>
                        {!phaseId && count > 0 && <span style={{ fontSize: '10px', color: '#ef4444' }}>⚠ sin mapeo</span>}
                        {phaseId && count > 0 && <span style={{ fontSize: '10px', color: '#10b981' }}>✓</span>}
                      </div>
                    )
                  })}
                </div>
                {/* Allow manual phase override if needed */}
                {sortedPhases.some(p => !phaseMap[p.code] && (parsed.phaseBreakdown[p.code] ?? 0) > 0) && (
                  <div style={{ marginTop: '12px' }}>
                    <p style={{ fontSize: '11px', color: '#ef4444', margin: '0 0 8px' }}>Algunas fases no se mapearon automáticamente. Asígnalas:</p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {sortedPhases.filter(p => !phaseMap[p.code] && (parsed.phaseBreakdown[p.code] ?? 0) > 0).map(p => (
                        <label key={p.code} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#374151' }}>
                          <span style={{ fontWeight: 600 }}>Fase {p.code}</span>
                          <select
                            value={phaseMap[p.code] ?? ''}
                            onChange={e => setPhaseMap(pm => ({ ...pm, [p.code]: e.target.value }))}
                            style={selStyle}
                          >
                            <option value="">Seleccionar...</option>
                            {sortedPhases.map(ph => <option key={ph.id} value={ph.id}>{ph.code} — {ph.name}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Discipline mapping */}
              <div>
                <p style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mapeo de disciplinas</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {parsed.discLetters.map(letter => {
                    const count = parsed.rows.filter(r => r.discLetter === letter).length
                    const templateCount = new Set(parsed.rows.filter(r => r.discLetter === letter).map(r => r.code)).size
                    const mapped = discMap[letter]
                    return (
                      <div key={letter} style={{ display: 'grid', gridTemplateColumns: '40px 120px 1fr', gap: '12px', alignItems: 'center', padding: '10px 12px', background: mapped ? '#f0fdf4' : '#fffbeb', borderRadius: '8px', border: `1px solid ${mapped ? '#bbf7d0' : '#fcd34d'}` }}>
                        <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', textAlign: 'center' }}>{letter}</span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>{templateCount} templates · {count} ítems</span>
                        <select
                          value={discMap[letter] ?? ''}
                          onChange={e => setDiscMap(dm => ({ ...dm, [letter]: e.target.value }))}
                          style={selStyle}
                        >
                          <option value="">— No importar —</option>
                          {disciplines.map(d => (
                            <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
                {!allMapped && (
                  <p style={{ fontSize: '11px', color: '#f59e0b', margin: '10px 0 0' }}>
                    Las disciplinas sin mapeo se omitirán al importar.
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => { setStep('upload'); setParsed(null) }} style={{ padding: '9px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}>
                ← Volver
              </button>
              <button
                onClick={handleImport}
                disabled={isPending}
                style={{ padding: '9px 22px', background: isPending ? '#93c5fd' : '#3b82f6', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer' }}
              >
                {isPending ? 'Importando...' : `Importar ${parsed.templateCount} templates →`}
              </button>
            </div>
          </div>
        )}

        {/* STEP: done */}
        {step === 'done' && importResult && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '14px' }}>✅</div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Importación completada</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', margin: '16px 0' }}>
              {[
                { label: 'Creados', value: importResult.templatesCreated, color: '#10b981' },
                { label: 'Omitidos', value: importResult.templatesSkipped, color: '#94a3b8' },
                { label: 'Ítems', value: importResult.itemsCreated, color: '#3b82f6' },
              ].map(c => (
                <div key={c.label} style={{ padding: '12px 18px', background: `${c.color}10`, borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{c.label}</div>
                </div>
              ))}
            </div>
            {importResult.errors.length > 0 && (
              <div style={{ margin: '0 0 16px', padding: '12px 14px', background: '#fff7ed', borderRadius: '8px', textAlign: 'left', maxHeight: '120px', overflowY: 'auto' }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', margin: '0 0 6px' }}>
                  {importResult.errors.length} advertencia{importResult.errors.length > 1 ? 's' : ''}:
                </p>
                {importResult.errors.map((e, i) => <p key={i} style={{ fontSize: '11px', color: '#78350f', margin: '2px 0' }}>• {e}</p>)}
              </div>
            )}
            <button onClick={onSuccess} style={{ padding: '10px 24px', background: '#3b82f6', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>
              Ver templates →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '7px',
  fontSize: '12px', color: '#0f172a', background: 'white', cursor: 'pointer',
  fontFamily: 'inherit', flex: 1,
}
