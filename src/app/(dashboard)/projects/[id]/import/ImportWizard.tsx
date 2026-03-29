'use client'

import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { importTags, type TagRow, type ImportResult } from '@/app/actions/import'

// ── Expected Excel columns ────────────────────────────────────
// TAG | DESCRIPTION | DISCIPLINE | AREA_CODE | AREA_NAME |
// SYSTEM_CODE | SYSTEM_NAME | SUBSYSTEM_CODE | SUBSYSTEM_NAME |
// MANUFACTURER | MODEL | SERIAL | PRESERVATION

const REQUIRED_COLS = ['TAG', 'DESCRIPTION', 'DISCIPLINE']

const COLUMN_HINTS: { key: string; label: string; required: boolean; example: string }[] = [
  { key: 'TAG',            label: 'Tag Number',       required: true,  example: 'P-101' },
  { key: 'DESCRIPTION',   label: 'Descripción',       required: true,  example: 'Pump Feed Water' },
  { key: 'DISCIPLINE',    label: 'Disciplina',        required: true,  example: 'MECH / INST / ELEC' },
  { key: 'AREA_CODE',     label: 'Código Área',       required: false, example: 'AREA-01' },
  { key: 'AREA_NAME',     label: 'Nombre Área',       required: false, example: 'Area de Proceso' },
  { key: 'SYSTEM_CODE',   label: 'Código Sistema',    required: false, example: 'SYS-01' },
  { key: 'SYSTEM_NAME',   label: 'Nombre Sistema',    required: false, example: 'Sistema de Agua' },
  { key: 'SUBSYSTEM_CODE',label: 'Código Subsistema', required: false, example: 'SS-01' },
  { key: 'SUBSYSTEM_NAME',label: 'Nombre Subsistema', required: false, example: 'Subsistema Bombeo' },
  { key: 'MANUFACTURER',  label: 'Fabricante',        required: false, example: 'Grundfos' },
  { key: 'MODEL',         label: 'Modelo',            required: false, example: 'CM5-A' },
  { key: 'SERIAL',        label: 'Serial',            required: false, example: 'SN12345' },
  { key: 'PRESERVATION',  label: 'Preservación',      required: false, example: 'YES / NO' },
]

type Step = 'upload' | 'preview' | 'result'

