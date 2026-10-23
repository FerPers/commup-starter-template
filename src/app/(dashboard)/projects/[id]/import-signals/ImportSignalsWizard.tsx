'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import * as XLSX from 'xlsx'
import { importSignals, type SignalRow, type SignalImportResult } from '@/app/actions/import-signals'
import { pickBestSheet, detectHeaderRow, cellText } from '@/lib/excel/detect-header'
import { SIGNAL_COLS } from '@/lib/excel/signal-columns'
import { dedupeLast, mergeCounts, runBatches } from '@/lib/import/batches'
import { alpha } from '@/lib/theme'
import { pressable } from '@/lib/a11y/pressable'

const SIGNAL_TYPES = ['AI', 'AO', 'DI', 'DO', 'PI', 'PO']

type Step = 'upload' | 'preview' | 'result'

/** Columnas de la cadena del loop check (y el lazo) que se conservan si el archivo no las trae (SignalImport.kept.<col>). */
const PRESERVED = ['loop_number', 'junction_box', 'marshalling', 'io_card', 'io_channel', 'dcs_tag', 'hmi_display', 'alarms'] as const
const COLUMN_GUIDE = [
  ['TAG DE SEÑAL', true, 'signalTag'], ['TAG INSTRUMENTO', false, 'instrumentTag'], ['DESCRIPCION', false, 'description'],
  ['TIPO DE SEÑAL', true, 'signalType'], ['DISCIPLINA', true, 'discipline'], ['SERVICIO', false, 'service'],
  ['INF. / SUP. / UNIDAD', false, 'range'], ['ALARMAS / Set Point', false, 'alarms'], ['ORIGEN / DESTINO', false, 'originDest'],
  ['P&ID / DIAGRAMAS', false, 'drawings'], ['LAZO', false, 'loop'], ['JB / MARSHALLING', false, 'jb'],
  ['TARJETA I/O / CANAL', false, 'io'], ['TAG DCS / HMI', false, 'dcs'], ['NOTAS', false, 'notes'],
] as const

