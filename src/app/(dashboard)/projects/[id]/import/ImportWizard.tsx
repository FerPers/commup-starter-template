'use client'

import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { importTags, type TagRow, type ImportResult } from '@/app/actions/import'
import { detectTagType } from '@/lib/tag-types'

// ── Column keyword mapping ──────────────────────────────────────
const COL_KEYWORDS: Record<string, string[]> = {
  tag:              ['TAG', 'ETIQUETA', 'TAG NUMBER', 'TAGNO', 'INSTRUMENT TAG'],
  description:      ['DESCRIPCION', 'DESCRIPCIÓN', 'DESCRIPTION', 'EQUIPO', 'NOMBRE', 'EQUIPMENT'],
  discipline:       ['DISCIPLINE', 'DISCIPLINA'],
  area_code:        ['AREA_CODE', 'AREA', 'ÁREA', 'SE / SITIO', 'SITIO', 'UBICACION', 'LOCATION'],
  area_name:        ['AREA_NAME', 'NOMBRE ÁREA', 'NOMBRE AREA'],
  system_code:      ['SYSTEM_CODE', 'SISTEMA', 'SYSTEM', 'SYS'],
  subsystem_code:   ['SUBSYSTEM_CODE', 'SUBSISTEMA', 'SUBSYSTEM'],
  manufacturer:     ['MANUFACTURER', 'FABRICANTE', 'MARCA', 'MARCA / MODELO', 'VENDOR'],
  model:            ['MODEL', 'MODELO'],
  serial:           ['SERIAL', 'SERIE', 'S/N', 'SERIAL_NUMBER'],
  preservation:     ['PRESERVATION', 'PRESERVACION', 'PRESERVACIÓN'],
  pid_drawing:      ['P&ID', 'PID', 'P_ID', 'PLANO P&ID', 'P&ID REF', 'P&ID DRAWING'],
  datasheet:        ['DATASHEET', 'DATA SHEET', 'DS NUMBER', 'DATASHEET NUMBER', 'NUMERO DATASHEET'],
  fluid_type:       ['FLUID TYPE', 'TIPO DE FLUIDO', 'TIPO FLUIDO', 'FLUIDO', 'FLUID'],
  mounting_typical: ['MOUNTING TYPICAL', 'TYPICAL', 'TIPICO DE MONTAJE', 'TIPICO MONTAJE', 'TÍPICO', 'TIPICO'],
}
const ALL_KEYWORDS = Object.values(COL_KEYWORDS).flat()

// ── Smart header detection ──────────────────────────────────────
// Scans first 15 rows and finds the one with the most column keyword matches.
// Also peeks at the next row (handles 2-row headers like Instrument Index).
function detectHeaderRow(rawRows: unknown[][]): {
  headerRowIdx: number
  colIndex: Record<string, number>
} {
  let bestRow = -1, bestScore = 0
  for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
    const cells = rawRows[i].map(v => String(v ?? '').trim().toUpperCase())
    const score = ALL_KEYWORDS.filter(kw => cells.some(c => c.includes(kw))).length
    if (score > bestScore) { bestScore = score; bestRow = i }
  }
  if (bestRow < 0 || bestScore < 1) return { headerRowIdx: 0, colIndex: {} }

  const h1 = rawRows[bestRow].map(v => String(v ?? '').trim().toUpperCase())
  const h2 = bestRow + 1 < rawRows.length
    ? rawRows[bestRow + 1].map(v => String(v ?? '').trim().toUpperCase())
    : []

  const colIndex: Record<string, number> = {}
  for (const [field, keywords] of Object.entries(COL_KEYWORDS)) {
    for (let col = 0; col < Math.max(h1.length, h2.length); col++) {
      if (keywords.some(kw => (h1[col] ?? '').includes(kw) || (h2[col] ?? '').includes(kw))) {
        colIndex[field] = col
        break
      }
    }
  }
  return { headerRowIdx: bestRow, colIndex }
}

// A valid tag must contain at least one letter and one digit (e.g. FT-101, ESDV-7621001)
function isValidTag(val: string): boolean {
  return /[A-Za-z]/.test(val) && /\d/.test(val)
}

