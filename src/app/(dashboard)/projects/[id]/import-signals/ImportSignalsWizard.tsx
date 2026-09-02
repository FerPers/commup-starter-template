'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { importSignals, type SignalRow, type SignalImportResult } from '@/app/actions/import-signals'
import { pickBestSheet, detectHeaderRow, cellText, type ColumnKeywords } from '@/lib/excel/detect-header'

const SIGNAL_TYPES = ['AI', 'AO', 'DI', 'DO', 'PI', 'PO']

// Misma detección de hoja/encabezado que el importador de tags: el encabezado
// puede estar en cualquiera de las primeras 15 filas y la hoja correcta se
// elige por coincidencias. Orden importante: "TAG INSTRUMENTO" se asigna antes
// de que "TAG" (parcial) pueda quedarse con esa columna.
const SIGNAL_COLS: ColumnKeywords = {
  instrument_tag:  ['TAG INSTRUMENTO', 'INSTRUMENT TAG', 'INSTRUMENTO', 'TAG EQUIPO'],
  signal_tag:      ['TAG DE SEÑAL', 'TAG SEÑAL', 'SIGNAL TAG', 'TAG'],
  description:     ['DESCRIPCION', 'DESCRIPTION', 'DESC'],
  signal_type:     ['TIPO DE SEÑAL', 'TIPO SEÑAL', 'SIGNAL TYPE', 'I/O TYPE', 'IO TYPE', 'TIPO'],
  discipline:      ['DISCIPLINA', 'DISCIPLINE'],
  service:         ['SERVICIO', 'SERVICE'],
  range_min:       ['INF.', 'INF', 'RANGE MIN', 'RANGO INF', 'LRV'],
  range_max:       ['SUP.', 'SUP', 'RANGE MAX', 'RANGO SUP', 'URV'],
  eng_unit:        ['UNIDAD', 'UNIT', 'ENG UNIT', 'UNITS'],
  alarms:          ['ALARMAS / SET POINT', 'ALARMAS', 'SETPOINT', 'SET POINT'],
  origin:          ['ORIGEN DE LA SEÑAL', 'ORIGEN', 'ORIGIN'],
  destination:     ['DESTINO DE LA SEÑAL', 'DESTINO', 'DESTINATION'],
  pid:             ['P&ID', 'PID', 'PLANO P&ID'],
  loop_diagram:    ['DIAGRAMA DE LAZO', 'LOOP DIAGRAM'],
  wiring_diagram:  ['DIAGRAMA DE CABLEADO', 'WIRING DIAGRAM'],
  notes:           ['NOTAS', 'NOTES', 'OBSERVACIONES'],
  area_code:       ['AREA CODE', 'AREA', 'SITIO', 'UBICACION', 'LOCATION'],
  area_name:       ['AREA NAME', 'NOMBRE AREA'],
  system_code:     ['SYSTEM CODE', 'SISTEMA', 'SYSTEM'],
  system_name:     ['SYSTEM NAME', 'NOMBRE SISTEMA'],
  subsystem_code:  ['SUBSYSTEM CODE', 'SUBSISTEMA', 'SUBSYSTEM'],
  subsystem_name:  ['SUBSYSTEM NAME', 'NOMBRE SUBSISTEMA'],
}

type Step = 'upload' | 'preview' | 'result'