export default function ImportSignalsWizard({
  projectId,
  disciplines,
}: {
  projectId: string
  disciplines: { code: string; name: string; color: string }[]
}) {
  const ts = useTranslations('SignalImport')
  const ti = useTranslations('TagImport')
  const [step, setStep]                   = useState<Step>('upload')
  const [dragging, setDragging]           = useState(false)
  const [fileName, setFileName]           = useState<string | null>(null)
  const [rows, setRows]                   = useState<SignalRow[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [loading, setLoading]             = useState(false)
  const [result, setResult]               = useState<SignalImportResult | null>(null)
  const [importError, setImportError]     = useState<string | null>(null)
  // S07 (D9): columnas que trae el archivo — lo que no viene no se toca al reimportar.
  const [columns, setColumns]             = useState<string[]>([])
  const [progress, setProgress]           = useState<{ done: number; total: number } | null>(null)

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
          setValidationErrors([ti('warn.empty')])
          return
        }

        const { headerRowIdx, colIndex } = detectHeaderRow(rawRows, SIGNAL_COLS)

        if (colIndex.signal_tag === undefined || colIndex.signal_type === undefined) {
          setValidationErrors([ts('warn.missingColumns')])
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
          const loopNumber   = get('loop_number')
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
            errors.push(ts('warn.badType', { row: rowNum, value: signalType, valid: SIGNAL_TYPES.join(', '), tag: signalTag }))
          }
          if (!disciplineCodes.has(discipline)) {
            errors.push(ts('warn.badDiscipline', { row: rowNum, value: discipline, tag: signalTag }))
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
            loop_number:     loopNumber,
            junction_box:    get('junction_box'),
            marshalling:     get('marshalling'),
            io_card:         get('io_card'),
            io_channel:      get('io_channel'),
            dcs_tag:         get('dcs_tag'),
            hmi_display:     get('hmi_display'),
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
        setColumns(Object.keys(colIndex).filter(k => colIndex[k] !== undefined))
        setRows(parsed)
        setFileName(file.name)
        setStep('preview')
      } catch {
        setValidationErrors([ti('warn.readError')])
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
    // S07 (F-23): lotes de 1000 filas con progreso en vez del índice entero en una sola action.
    const unique = dedupeLast(rows, r => `${(r.instrument_tag || r.signal_tag).trim().toUpperCase()}|${r.signal_tag.trim().toUpperCase()}`)
    setProgress({ done: 0, total: unique.length })
    const res = await runBatches<SignalImportResult>(unique,
      batch => importSignals(projectId, batch as SignalRow[], columns), mergeCounts, (done, total) => setProgress({ done, total }))
    setProgress(null)
    if (res.error && !res.result) {
      setImportError(res.error)
    } else {
      if (res.error) setImportError(ti('stoppedMidway', { error: res.error }))
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
        'P&ID': 'P&ID-001', 'DIAGRAMA DE LAZO': 'LD-201', 'DIAGRAMA DE CABLEADO': 'WD-201',
        'LAZO': 'L-201', 'JB': 'JB-02', 'MARSHALLING': 'MC-01', 'TARJETA I/O': 'R1-S4', 'CANAL': 'CH-01', 'TAG DCS': 'FI-201', 'HMI': 'BOMBAS-01', 'NOTAS': '',
        'AREA_CODE': 'AREA-01', 'AREA_NAME': 'Area de Proceso', 'SYSTEM_CODE': 'SYS-01', 'SYSTEM_NAME': 'Sistema de Agua', 'SUBSYSTEM_CODE': 'SS-01', 'SUBSYSTEM_NAME': 'Feed System',
      },
      {
        'TAG DE SEÑAL': 'PT-101', 'TAG INSTRUMENTO': 'PT-101', 'DESCRIPCION': 'Pressure Transmitter - Suction', 'TIPO DE SEÑAL': 'AI',
        'DISCIPLINA': 'INST', 'SERVICIO': 'Succión Bomba',
        'INF.': 0, 'SUP.': 10, 'UNIDAD': 'bar',
        'ALARMAS / Set Point': 'LAL=0.5 / HAH=9',
        'ORIGEN DE LA SEÑAL': 'PT-101 / 4-20mA', 'DESTINO DE LA SEÑAL': 'DCS-AI-002',
        'P&ID': 'P&ID-001', 'DIAGRAMA DE LAZO': 'LD-101', 'DIAGRAMA DE CABLEADO': 'WD-101',
        'LAZO': 'L-101', 'JB': 'JB-01', 'MARSHALLING': 'MC-01', 'TARJETA I/O': 'R1-S3', 'CANAL': 'CH-04', 'TAG DCS': 'PI-101', 'HMI': 'BOMBAS-01', 'NOTAS': '',
        'AREA_CODE': 'AREA-01', 'AREA_NAME': 'Area de Proceso', 'SYSTEM_CODE': 'SYS-01', 'SYSTEM_NAME': 'Sistema de Agua', 'SUBSYSTEM_CODE': 'SS-01', 'SUBSYSTEM_NAME': 'Feed System',
      },
      {
        'TAG DE SEÑAL': 'XV-301-ZO', 'TAG INSTRUMENTO': 'XV-301', 'DESCRIPCION': 'Valve Open - Feed Control Valve', 'TIPO DE SEÑAL': 'DI',
        'DISCIPLINA': 'INST', 'SERVICIO': 'Válvula Control Feed',
        'INF.': '', 'SUP.': '', 'UNIDAD': '',
        'ALARMAS / Set Point': '',
        'ORIGEN DE LA SEÑAL': 'XV-301 / ZO Contact', 'DESTINO DE LA SEÑAL': 'DCS-DI-005',
        'P&ID': 'P&ID-002', 'DIAGRAMA DE LAZO': 'LD-301', 'DIAGRAMA DE CABLEADO': 'WD-301',
        'LAZO': 'L-301', 'JB': 'JB-03', 'MARSHALLING': 'MC-01', 'TARJETA I/O': 'R1-S5', 'CANAL': 'CH-11', 'TAG DCS': 'ZSO-301', 'HMI': 'FEED-01', 'NOTAS': 'Causa C-01 de la matriz C&E',
        'AREA_CODE': 'AREA-01', 'AREA_NAME': 'Area de Proceso', 'SYSTEM_CODE': 'SYS-01', 'SYSTEM_NAME': 'Sistema de Agua', 'SUBSYSTEM_CODE': 'SS-01', 'SUBSYSTEM_NAME': 'Feed System',
      },
    ]
    const ws = XLSX.utils.json_to_sheet(template)
    // Set column widths
    ws['!cols'] = [16, 16, 30, 14, 12, 20, 8, 8, 10, 20, 20, 20, 10, 14, 18, 10, 8, 10, 12, 8, 12, 12, 18, 10, 10, 12, 16, 14, 18].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Señales')
    XLSX.writeFile(wb, 'CommUp_Signals_Template.xlsx')
  }

  return (
    <div>

      {/* Header (N2c: el h1 es el del hub «Señales y lazos») */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
              {ts('title')}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
              {ts('subtitle')}
            </p>
          </div>
          <button onClick={downloadTemplate} style={{
            padding: '8px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer',
          }}>
            ↓ {ti('downloadTemplate')}
          </button>
        </div>
      </div>

      {/* Signal types legend */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {SIGNAL_TYPES.map(t => (
          <span key={t} style={{
            padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
            background: alpha(signalTypeColors[t], 9), color: signalTypeColors[t],
            border: `1px solid ${alpha(signalTypeColors[t], 19)}`,
          }}>
            {t} — {t === 'AI' ? 'Analog In' : t === 'AO' ? 'Analog Out' : t === 'DI' ? 'Digital In' : t === 'DO' ? 'Digital Out' : t === 'PI' ? 'Pulse In' : 'Pulse Out'}
          </span>
        ))}
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px' }}>
        {(['upload', 'preview', 'result'] as Step[]).map((s, i) => {
          const labels = [ti('step.upload'), ti('step.preview'), ti('step.result')]
          const done = step === 'preview' ? i < 1 : step === 'result' ? i < 2 : false
          const active = step === s
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {i > 0 && <div style={{ width: '32px', height: '1px', background: done ? 'var(--primary-500)' : 'var(--border)' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%', fontSize: '11px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done || active ? 'var(--primary-600)' : 'var(--gray-100)',
                  color: done || active ? '#fff' : 'var(--text-muted)',
                }}>{done ? '✓' : i + 1}</div>
                <span style={{ fontSize: '13px', color: active ? 'var(--text-strong)' : 'var(--text-muted)', fontWeight: active ? 500 : 400 }}>{labels[i]}</span>
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
            // G-12: la zona también se activa con Tab + Enter/Espacio (el input real está oculto).
            {...pressable(() => document.getElementById('sig-file-input')?.click())}
            style={{
              border: `2px dashed ${dragging ? 'var(--primary-500)' : 'var(--gray-300)'}`,
              borderRadius: '16px', padding: '64px 32px', textAlign: 'center',
              background: dragging ? 'var(--primary-50)' : 'var(--card-bg)', transition: 'all 0.15s', cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📋</div>
            <p style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: '16px', marginBottom: '6px' }}>
              {ts('drop')}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '8px' }}>{ts('orClick')}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>.xlsx · .xls</p>
            <input id="sig-file-input" type="file" accept=".xlsx,.xls" onChange={handleFileInput} style={{ display: 'none' }} />
          </div>

          {/* Column reference */}
          <div style={{ background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', padding: '20px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 12px' }}>
              {ts('columnsTitle')}
            </h3>
            {COLUMN_GUIDE.map(([col, req, note]) => ({ col, req, desc: ts(`colNote.${note}`) })).map(item => (
              <div key={item.col} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-start' }}>
                <span style={{
                  padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 700,
                  background: item.req ? '#3b82f615' : 'var(--gray-50)',
                  color: item.req ? 'var(--primary-700)' : 'var(--text-muted)',
                  border: `1px solid ${item.req ? '#3b82f630' : 'var(--border)'}`,
                  flexShrink: 0, marginTop: '2px', whiteSpace: 'nowrap',
                }}>{item.req ? 'REQ' : 'OPT'}</span>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-strong)', fontWeight: 500, fontFamily: 'monospace' }}>{item.col}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.desc}</div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: '10px', padding: '8px', background: 'var(--success-50)', borderRadius: '8px', border: '1px solid var(--success-200)' }}>
              <p style={{ fontSize: '11px', color: 'var(--success-800)', margin: 0 }}>
                {ts('disciplines', { list: disciplines.map(d => d.code).join(', ') })}
              </p>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '10px 0 0' }}>
              {ts('headerHint')}
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
              <span style={{ color: 'var(--text-muted)', fontSize: '14px', marginLeft: '12px' }}>{ts('detected', { n: rows.length })}</span>
            </div>
            <button onClick={() => { setStep('upload'); setRows([]); setValidationErrors([]) }}
              style={{ fontSize: '13px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              ← {ti('changeFile')}
            </button>
          </div>

          {/* S07 (F-06, D9): lo que este archivo no trae se conserva en las señales que ya existen */}
          {(() => {
            const kept = PRESERVED.filter(k => !columns.includes(k)).map(k => ts(`kept.${k}`))
            return kept.length > 0 && (
              <div style={{ background: 'var(--primary-50)', border: '1px solid var(--primary-200)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: 'var(--primary-800)' }}>
                {ts.rich('keptNotice', { list: kept.join(', '), strong: c => <strong>{c}</strong> })}
              </div>
            )
          })()}

          {validationErrors.length > 0 && (
            <div style={{ background: 'var(--danger-50)', border: '1px solid var(--danger-200)', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
              <p style={{ fontWeight: 600, color: 'var(--danger-700)', fontSize: '13px', marginBottom: '6px' }}>⚠ {ts('warningsN', { n: validationErrors.length })}</p>
              <ul style={{ margin: 0, paddingLeft: '16px' }}>
                {validationErrors.slice(0, 8).map((e, i) => (
                  <li key={i} style={{ fontSize: '12px', color: 'var(--danger-700)', marginBottom: '2px' }}>{e}</li>
                ))}
                {validationErrors.length > 8 && <li style={{ fontSize: '12px', color: 'var(--danger-700)' }}>{ti('andMore', { n: validationErrors.length - 8 })}</li>}
              </ul>
            </div>
          )}

          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '20px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                    {['#', ts('col.signalTag'), ts('col.instrumentTag'), ts('col.type'), ts('col.description'), ts('col.service'), ts('col.range'), ts('col.unit'), ts('col.alarms'), ts('col.originDest'), 'P&ID', ts('col.loop'), ts('col.chain')].map(h => (
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
                      <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)', background: hasErr ? 'var(--danger-50)' : 'var(--card-bg)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{i + 2}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.signal_tag}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.instrument_tag !== row.signal_tag ? row.instrument_tag : '='}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{
                            padding: '2px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 700,
                            background: badType ? 'var(--danger-100)' : alpha(signalTypeColors[row.signal_type] ?? 'var(--gray-400)', 9),
                            color: badType ? 'var(--danger-700)' : signalTypeColors[row.signal_type] ?? 'var(--text-muted)',
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
                        <td style={{ padding: '8px 10px', color: 'var(--text-strong)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{(row.loop_number ?? '') || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{[row.junction_box, row.marshalling, [row.io_card, row.io_channel].filter(Boolean).join('/'), row.dcs_tag, row.hmi_display].filter(Boolean).join(' → ') || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 25 && (
              <div style={{ padding: '10px 16px', background: 'var(--gray-50)', borderTop: '1px solid var(--gray-100)', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                {ts('showing', { total: rows.length })}
              </div>
            )}
          </div>

          {importError && (
            <div style={{ padding: '12px', background: 'var(--danger-50)', border: '1px solid var(--danger-200)', borderRadius: '8px', color: 'var(--danger-700)', fontSize: '13px', marginBottom: '16px' }}>{importError}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={() => { setStep('upload'); setRows([]); setValidationErrors([]) }}
              style={{ padding: '10px 20px', background: 'var(--gray-100)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', color: 'var(--text-muted)', cursor: 'pointer' }}>
              {ti('cancel')}
            </button>
            <button onClick={handleImport} disabled={loading || rows.length === 0}
              style={{
                padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, border: 'none',
                cursor: loading || rows.length === 0 ? 'not-allowed' : 'pointer',
                background: loading || rows.length === 0 ? 'var(--border)' : 'var(--success-500)',
                color: loading || rows.length === 0 ? 'var(--text-muted)' : 'var(--card-bg)',
              }}>
              {loading ? (progress ? ti('importingProgress', { done: progress.done, total: progress.total }) : ti('importing')) : `✓ ${ts('importN', { n: rows.length })}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ── */}
      {step === 'result' && result && (
        <div style={{ maxWidth: '560px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>{result.errors.length === 0 ? '✅' : '⚠️'}</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '6px' }}>
            {result.errors.length === 0 ? ti('done') : ts('doneWithWarnings')}
          </h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '24px 0', flexWrap: 'wrap' }}>
            <div style={{ padding: '16px 28px', background: 'var(--success-50)', borderRadius: '12px', border: '1px solid var(--success-200)' }}>
              <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--success-700)' }}>{result.imported}</div>
              <div style={{ fontSize: '13px', color: 'var(--success-800)' }}>{ts('new')}</div>
            </div>
            {result.updated > 0 && (
              <div style={{ padding: '16px 28px', background: 'var(--primary-50)', borderRadius: '12px', border: '1px solid var(--primary-200)' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--primary-700)' }}>{result.updated}</div>
                <div style={{ fontSize: '13px', color: 'var(--primary-800)' }}>{ts('updated')}</div>
              </div>
            )}
            {result.tagsCreated > 0 && (
              <div style={{ padding: '16px 28px', background: 'var(--violet-50)', borderRadius: '12px', border: '1px solid var(--violet-200)' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--violet-700)' }}>{result.tagsCreated}</div>
                <div style={{ fontSize: '13px', color: 'var(--violet-800)' }}>{ts('tagsCreated')}</div>
              </div>
            )}
            {result.loopsCreated > 0 && (
              <div style={{ padding: '16px 28px', background: 'var(--cyan-50)', borderRadius: '12px', border: '1px solid var(--cyan-200)' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--cyan-700)' }}>{result.loopsCreated}</div>
                <div style={{ fontSize: '13px', color: 'var(--cyan-800)' }}>{ts('loopsCreated')}</div>
              </div>
            )}
            {result.skipped > 0 && (
              <div style={{ padding: '16px 28px', background: 'var(--danger-50)', borderRadius: '12px', border: '1px solid var(--danger-200)' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--danger-700)' }}>{result.skipped}</div>
                <div style={{ fontSize: '13px', color: 'var(--danger-700)' }}>{ts('skipped')}</div>
              </div>
            )}
          </div>
          {result.warnings.length > 0 && (
            <div style={{ background: 'var(--warning-50)', border: '1px solid var(--warning-200)', borderRadius: '10px', padding: '14px', marginBottom: '12px', textAlign: 'left' }}>
              {result.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: '12px', color: 'var(--warning-800)', marginBottom: '4px' }}>⚠ {w}</div>
              ))}
            </div>
          )}
          {result.errors.length > 0 && (
            <div style={{ background: 'var(--danger-50)', border: '1px solid var(--danger-200)', borderRadius: '10px', padding: '14px', marginBottom: '20px', textAlign: 'left' }}>
              {result.errors.slice(0, 20).map((e, i) => (
                <div key={i} style={{ fontSize: '12px', color: 'var(--danger-700)', marginBottom: '4px' }}>
                  {ts('rowLabel', { row: e.row })} · <strong>{e.tag}</strong>: {e.reason}
                </div>
              ))}
              {result.errors.length > 20 && <div style={{ fontSize: '12px', color: 'var(--danger-700)' }}>{ti('andMore', { n: result.errors.length - 20 })}</div>}
              <button onClick={() => {
                const ws = XLSX.utils.json_to_sheet(result.errors.map(e => ({ [ti('xlsx.row')]: e.row, [ts('col.signalTag')]: e.tag, [ti('xlsx.reason')]: e.reason })))
                const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, ti('xlsx.sheet'))
                XLSX.writeFile(wb, `${ti('xlsx.file')}-${(fileName ?? 'signals').replace(/\.[^.]+$/, '')}.xlsx`)
              }} style={{ marginTop: '8px', padding: '6px 12px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--danger-200)', background: 'var(--card-bg)', color: 'var(--danger-700)', cursor: 'pointer' }}>⬇ {ti('downloadErrors')}</button>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <Link href={`/projects/${projectId}`} style={{ padding: '10px 24px', background: 'var(--primary-600)', color: '#fff', borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>
              {ts('viewProject')}
            </Link>
            <button onClick={() => { setStep('upload'); setRows([]); setValidationErrors([]); setResult(null) }}
              style={{ padding: '10px 20px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', color: 'var(--text-muted)', cursor: 'pointer' }}>
              {ti('importMore')}
            </button>
          </div>
        </div>
      )}
    </div>
  )

}