function parseRows(
  rawRows: unknown[][],
  colIndex: Record<string, number>,
  dataStart: number,
  disciplinePrefill: string,
): TagRow[] {
  const result: TagRow[] = []
  for (let i = dataStart; i < rawRows.length; i++) {
    const row = rawRows[i]
    const get = (field: string) => {
      const idx = colIndex[field]
      return idx !== undefined ? String(row[idx] ?? '').trim() : ''
    }
    const tagNumber = get('tag')
    if (!tagNumber || !isValidTag(tagNumber)) continue
    const disciplineCode = (disciplinePrefill || get('discipline')).toUpperCase()
    result.push({
      tag_number:           tagNumber,
      description:          get('description'),
      discipline_code:      disciplineCode,
      area_code:            get('area_code')      || 'GENERAL',
      area_name:            get('area_name')      || 'General',
      system_code:          get('system_code')    || 'GEN-SYS',
      system_name:          get('system_code')    || 'General System',
      subsystem_code:       get('subsystem_code') || 'GEN-SUB',
      subsystem_name:       get('subsystem_code') || 'General Subsystem',
      manufacturer:         get('manufacturer')       || undefined,
      model:                get('model')              || undefined,
      serial_number:        get('serial')             || undefined,
      preservation_required: ['YES', 'SI', 'SÍ'].includes(get('preservation').toUpperCase()),
      pid_drawing:          get('pid_drawing')        || undefined,
      fluid_type:           get('fluid_type')         || undefined,
      mounting_typical:     get('mounting_typical')   || undefined,
    })
  }
  return result
}

function downloadTemplate(disciplineCode: string) {
  const wb = XLSX.utils.book_new()
  const baseHeaders = ['TAG', 'DESCRIPTION', 'AREA_CODE', 'AREA_NAME', 'SYSTEM_CODE', 'SYSTEM_NAME', 'SUBSYSTEM_CODE', 'SUBSYSTEM_NAME', 'P&ID', 'MANUFACTURER', 'MODEL', 'SERIAL', 'PRESERVATION', 'DATASHEET']
  const isInst = disciplineCode === 'INST'
  const isMec  = !isInst && disciplineCode !== 'ELEC'
  const headers = [
    ...baseHeaders,
    ...(isMec  ? ['FLUID TYPE']       : []),
    ...(isInst ? ['MOUNTING TYPICAL'] : []),
  ]
  const sample =
    isInst
      ? [['FT-101', 'Flow transmitter feed water', 'AREA-01', 'Process Area', 'SYS-01', 'Water System', 'SS-01', 'Feedwater', 'P&ID-1001', 'Rosemount', '3051S', 'SN12345', 'NO', 'DS-FT-101', 'TYP-INST-001']]
      : disciplineCode === 'ELEC'
        ? [['SWG-CPF-1', 'Medium Voltage Switchgear', 'AREA-02', 'Power Room', 'SYS-02', 'MV System', 'SS-02', 'Distribution', '', 'ABB', 'UniGear', '', 'NO', 'DS-SWG-CPF-1']]
        : [['P-101A', 'Booster Pump', 'AREA-01', 'Process Area', 'SYS-03', 'Pump System', 'SS-03', 'Booster', '', 'Grundfos', 'CM5-A', '', 'NO', 'DS-P-101A', 'Gas Natural']]
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample])
  XLSX.utils.book_append_sheet(wb, ws, 'Tags')
  XLSX.writeFile(wb, `CommUp_${disciplineCode || 'Tags'}_Template.xlsx`)
}

type Step = 'upload' | 'preview' | 'result'