export default function ImportSignalsWizard({
  projectId,
  projectName,
  disciplines,
}: {
  projectId: string
  projectName: string
  disciplines: { code: string; name: string; color: string }[]
}) {
  const [step, setStep]                   = useState<Step>('upload')
  const [dragging, setDragging]           = useState(false)
  const [fileName, setFileName]           = useState<string | null>(null)
  const [rows, setRows]                   = useState<SignalRow[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [loading, setLoading]             = useState(false)
  const [result, setResult]               = useState<SignalImportResult | null>(null)
  const [importError, setImportError]     = useState<string | null>(null)

  const disciplineCodes = new Set(disciplines.map(d => d.code.toUpperCase()))

  const signalTypeColors: Record<string, string> = {
    AI: '#3b82f6', AO: '#f59e0b', DI: '#10b981', DO: '#ef4444', PI: '#8b5cf6', PO: '#06b6d4',
  }

  function parseNum(val: string): number | null {
    const n = parseFloat(val?.toString().replace(',', '.'))
    return isNaN(n) ? null : n
  }

  function parseFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const { rows: rawRows } = pickBestSheet(wb, SIGNAL_COLS)

        if (rawRows.length === 0) {
          setValidationErrors(['El archivo está vacío.'])
          return
        }

        const { headerRowIdx, colIndex } = detectHeaderRow(rawRows, SIGNAL_COLS)

        if (colIndex.signal_tag === undefined || colIndex.signal_type === undefined) {
          setValidationErrors([`Columnas requeridas no encontradas. Se esperan: TAG DE SEÑAL, TIPO DE SEÑAL, DISCIPLINA (o sus equivalentes en inglés). El encabezado puede estar en cualquiera de las primeras 15 filas.`])
          return
        }

        const errors: string[] = []
        const parsed: SignalRow[] = []

        rawRows.slice(headerRowIdx + 1).forEach((row, i) => {
          const rowNum = headerRowIdx + i + 2
          const get = (field: string) => cellText(row, colIndex[field])

          const signalTag    = get('signal_tag')
          const instrTag     = get('instrument_tag') || signalTag
          const description  = get('description')
          const signalType   = get('signal_type').toUpperCase()
          const discipline   = (get('discipline') || 'INST').toUpperCase()
          const service      = get('service')
          const rangeInf     = get('range_min')
          const rangeSup     = get('range_max')
          const unit         = get('eng_unit')
          const alarms       = get('alarms')
          const origin       = get('origin')
          const destination  = get('destination')
          const pid          = get('pid')
          const loopDiag     = get('loop_diagram')
          const wiringDiag   = get('wiring_diagram')
          const notes        = get('notes')
          const areaCode     = get('area_code') || 'GENERAL'
          const areaName     = get('area_name') || areaCode
          const sysCode      = get('system_code') || 'GEN-SYS'
          const sysName      = get('system_name') || sysCode
          const subCode      = get('subsystem_code') || 'GEN-SUB'
          const subName      = get('subsystem_name') || subCode

          // Filas vacías o de totales/notas al pie: sin tag, se ignoran en silencio
          if (!signalTag) return
          if (!SIGNAL_TYPES.includes(signalType)) {
            errors.push(`Fila ${rowNum}: TIPO_DE_SEÑAL "${signalType}" inválido (válidos: ${SIGNAL_TYPES.join(', ')}) — tag: ${signalTag}`)
          }
          if (!disciplineCodes.has(discipline)) {
            errors.push(`Fila ${rowNum}: DISCIPLINA "${discipline}" no existe — tag: ${signalTag}`)
          }

          parsed.push({
            signal_tag:      signalTag,
            instrument_tag:  instrTag,
            description,
            signal_type:     signalType || 'AI',
            service,
            range_min:       parseNum(rangeInf),
            range_max:       parseNum(rangeSup),
            eng_unit:        unit,
            alarm_setpoints: alarms,
            origin,
            destination,
            pid_drawing:     pid,
            loop_diagram:    loopDiag,
            wiring_diagram:  wiringDiag,
            notes,
            discipline_code: discipline,
            area_code:       areaCode,
            area_name:       areaName,
            system_code:     sysCode,
            system_name:     sysName,
            subsystem_code:  subCode,
            subsystem_name:  subName,
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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  async function handleImport() {
    setLoading(true)
    setImportError(null)
    const res = await importSignals(projectId, rows)
    if (res.error) {
      setImportError(res.error)
    } else {
      setResult(res.result!)
      setStep('result')
    }
    setLoading(false)
  }

  function downloadTemplate() {
    // Multi-row template with realistic I&C signal examples
    const template = [
      {
        'TAG DE SEÑAL': 'FT-201', 'TAG INSTRUMENTO': 'FT-201', 'DESCRIPCION': 'Flow Transmitter - Feed Water', 'TIPO DE SEÑAL': 'AI',
        'DISCIPLINA': 'INST', 'SERVICIO': 'Agua de Alimentación',
        'INF.': 0, 'SUP.': 100, 'UNIDAD': 'm³/h',
        'ALARMAS / Set Point': 'LAL=5 / LAH=95',
        'ORIGEN DE LA SEÑAL': 'FT-201 / 4-20mA', 'DESTINO DE LA SEÑAL': 'DCS-AI-001',
        'P&ID': 'P&ID-001', 'DIAGRAMA DE LAZO': 'LD-201', 'DIAGRAMA DE CABLEADO': 'WD-201', 'NOTAS': '',
        'AREA_CODE': 'AREA-01', 'AREA_NAME': 'Area de Proceso', 'SYSTEM_CODE': 'SYS-01', 'SYSTEM_NAME': 'Sistema de Agua', 'SUBSYSTEM_CODE': 'SS-01', 'SUBSYSTEM_NAME': 'Feed System',
      },
      {
        'TAG DE SEÑAL': 'PT-101', 'TAG INSTRUMENTO': 'PT-101', 'DESCRIPCION': 'Pressure Transmitter - Suction', 'TIPO DE SEÑAL': 'AI',
        'DISCIPLINA': 'INST', 'SERVICIO': 'Succión Bomba',
        'INF.': 0, 'SUP.': 10, 'UNIDAD': 'bar',
        'ALARMAS / Set Point': 'LAL=0.5 / HAH=9',
        'ORIGEN DE LA SEÑAL': 'PT-101 / 4-20mA', 'DESTINO DE LA SEÑAL': 'DCS-AI-002',
        'P&ID': 'P&ID-001', 'DIAGRAMA DE LAZO': 'LD-101', 'DIAGRAMA DE CABLEADO': 'WD-101', 'NOTAS': '',
        'AREA_CODE': 'AREA-01', 'AREA_NAME': 'Area de Proceso', 'SYSTEM_CODE': 'SYS-01', 'SYSTEM_NAME': 'Sistema de Agua', 'SUBSYSTEM_CODE': 'SS-01', 'SUBSYSTEM_NAME': 'Feed System',
      },
      {
        'TAG DE SEÑAL': 'XV-301-ZO', 'TAG INSTRUMENTO': 'XV-301', 'DESCRIPCION': 'Valve Open - Feed Control Valve', 'TIPO DE SEÑAL': 'DI',
        'DISCIPLINA': 'INST', 'SERVICIO': 'Válvula Control Feed',
        'INF.': '', 'SUP.': '', 'UNIDAD': '',
        'ALARMAS / Set Point': '',
        'ORIGEN DE LA SEÑAL': 'XV-301 / ZO Contact', 'DESTINO DE LA SEÑAL': 'DCS-DI-005',
        'P&ID': 'P&ID-002', 'DIAGRAMA DE LAZO': 'LD-301', 'DIAGRAMA DE CABLEADO': 'WD-301', 'NOTAS': 'Interlock SIS-01',
        'AREA_CODE': 'AREA-01', 'AREA_NAME': 'Area de Proceso', 'SYSTEM_CODE': 'SYS-01', 'SYSTEM_NAME': 'Sistema de Agua', 'SUBSYSTEM_CODE': 'SS-01', 'SUBSYSTEM_NAME': 'Feed System',
      },
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    // Set column widths
    ws['!cols'] = [16, 16, 30, 14, 12, 20, 8, 8, 10, 20, 20, 20, 10, 14, 18, 10, 10, 12, 16, 14, 18].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Señales')
    XLSX.writeFile(wb, 'CommUp_Signals_Template.xlsx')
  }

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <a href={`/projects/${projectId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '16px' }}>
          ← {projectName}
        </a>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>
              Importar Lista de Señales
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
              Carga tu Signal List (I&C) desde Excel. Incluye rango, alarmas, P&IDs y diagramas.
            </p>
          </div>
          <button onClick={downloadTemplate} style={{
            padding: '8px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer',
          }}>
            ↓ Descargar plantilla
          </button>
        </div>
      </div>

      {/* Signal types legend */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {SIGNAL_TYPES.map(t => (
          <span key={t} style={{
            padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
            background: `${signalTypeColors[t]}18`, color: signalTypeColors[t],
            border: `1px solid ${signalTypeColors[t]}30`,
          }}>
            {t} — {t === 'AI' ? 'Analog In' : t === 'AO' ? 'Analog Out' : t === 'DI' ? 'Digital In' : t === 'DO' ? 'Digital Out' : t === 'PI' ? 'Pulse In' : 'Pulse Out'}
          </span>
        ))}
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px' }}>
        {(['upload', 'preview', 'result'] as Step[]).map((s, i) => {
          const labels = ['Cargar archivo', 'Vista previa', 'Resultado']
          const done = step === 'preview' ? i < 1 : step === 'result' ? i < 2 : false
          const active = step === s
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {i > 0 && <div style={{ width: '32px', height: '1px', background: done ? '#3b82f6' : 'var(--border)' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%', fontSize: '11px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done || active ? '#3b82f6' : 'var(--gray-100)',
                  color: done || active ? '#fff' : 'var(--gray-400)',
                }}>{done ? '✓' : i + 1}</div>
                <span style={{ fontSize: '13px', color: active ? 'var(--text-strong)' : 'var(--gray-400)', fontWeight: active ? 500 : 400 }}>{labels[i]}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Upload ── */}
      {step === 'upload' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('sig-file-input')?.click()}
            style={{
              border: `2px dashed ${dragging ? '#3b82f6' : 'var(--gray-300)'}`,
              borderRadius: '16px', padding: '64px 32px', textAlign: 'center',
              background: dragging ? '#eff6ff' : 'var(--card-bg)', transition: 'all 0.15s', cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📋</div>
            <p style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: '16px', marginBottom: '6px' }}>
              Arrastra tu Signal List aquí
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '8px' }}>o haz click para seleccionar</p>
            <p style={{ color: 'var(--gray-400)', fontSize: '12px' }}>.xlsx · .xls</p>
            <input id="sig-file-input" type="file" accept=".xlsx,.xls" onChange={handleFileInput} style={{ display: 'none' }} />
          </div>

          {/* Column reference */}
          <div style={{ background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', padding: '20px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 12px' }}>
              Columnas soportadas
            </h3>
            {[
              { col: 'TAG DE SEÑAL', req: true,  desc: 'Identificador de la señal (ej: FT-201)' },
              { col: 'TAG INSTRUMENTO', req: false, desc: 'Instrumento padre (si difiere del tag)' },
              { col: 'DESCRIPCION', req: false, desc: 'Descripción de la señal' },
              { col: 'TIPO DE SEÑAL', req: true,  desc: 'AI / AO / DI / DO / PI / PO' },
              { col: 'DISCIPLINA', req: true,  desc: 'INST / ELEC / SAFE …' },
              { col: 'SERVICIO', req: false, desc: 'Servicio del proceso' },
              { col: 'INF. / SUP. / UNIDAD', req: false, desc: 'Rango de medición' },
              { col: 'ALARMAS / Set Point', req: false, desc: 'Niveles de alarma y setpoints' },
              { col: 'ORIGEN / DESTINO', req: false, desc: 'Origen y destino de la señal' },
              { col: 'P&ID / DIAGRAMAS', req: false, desc: 'Referencias de planos' },
              { col: 'NOTAS', req: false, desc: 'Notas adicionales' },
            ].map(item => (
              <div key={item.col} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-start' }}>
                <span style={{
                  padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 700,
                  background: item.req ? '#3b82f615' : 'var(--gray-50)',
                  color: item.req ? '#3b82f6' : 'var(--gray-400)',
                  border: `1px solid ${item.req ? '#3b82f630' : 'var(--border)'}`,
                  flexShrink: 0, marginTop: '2px', whiteSpace: 'nowrap',
                }}>{item.req ? 'REQ' : 'OPC'}</span>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-strong)', fontWeight: 500, fontFamily: 'monospace' }}>{item.col}</div>
                  <div style={{ fontSize: '10px', color: 'var(--gray-400)' }}>{item.desc}</div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: '10px', padding: '8px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <p style={{ fontSize: '11px', color: '#166534', margin: 0 }}>
                Disciplinas: {disciplines.map(d => d.code).join(', ')}
              </p>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--gray-400)', margin: '10px 0 0' }}>
              El encabezado puede estar en cualquier fila y la hoja se detecta automáticamente. Si el TAG INSTRUMENTO ya existe en el proyecto, se conserva tal cual.
            </p>
          </div>
        </div>
      )}

      {/* ── Step 2: Preview ── */}
      {step === 'preview' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{fileName}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '14px', marginLeft: '12px' }}>{rows.length} señales detectadas</span>
            </div>
            <button onClick={() => { setStep('upload'); setRows([]); setValidationErrors([]) }}
              style={{ fontSize: '13px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              ← Cambiar archivo
            </button>
          </div>

          {validationErrors.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
              <p style={{ fontWeight: 600, color: '#dc2626', fontSize: '13px', marginBottom: '6px' }}>⚠ {validationErrors.length} advertencia(s)</p>
              <ul style={{ margin: 0, paddingLeft: '16px' }}>
                {validationErrors.slice(0, 8).map((e, i) => (
                  <li key={i} style={{ fontSize: '12px', color: '#dc2626', marginBottom: '2px' }}>{e}</li>
                ))}
                {validationErrors.length > 8 && <li style={{ fontSize: '12px', color: '#dc2626' }}>... y {validationErrors.length - 8} más</li>}
              </ul>
            </div>
          )}

          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '20px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                    {['#', 'Tag Señal', 'Tag Instr.', 'Tipo', 'Descripción', 'Servicio', 'Rango', 'Unidad', 'Alarmas', 'Origen → Destino', 'P&ID'].map(h => (
                      <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 25).map((row, i) => {
                    const badType = !SIGNAL_TYPES.includes(row.signal_type.toUpperCase())
                    const badDisc = !disciplineCodes.has(row.discipline_code.toUpperCase())
                    const hasErr  = badType || badDisc
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: hasErr ? '#fef2f2' : 'var(--card-bg)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--gray-400)' }}>{i + 2}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.signal_tag}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.instrument_tag !== row.signal_tag ? row.instrument_tag : '='}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            padding: '2px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 700,
                            background: badType ? '#fee2e2' : `${signalTypeColors[row.signal_type] ?? 'var(--gray-400)'}18`,
                            color: badType ? '#dc2626' : signalTypeColors[row.signal_type] ?? 'var(--gray-400)',
                          }}>{row.signal_type}</span>
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.service || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {row.range_min !== null && row.range_max !== null ? `${row.range_min} – ${row.range_max}` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{row.eng_unit || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.alarm_setpoints || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {row.origin && row.destination ? `${row.origin} → ${row.destination}` : row.origin || row.destination || '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.pid_drawing || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 25 && (
              <div style={{ padding: '10px 16px', background: 'var(--gray-50)', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: 'var(--gray-400)', textAlign: 'center' }}>
                Mostrando 25 de {rows.length} señales
              </div>
            )}
          </div>

          {importError && (
            <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>{importError}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={() => { setStep('upload'); setRows([]); setValidationErrors([]) }}
              style={{ padding: '10px 20px', background: 'var(--gray-100)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', color: 'var(--text-muted)', cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={handleImport} disabled={loading || rows.length === 0}
              style={{
                padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, border: 'none',
                cursor: loading || rows.length === 0 ? 'not-allowed' : 'pointer',
                background: loading || rows.length === 0 ? 'var(--border)' : '#10b981',
                color: loading || rows.length === 0 ? 'var(--gray-400)' : 'var(--card-bg)',
              }}>
              {loading ? 'Importando...' : `✓ Importar ${rows.length} señal${rows.length !== 1 ? 'es' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ── */}
      {step === 'result' && result && (
        <div style={{ maxWidth: '560px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>{result.errors.length === 0 ? '✅' : '⚠️'}</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '6px' }}>
            {result.errors.length === 0 ? 'Importación completada' : 'Importación con advertencias'}
          </h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '24px 0', flexWrap: 'wrap' }}>
            <div style={{ padding: '16px 28px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>{result.imported}</div>
              <div style={{ fontSize: '13px', color: '#166534' }}>Señales nuevas</div>
            </div>
            {result.updated > 0 && (
              <div style={{ padding: '16px 28px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#2563eb' }}>{result.updated}</div>
                <div style={{ fontSize: '13px', color: '#1e40af' }}>Actualizadas</div>
              </div>
            )}
            {result.tagsCreated > 0 && (
              <div style={{ padding: '16px 28px', background: '#f5f3ff', borderRadius: '12px', border: '1px solid #ddd6fe' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#7c3aed' }}>{result.tagsCreated}</div>
                <div style={{ fontSize: '13px', color: '#5b21b6' }}>Tags instrumento creados</div>
              </div>
            )}
            {result.skipped > 0 && (
              <div style={{ padding: '16px 28px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#ef4444' }}>{result.skipped}</div>
                <div style={{ fontSize: '13px', color: '#dc2626' }}>Omitidas</div>
              </div>
            )}
          </div>
          {result.warnings.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px', marginBottom: '12px', textAlign: 'left' }}>
              {result.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>⚠ {w}</div>
              ))}
            </div>
          )}
          {result.errors.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px', marginBottom: '20px', textAlign: 'left' }}>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: '12px', color: '#dc2626', marginBottom: '4px' }}>
                  Fila {e.row} · <strong>{e.tag}</strong>: {e.reason}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <a href={`/projects/${projectId}`} style={{ padding: '10px 24px', background: '#3b82f6', color: '#fff', borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>
              Ver proyecto
            </a>
            <button onClick={() => { setStep('upload'); setRows([]); setValidationErrors([]); setResult(null) }}
              style={{ padding: '10px 20px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', color: 'var(--text-muted)', cursor: 'pointer' }}>
              Importar más
            </button>
          </div>
        </div>
      )}
    </div>
  )

}