export default function ImportWizard({
  projectId,
  projectName,
  disciplines,
}: {
  projectId: string
  projectName: string
  disciplines: { code: string; name: string; color: string }[]
}) {
  const [step, setStep] = useState<Step>('upload')
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<TagRow[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const disciplineCodes = new Set(disciplines.map(d => d.code.toUpperCase()))

  // ── File parsing ────────────────────────────────────────────

  function parseFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

        if (json.length === 0) {
          setValidationErrors(['El archivo está vacío o no tiene filas de datos.'])
          return
        }

        // Normalize headers (trim + uppercase)
        const normalized = json.map(row => {
          const out: Record<string, string> = {}
          for (const [k, v] of Object.entries(row)) {
            out[k.trim().toUpperCase().replace(/\s+/g, '_')] = String(v).trim()
          }
          return out
        })

        // Check required columns
        const firstRow = normalized[0]
        const missing = REQUIRED_COLS.filter(col => !(col in firstRow))
        if (missing.length > 0) {
          setValidationErrors([`Columnas requeridas no encontradas: ${missing.join(', ')}`])
          return
        }

        // Map to TagRow
        const errors: string[] = []
        const parsed: TagRow[] = []

        normalized.forEach((row, i) => {
          const rowNum = i + 2
          const tag = row['TAG'] || ''
          const desc = row['DESCRIPTION'] || ''
          const disc = row['DISCIPLINE'] || ''

          if (!tag) { errors.push(`Fila ${rowNum}: TAG vacío`); return }
          if (!desc) { errors.push(`Fila ${rowNum}: DESCRIPTION vacío (tag: ${tag})`); return }
          if (!disc) { errors.push(`Fila ${rowNum}: DISCIPLINE vacío (tag: ${tag})`); return }
          if (!disciplineCodes.has(disc.toUpperCase())) {
            errors.push(`Fila ${rowNum}: Disciplina "${disc}" no existe en la organización (tag: ${tag})`)
          }

          parsed.push({
            tag_number:       tag,
            description:      desc,
            discipline_code:  disc,
            area_code:        row['AREA_CODE'] || 'GENERAL',
            area_name:        row['AREA_NAME'] || 'General',
            system_code:      row['SYSTEM_CODE'] || 'GEN-SYS',
            system_name:      row['SYSTEM_NAME'] || 'General System',
            subsystem_code:   row['SUBSYSTEM_CODE'] || 'GEN-SUB',
            subsystem_name:   row['SUBSYSTEM_NAME'] || 'General Subsystem',
            manufacturer:     row['MANUFACTURER'] || undefined,
            model:            row['MODEL'] || undefined,
            serial_number:    row['SERIAL'] || undefined,
            preservation_required: ['YES', 'SI', 'SÍ', '1', 'TRUE'].includes(
              (row['PRESERVATION'] || '').toUpperCase()
            ),
          })
        })

        setValidationErrors(errors)
        setRows(parsed)
        setFileName(file.name)
        setStep('preview')
      } catch {
        setValidationErrors(['Error leyendo el archivo. Verifica que sea un .xlsx o .xls válido.'])
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }, [disciplineCodes])

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  // ── Import ──────────────────────────────────────────────────

  async function handleImport() {
    setLoading(true)
    setImportError(null)
    const validRows = rows.filter(r => disciplineCodes.has(r.discipline_code.toUpperCase()))
    const res = await importTags(projectId, validRows)
    if (res.error) {
      setImportError(res.error)
    } else {
      setResult(res.result!)
      setStep('result')
    }
    setLoading(false)
  }

  // ── Template download ───────────────────────────────────────

  function downloadTemplate() {
    const template = [
      { TAG: 'P-101', DESCRIPTION: 'Feed Water Pump', DISCIPLINE: 'MECH', AREA_CODE: 'AREA-01', AREA_NAME: 'Process Area', SYSTEM_CODE: 'SYS-01', SYSTEM_NAME: 'Water System', SUBSYSTEM_CODE: 'SS-01', SUBSYSTEM_NAME: 'Feed System', MANUFACTURER: 'Grundfos', MODEL: 'CM5-A', SERIAL: '', PRESERVATION: 'NO' },
      { TAG: 'FT-201', DESCRIPTION: 'Flow Transmitter Water', DISCIPLINE: 'INST', AREA_CODE: 'AREA-01', AREA_NAME: 'Process Area', SYSTEM_CODE: 'SYS-01', SYSTEM_NAME: 'Water System', SUBSYSTEM_CODE: 'SS-01', SUBSYSTEM_NAME: 'Feed System', MANUFACTURER: 'Endress+Hauser', MODEL: 'Promag', SERIAL: '', PRESERVATION: 'NO' },
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Tags')
    XLSX.writeFile(wb, 'CommUp_Tags_Template.xlsx')
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <a href={`/projects/${projectId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', textDecoration: 'none', marginBottom: '16px' }}>
          ← {projectName}
        </a>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', margin: 0 }}>
              Importar Tags / Equipos
            </h1>
            <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
              Carga tu lista de equipos desde Excel. Se crean áreas, sistemas y subsistemas automáticamente.
            </p>
          </div>
          <button onClick={downloadTemplate} style={{
            padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0',
            borderRadius: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            ↓ Descargar plantilla
          </button>
        </div>
      </div>

      {/* Steps indicator */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px' }}>
        {(['upload', 'preview', 'result'] as Step[]).map((s, i) => {
          const labels = ['Cargar archivo', 'Vista previa', 'Resultado']
          const done = step === 'preview' ? i < 1 : step === 'result' ? i < 2 : false
          const active = step === s
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {i > 0 && <div style={{ width: '32px', height: '1px', background: done ? '#3b82f6' : '#e2e8f0' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%', fontSize: '11px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done || active ? '#3b82f6' : '#f1f5f9',
                  color: done || active ? 'white' : '#94a3b8',
                }}>{done ? '✓' : i + 1}</div>
                <span style={{ fontSize: '13px', color: active ? '#0f172a' : '#94a3b8', fontWeight: active ? 500 : 400 }}>
                  {labels[i]}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Upload ── */}
      {step === 'upload' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragging ? '#3b82f6' : '#cbd5e1'}`,
              borderRadius: '16px', padding: '64px 32px', textAlign: 'center',
              background: dragging ? '#eff6ff' : 'white',
              transition: 'all 0.15s', cursor: 'pointer',
            }}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📊</div>
            <p style={{ fontWeight: 600, color: '#0f172a', fontSize: '16px', marginBottom: '6px' }}>
              Arrastra tu archivo Excel aquí
            </p>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px' }}>
              o haz click para seleccionar
            </p>
            <p style={{ color: '#94a3b8', fontSize: '12px' }}>.xlsx · .xls</p>
            <input id="file-input" type="file" accept=".xlsx,.xls" onChange={handleFileInput} style={{ display: 'none' }} />
          </div>

          {/* Column guide */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: '0 0 12px' }}>
              Columnas del archivo
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {COLUMN_HINTS.map(col => (
                <div key={col.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{
                    padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
                    background: col.required ? '#3b82f615' : '#f8fafc',
                    color: col.required ? '#3b82f6' : '#94a3b8',
                    border: `1px solid ${col.required ? '#3b82f630' : '#e2e8f0'}`,
                    flexShrink: 0, marginTop: '1px',
                  }}>{col.key}</span>
                  <div>
                    <div style={{ fontSize: '11px', color: '#475569', fontWeight: 500 }}>{col.label}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Ej: {col.example}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '12px', padding: '8px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <p style={{ fontSize: '11px', color: '#166534', margin: 0 }}>
                Disciplinas disponibles: {disciplines.map(d => d.code).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Preview ── */}
      {step === 'preview' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{fileName}</span>
              <span style={{ color: '#64748b', fontSize: '14px', marginLeft: '12px' }}>
                {rows.length} fila{rows.length !== 1 ? 's' : ''} detectadas
              </span>
            </div>
            <button onClick={() => { setStep('upload'); setRows([]); setValidationErrors([]) }}
              style={{ fontSize: '13px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
              ← Cambiar archivo
            </button>
          </div>

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
              <p style={{ fontWeight: 600, color: '#dc2626', fontSize: '13px', marginBottom: '6px' }}>
                ⚠ {validationErrors.length} advertencia{validationErrors.length !== 1 ? 's' : ''}
              </p>
              <ul style={{ margin: 0, paddingLeft: '16px' }}>
                {validationErrors.slice(0, 8).map((e, i) => (
                  <li key={i} style={{ fontSize: '12px', color: '#dc2626', marginBottom: '2px' }}>{e}</li>
                ))}
                {validationErrors.length > 8 && (
                  <li style={{ fontSize: '12px', color: '#dc2626' }}>... y {validationErrors.length - 8} más</li>
                )}
              </ul>
            </div>
          )}

          {/* Preview table */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '20px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['#', 'Tag', 'Descripción', 'Disciplina', 'Área', 'Sistema', 'Subsistema', 'Fabricante'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '11px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row, i) => {
                    const invalidDisc = !disciplineCodes.has(row.discipline_code.toUpperCase())
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: invalidDisc ? '#fef2f2' : 'white' }}>
                        <td style={{ padding: '9px 12px', color: '#94a3b8' }}>{i + 2}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: '#0f172a', fontFamily: 'monospace' }}>{row.tag_number}</td>
                        <td style={{ padding: '9px 12px', color: '#475569', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                            background: invalidDisc ? '#fee2e2' : '#f0fdf4',
                            color: invalidDisc ? '#dc2626' : '#166534',
                          }}>{row.discipline_code}</span>
                        </td>
                        <td style={{ padding: '9px 12px', color: '#64748b' }}>{row.area_code}</td>
                        <td style={{ padding: '9px 12px', color: '#64748b' }}>{row.system_code}</td>
                        <td style={{ padding: '9px 12px', color: '#64748b' }}>{row.subsystem_code}</td>
                        <td style={{ padding: '9px 12px', color: '#64748b' }}>{row.manufacturer || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 20 && (
              <div style={{ padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
                Mostrando 20 de {rows.length} filas
              </div>
            )}
          </div>

          {importError && (
            <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>
              {importError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={() => { setStep('upload'); setRows([]); setValidationErrors([]) }}
              style={{ padding: '10px 20px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#475569', cursor: 'pointer' }}>
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={loading || rows.length === 0}
              style={{
                padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                border: 'none', cursor: loading || rows.length === 0 ? 'not-allowed' : 'pointer',
                background: loading || rows.length === 0 ? '#e2e8f0' : '#10b981',
                color: loading || rows.length === 0 ? '#94a3b8' : 'white',
              }}
            >
              {loading ? 'Importando...' : `✓ Importar ${rows.length} tag${rows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ── */}
      {step === 'result' && result && (
        <div style={{ maxWidth: '560px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>{result.errors.length === 0 ? '✅' : '⚠️'}</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
            {result.errors.length === 0 ? 'Importación completada' : 'Importación con advertencias'}
          </h2>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '24px 0' }}>
            <div style={{ padding: '16px 28px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>{result.imported}</div>
              <div style={{ fontSize: '13px', color: '#166534' }}>Importados</div>
            </div>
            {result.skipped > 0 && (
              <div style={{ padding: '16px 28px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#ef4444' }}>{result.skipped}</div>
                <div style={{ fontSize: '13px', color: '#dc2626' }}>Omitidos</div>
              </div>
            )}
          </div>

          {result.errors.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', textAlign: 'left' }}>
              <p style={{ fontWeight: 600, color: '#dc2626', fontSize: '13px', marginBottom: '8px' }}>Filas con errores:</p>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: '12px', color: '#dc2626', marginBottom: '4px' }}>
                  Fila {e.row} · <strong>{e.tag}</strong>: {e.reason}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <a href={`/projects/${projectId}`} style={{
              padding: '10px 24px', background: '#3b82f6', color: 'white',
              borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none',
            }}>
              Ver proyecto
            </a>
            <button onClick={() => { setStep('upload'); setRows([]); setValidationErrors([]); setResult(null) }}
              style={{ padding: '10px 20px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#475569', cursor: 'pointer' }}>
              Importar más
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
