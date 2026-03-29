'use client'

import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { importSignals, type SignalRow, type SignalImportResult } from '@/app/actions/import-signals'

const SIGNAL_TYPES = ['AI', 'AO', 'DI', 'DO', 'PI', 'PO']

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
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

        if (json.length === 0) {
          setValidationErrors(['El archivo está vacío.'])
          return
        }

        // Normalize headers
        const normalized = json.map(row => {
          const out: Record<string, string> = {}
          for (const [k, v] of Object.entries(row)) {
            out[k.trim().toUpperCase().replace(/\s+/g, '_')] = String(v).trim()
          }
          return out
        })

        const first = normalized[0]
        const required = ['TAG_DE_SEÑAL', 'TIPO_DE_SEÑAL', 'DISCIPLINA']
        // Also accept english column names
        const hasSignalTag = 'TAG_DE_SEÑAL' in first || 'SIGNAL_TAG' in first || 'TAG' in first
        const hasType      = 'TIPO_DE_SEÑAL' in first || 'SIGNAL_TYPE' in first || 'TIPO' in first

        if (!hasSignalTag || !hasType) {
          setValidationErrors([`Columnas requeridas no encontradas. Se esperan: TAG_DE_SEÑAL, TIPO_DE_SEÑAL, DISCIPLINA (o sus equivalentes en inglés)`])
          return
        }

        const errors: string[] = []
        const parsed: SignalRow[] = []

        normalized.forEach((row, i) => {
          const rowNum = i + 2

          // Flexible column name resolution
          const signalTag    = row['TAG_DE_SEÑAL'] || row['SIGNAL_TAG'] || row['TAG'] || ''
          const instrTag     = row['TAG_INSTRUMENTO'] || row['INSTRUMENT_TAG'] || signalTag
          const description  = row['DESCRIPCION'] || row['DESCRIPTION'] || row['DESC'] || ''
          const signalType   = (row['TIPO_DE_SEÑAL'] || row['SIGNAL_TYPE'] || row['TIPO'] || '').toUpperCase()
          const discipline   = (row['DISCIPLINA'] || row['DISCIPLINE'] || 'INST').toUpperCase()
          const service      = row['SERVICIO'] || row['SERVICE'] || ''
          const rangeInf     = row['INF.'] || row['RANGE_MIN'] || row['RANGO_INF'] || ''
          const rangeSup     = row['SUP.'] || row['RANGE_MAX'] || row['RANGO_SUP'] || ''
          const unit         = row['UNIDAD'] || row['UNIT'] || row['ENG_UNIT'] || ''
          const alarms       = row['ALARMAS_/_SET_POINT'] || row['ALARMAS'] || row['SETPOINT'] || row['SET_POINT'] || ''
          const origin       = row['ORIGEN_DE_LA_SEÑAL'] || row['ORIGEN'] || row['ORIGIN'] || ''
          const destination  = row['DESTINO_DE_LA_SEÑAL'] || row['DESTINO'] || row['DESTINATION'] || ''
          const pid          = row['P&ID'] || row['PID'] || ''
          const loopDiag     = row['DIAGRAMA_DE_LAZO'] || row['LOOP_DIAGRAM'] || ''
          const wiringDiag   = row['DIAGRAMA_DE_CABLEADO'] || row['WIRING_DIAGRAM'] || ''
          const notes        = row['NOTAS'] || row['NOTES'] || ''
          const areaCode     = row['AREA_CODE'] || row['AREA'] || 'GENERAL'
          const areaName     = row['AREA_NAME'] || areaCode
          const sysCode      = row['SYSTEM_CODE'] || row['SISTEMA'] || 'GEN-SYS'
          const sysName      = row['SYSTEM_NAME'] || sysCode
          const subCode      = row['SUBSYSTEM_CODE'] || row['SUBSISTEMA'] || 'GEN-SUB'
          const subName      = row['SUBSYSTEM_NAME'] || subCode

          if (!signalTag) { errors.push(`Fila ${rowNum}: TAG_DE_SEÑAL vacío`); return }
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
        <a href={`/projects/${projectId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', textDecoration: 'none', marginBottom: '16px' }}>
          ← {projectName}
        </a>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', margin: 0 }}>
              Importar Lista de Señales
            </h1>
            <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
              Carga tu Signal List (I&C) desde Excel. Incluye rango, alarmas, P&IDs y diagramas.
            </p>
          </div>
          <button onClick={downloadTemplate} style={{
            padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0',
            borderRadius: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer',
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
              {i > 0 && <div style={{ width: '32px', height: '1px', background: done ? '#3b82f6' : '#e2e8f0' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%', fontSize: '11px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done || active ? '#3b82f6' : '#f1f5f9',
                  color: done || active ? 'white' : '#94a3b8',
                }}>{done ? '✓' : i + 1}</div>
                <span style={{ fontSize: '13px', color: active ? '#0f172a' : '#94a3b8', fontWeight: active ? 500 : 400 }}>{labels[i]}</span>
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
              border: `2px dashed ${dragging ? '#3b82f6' : '#cbd5e1'}`,
              borderRadius: '16px', padding: '64px 32px', textAlign: 'center',
              background: dragging ? '#eff6ff' : 'white', transition: 'all 0.15s', cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📋</div>
            <p style={{ fontWeight: 600, color: '#0f172a', fontSize: '16px', marginBottom: '6px' }}>
              Arrastra tu Signal List aquí
            </p>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '8px' }}>o haz click para seleccionar</p>
            <p style={{ color: '#94a3b8', fontSize: '12px' }}>.xlsx · .xls</p>
            <input id="sig-file-input" type="file" accept=".xlsx,.xls" onChange={handleFileInput} style={{ display: 'none' }} />
          </div>

          {/* Column reference */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', margin: '0 0 12px' }}>
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
                  background: item.req ? '#3b82f615' : '#f8fafc',
                  color: item.req ? '#3b82f6' : '#94a3b8',
                  border: `1px solid ${item.req ? '#3b82f630' : '#e2e8f0'}`,
                  flexShrink: 0, marginTop: '2px', whiteSpace: 'nowrap',
                }}>{item.req ? 'REQ' : 'OPC'}</span>
                <div>
                  <div style={{ fontSize: '11px', color: '#0f172a', fontWeight: 500, fontFamily: 'monospace' }}>{item.col}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>{item.desc}</div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: '10px', padding: '8px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <p style={{ fontSize: '11px', color: '#166534', margin: 0 }}>
                Disciplinas: {disciplines.map(d => d.code).join(', ')}
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
              <span style={{ color: '#64748b', fontSize: '14px', marginLeft: '12px' }}>{rows.length} señales detectadas</span>
            </div>
            <button onClick={() => { setStep('upload'); setRows([]); setValidationErrors([]) }}
              style={{ fontSize: '13px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
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

          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '20px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['#', 'Tag Señal', 'Tag Instr.', 'Tipo', 'Descripción', 'Servicio', 'Rango', 'Unidad', 'Alarmas', 'Origen → Destino', 'P&ID'].map(h => (
                      <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 25).map((row, i) => {
                    const badType = !SIGNAL_TYPES.includes(row.signal_type.toUpperCase())
                    const badDisc = !disciplineCodes.has(row.discipline_code.toUpperCase())
                    const hasErr  = badType || badDisc
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: hasErr ? '#fef2f2' : 'white' }}>
                        <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{i + 2}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.signal_tag}</td>
                        <td style={{ padding: '8px 10px', color: '#64748b', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.instrument_tag !== row.signal_tag ? row.instrument_tag : '='}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            padding: '2px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 700,
                            background: badType ? '#fee2e2' : `${signalTypeColors[row.signal_type] ?? '#94a3b8'}18`,
                            color: badType ? '#dc2626' : signalTypeColors[row.signal_type] ?? '#94a3b8',
                          }}>{row.signal_type}</span>
                        </td>
                        <td style={{ padding: '8px 10px', color: '#475569', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description}</td>
                        <td style={{ padding: '8px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>{row.service || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {row.range_min !== null && row.range_max !== null ? `${row.range_min} – ${row.range_max}` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#64748b' }}>{row.eng_unit || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#64748b', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.alarm_setpoints || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {row.origin && row.destination ? `${row.origin} → ${row.destination}` : row.origin || row.destination || '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>{row.pid_drawing || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 25 && (
              <div style={{ padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
                Mostrando 25 de {rows.length} señales
              </div>
            )}
          </div>

          {importError && (
            <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>{importError}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={() => { setStep('upload'); setRows([]); setValidationErrors([]) }}
              style={{ padding: '10px 20px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#475569', cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={handleImport} disabled={loading || rows.length === 0}
              style={{
                padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, border: 'none',
                cursor: loading || rows.length === 0 ? 'not-allowed' : 'pointer',
                background: loading || rows.length === 0 ? '#e2e8f0' : '#10b981',
                color: loading || rows.length === 0 ? '#94a3b8' : 'white',
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
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
            {result.errors.length === 0 ? 'Importación completada' : 'Importación con advertencias'}
          </h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '24px 0' }}>
            <div style={{ padding: '16px 28px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>{result.imported}</div>
              <div style={{ fontSize: '13px', color: '#166534' }}>Señales importadas</div>
            </div>
            {result.skipped > 0 && (
              <div style={{ padding: '16px 28px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#ef4444' }}>{result.skipped}</div>
                <div style={{ fontSize: '13px', color: '#dc2626' }}>Omitidas</div>
              </div>
            )}
          </div>
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
            <a href={`/projects/${projectId}`} style={{ padding: '10px 24px', background: '#3b82f6', color: 'white', borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>
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