export default function ImportWizard({
  projectId,
  projectName,
  disciplines,
  disciplinePrefill,
}: {
  projectId: string
  projectName: string
  disciplines: { code: string; name: string; color: string }[]
  disciplinePrefill?: { code: string; name: string; color: string }
}) {
  const [step, setStep]               = useState<Step>('upload')
  const [dragging, setDragging]       = useState(false)
  const [fileName, setFileName]       = useState<string | null>(null)
  const [rows, setRows]               = useState<TagRow[]>([])
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [loading, setLoading]         = useState(false)
  const [result, setResult]           = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [manualDiscipline, setManualDiscipline] = useState<string>('')

  const disciplineCodes  = new Set(disciplines.map(d => d.code.toUpperCase()))
  const prefillCode      = disciplinePrefill?.code.toUpperCase() ?? ''
  const effectivePrefill = prefillCode || manualDiscipline

  // ── File parsing ──────────────────────────────────────────────

  const parseFile = useCallback((file: File, disciplineCode: string) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })

        // Pick the sheet with the most keyword matches (avoids cover/index sheets)
        let bestWs = wb.Sheets[wb.SheetNames[0]]
        let bestWsScore = 0
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name]
          const testRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
          let score = 0
          for (let i = 0; i < Math.min(testRows.length, 15); i++) {
            const cells = testRows[i].map(v => String(v ?? '').trim().toUpperCase())
            score += ALL_KEYWORDS.filter(kw => cells.some(c => c.includes(kw))).length
          }
          if (score > bestWsScore) { bestWsScore = score; bestWs = ws }
        }

        const rawRows: unknown[][] = XLSX.utils.sheet_to_json(bestWs, { header: 1, defval: '' })

        if (rawRows.length === 0) {
          setParseWarnings(['El archivo está vacío.']); return
        }

        const { headerRowIdx, colIndex } = detectHeaderRow(rawRows)
        const warnings: string[] = []

        if (colIndex['tag'] === undefined) {
          warnings.push('No se encontró columna TAG / ETIQUETA. Verifica que tu archivo tenga encabezados reconocibles.')
        }

        const parsed = parseRows(rawRows, colIndex, headerRowIdx + 1, disciplineCode)

        if (parsed.length === 0) {
          setParseWarnings([...warnings, 'No se encontraron filas de datos válidas (TAG debe contener letras y números).']); return
        }

        if (!disciplineCode) {
          const unknown = [...new Set(parsed.map(r => r.discipline_code).filter(c => !disciplineCodes.has(c)))]
          if (unknown.length > 0) warnings.push(`Disciplinas no reconocidas: ${unknown.join(', ')} — esas filas serán omitidas.`)
        }

        setParseWarnings(warnings)
        setFileName(file.name)
        setRows(parsed)
        setStep('preview')
      } catch {
        setParseWarnings(['Error al leer el archivo. Verifica que sea un .xlsx o .xls válido.'])
      }
    }
    reader.readAsArrayBuffer(file)
  }, [disciplineCodes])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file, effectivePrefill)
  }, [parseFile, effectivePrefill])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file, effectivePrefill)
  }

  async function handleImport() {
    setLoading(true); setImportError(null)
    const { error, result: res } = await importTags(projectId, rows)
    setLoading(false)
    if (error) { setImportError(error); return }
    setResult(res!); setStep('result')
  }

  const hasPid      = rows.some(r => r.pid_drawing)
  const validRows   = rows.filter(r => effectivePrefill ? true : disciplineCodes.has(r.discipline_code))
  const invalidRows = rows.filter(r => !effectivePrefill && !disciplineCodes.has(r.discipline_code))

  return (
    <div style={{ padding: '32px' }}>

      <a href={`/projects/${projectId}/tags`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
        ← {projectName}
      </a>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            Importar Tags / Equipos
            {disciplinePrefill && (
              <span style={{
                padding: '3px 10px', borderRadius: '6px', fontSize: '14px', fontWeight: 700,
                background: `${disciplinePrefill.color}18`, color: disciplinePrefill.color,
              }}>
                {disciplinePrefill.code} — {disciplinePrefill.name}
              </span>
            )}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Carga tu lista desde Excel. Se crean áreas, sistemas y subsistemas automáticamente.
          </p>
        </div>
        {step === 'upload' && (
          <button onClick={() => downloadTemplate(prefillCode || 'MECH')} style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            ↓ Descargar plantilla
          </button>
        )}
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px' }}>
        {(['upload', 'preview', 'result'] as Step[]).map((s, i) => {
          const labels = ['Cargar archivo', 'Vista previa', 'Resultado']
          const done   = (step === 'preview' && i === 0) || step === 'result'
          const active = step === s
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <div style={{ width: '40px', height: '1px', background: (done || active) ? '#3b82f6' : 'var(--border)' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 600,
                  background: done ? '#3b82f6' : active ? '#eff6ff' : 'var(--gray-100)',
                  color:      done ? 'var(--card-bg)'   : active ? '#3b82f6' : 'var(--gray-400)',
                  border: active ? '2px solid #3b82f6' : '2px solid transparent',
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: '13px', color: active ? '#1e40af' : 'var(--gray-400)', fontWeight: active ? 500 : 400 }}>{labels[i]}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── STEP 1: Upload ─────────────────────────────────── */}
      {step === 'upload' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', alignItems: 'start' }}>

          {/* Left column: discipline picker (when no URL prefill) + drop zone */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {!disciplinePrefill && (
            <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Disciplina:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', flex: 1 }}>
                {disciplines.map(d => (
                  <button
                    key={d.code}
                    onClick={() => setManualDiscipline(manualDiscipline === d.code ? '' : d.code)}
                    style={{
                      padding: '5px 14px', borderRadius: '7px', border: '1px solid',
                      borderColor: manualDiscipline === d.code ? d.color : 'var(--border)',
                      background: manualDiscipline === d.code ? `${d.color}15` : 'var(--card-bg)',
                      color: manualDiscipline === d.code ? d.color : 'var(--text-muted)',
                      fontSize: '12px', fontWeight: manualDiscipline === d.code ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {d.code}
                  </button>
                ))}
              </div>
              {!manualDiscipline && (
                <span style={{ fontSize: '11px', color: '#f59e0b', whiteSpace: 'nowrap' }}>Selecciona una disciplina</span>
              )}
            </div>
          )}

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById('file-input')?.click()}
            style={{
              border: `2px dashed ${dragging ? '#3b82f6' : 'var(--gray-300)'}`,
              borderRadius: '14px', padding: '56px 32px', textAlign: 'center',
              background: dragging ? '#eff6ff' : 'var(--card-bg)',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.4 }}>⊞</div>
            <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-muted)', margin: '0 0 6px' }}>Arrastra tu archivo Excel aquí</p>
            <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: '0 0 20px' }}>o haz clic para seleccionar (.xlsx, .xls)</p>
            <input id="file-input" type="file" accept=".xlsx,.xls" onChange={onFileChange} style={{ display: 'none' }} />
            <span style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 500, pointerEvents: 'none' }}>
              Seleccionar archivo
            </span>
            {parseWarnings.length > 0 && (
              <div style={{ marginTop: '20px', padding: '12px', background: '#fef3c7', borderRadius: '8px', textAlign: 'left' }}>
                {parseWarnings.map((w, i) => <p key={i} style={{ fontSize: '12px', color: '#92400e', margin: '2px 0' }}>⚠ {w}</p>)}
              </div>
            )}
          </div>
          </div>{/* end left column */}

          {/* Column guide */}
          <div style={{ background: 'var(--gray-50)', borderRadius: '12px', border: '1px solid var(--border)', padding: '20px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Columnas detectadas automáticamente
            </p>
            {[
              { key: 'TAG / ETIQUETA',           req: true,  note: 'ESDV-7621001, FT-101, P-762A' },
              { key: 'DESCRIPCION / EQUIPO',      req: true,  note: 'Descripción del instrumento' },
              { key: 'P&ID',                      req: false, note: 'Número de plano P&ID' },
              { key: 'AREA_CODE / SE/Sitio',      req: false, note: 'Código de área' },
              { key: 'SYSTEM_CODE / SISTEMA',     req: false, note: 'Código de sistema' },
              { key: 'SUBSYSTEM_CODE',            req: false, note: 'Código de subsistema' },
              { key: 'FABRICANTE / MARCA/MODELO', req: false, note: 'Fabricante y modelo' },
              { key: 'DATASHEET',               req: false, note: 'Código de hoja de datos (todos)' },
              { key: 'FLUID TYPE / FLUIDO',      req: false, note: 'Tipo de fluido (MEC/tubería)' },
              { key: 'MOUNTING TYPICAL / TIPICO',req: false, note: 'Típico de montaje (INST)' },
            ].map(col => (
              <div key={col.key} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '10px' }}>
                <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, flexShrink: 0, marginTop: '2px', background: col.req ? '#fee2e2' : 'var(--gray-100)', color: col.req ? '#dc2626' : 'var(--text-muted)' }}>
                  {col.req ? 'REQ' : 'OPT'}
                </span>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{col.key}</div>
                  <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{col.note}</div>
                </div>
              </div>
            ))}
            {!disciplinePrefill && (
              <>
                <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />
                <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Disciplinas disponibles</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {disciplines.map(d => <span key={d.code} style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: `${d.color}18`, color: d.color }}>{d.code}</span>)}
                </div>
              </>
            )}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: '14px', paddingTop: '12px' }}>
              <p style={{ fontSize: '11px', color: 'var(--gray-400)', margin: 0 }}>
                El encabezado puede estar en cualquier fila — se detecta automáticamente. Compatible con Instrument Index, listas eléctricas y mecánicas.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview ────────────────────────────────── */}
      {step === 'preview' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text-strong)' }}>{fileName}</strong>
              <span style={{ margin: '0 8px', color: 'var(--gray-300)' }}>·</span>
              <span style={{ color: '#10b981', fontWeight: 500 }}>{validRows.length} válidos</span>
              {invalidRows.length > 0 && <span style={{ color: '#ef4444', fontWeight: 500, marginLeft: '8px' }}>{invalidRows.length} omitidos</span>}
            </div>
            <button onClick={() => { setStep('upload'); setRows([]); setFileName(null) }} style={{ fontSize: '13px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>← Cambiar archivo</button>
          </div>

          {parseWarnings.length > 0 && (
            <div style={{ padding: '12px 16px', background: '#fef3c7', borderRadius: '10px', marginBottom: '14px', border: '1px solid #fde68a' }}>
              {parseWarnings.map((w, i) => <p key={i} style={{ fontSize: '13px', color: '#92400e', margin: '2px 0' }}>⚠ {w}</p>)}
            </div>
          )}

          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'auto', marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <Th>#</Th><Th>TAG</Th><Th>Descripción</Th><Th>Tipo detectado</Th><Th>Disciplina</Th>
                  <Th>Área / Sistema / Subsistema</Th>
                  {hasPid && <Th>P&ID</Th>}
                  <Th>Fabricante</Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 30).map((row, i) => {
                  const isInvalid = !effectivePrefill && !disciplineCodes.has(row.discipline_code)
                  const d = disciplines.find(x => x.code.toUpperCase() === row.discipline_code)
                  const manualD = disciplines.find(x => x.code.toUpperCase() === manualDiscipline)
                  const dColor = d?.color ?? (disciplinePrefill?.color ?? manualD?.color ?? 'var(--gray-400)')
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: isInvalid ? '#fff5f5' : undefined }}>
                      <td style={tdStyle}><span style={{ color: 'var(--gray-300)' }}>{i + 1}</span></td>
                      <td style={tdStyle}><span style={{ fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'monospace' }}>{row.tag_number}</span></td>
                      <td style={tdStyle}><span style={{ color: 'var(--text-muted)' }}>{row.description || '—'}</span></td>
                      <td style={tdStyle}>{(() => {
                        const t = detectTagType(row.tag_number)
                        return t
                          ? <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', whiteSpace: 'nowrap' }}>{t.typeName}</span>
                          : <span style={{ fontSize: '11px', color: 'var(--gray-300)' }}>—</span>
                      })()}</td>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 700, background: `${dColor}18`, color: isInvalid ? '#ef4444' : dColor }}>
                          {row.discipline_code || '?'}
                        </span>
                      </td>
                      <td style={tdStyle}><span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11px' }}>{[row.area_code, row.system_code, row.subsystem_code].join(' / ')}</span></td>
                      {hasPid && <td style={tdStyle}><span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>{row.pid_drawing || '—'}</span></td>}
                      <td style={tdStyle}><span style={{ color: 'var(--text-muted)' }}>{row.manufacturer || '—'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length > 30 && <div style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--gray-400)', borderTop: '1px solid #f1f5f9' }}>Mostrando 30 de {rows.length} filas</div>}
          </div>

          {importError && (
            <div style={{ padding: '12px 16px', background: '#fef2f2', borderRadius: '10px', border: '1px solid #fca5a5', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>{importError}</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <a href={`/projects/${projectId}/tags`} style={{ padding: '10px 20px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Cancelar</a>
            <button onClick={handleImport} disabled={loading || validRows.length === 0} style={{ padding: '10px 24px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: loading ? 'wait' : 'pointer', opacity: validRows.length === 0 ? 0.5 : 1 }}>
              {loading ? 'Importando…' : `✓ Importar ${validRows.length} tags`}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Result ─────────────────────────────────── */}
      {step === 'result' && result && (
        <div style={{ textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '52px', marginBottom: '12px' }}>{result.errors.length === 0 ? '✅' : '⚠️'}</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 24px' }}>Importación completada</h2>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '32px' }}>
            <div style={{ padding: '20px 32px', background: '#ecfdf5', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>{result.imported}</div>
              <div style={{ fontSize: '13px', color: '#059669', marginTop: '4px' }}>Importados</div>
            </div>
            {result.skipped > 0 && (
              <div style={{ padding: '20px 32px', background: '#fef3c7', borderRadius: '12px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#d97706' }}>{result.skipped}</div>
                <div style={{ fontSize: '13px', color: '#b45309', marginTop: '4px' }}>Omitidos</div>
              </div>
            )}
          </div>
          {result.errors.length > 0 && (
            <div style={{ textAlign: 'left', background: '#fef2f2', borderRadius: '10px', padding: '16px', marginBottom: '24px', border: '1px solid #fca5a5' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: '#dc2626', margin: '0 0 8px' }}>Errores:</p>
              {result.errors.slice(0, 10).map((e, i) => <p key={i} style={{ fontSize: '12px', color: '#991b1b', margin: '2px 0', fontFamily: 'monospace' }}>Fila {e.row} [{e.tag}]: {e.reason}</p>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <a href={`/projects/${projectId}/tags`} style={{ padding: '10px 22px', background: '#3b82f6', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 500, textDecoration: 'none' }}>Ver tags →</a>
            <button onClick={() => { setStep('upload'); setRows([]); setFileName(null); setResult(null) }} style={{ padding: '10px 22px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}>Importar más</button>
          </div>
        </div>
      )}

    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{children}</th>
}
const tdStyle: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' }
