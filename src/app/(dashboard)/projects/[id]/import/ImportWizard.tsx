'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import * as XLSX from 'xlsx'
import { importTags, findExistingTags, previewTagImport, type TagRow, type ImportResult, type TagImportPreview } from '@/app/actions/import'
import { dedupeLast, mergeCounts, runBatches, IMPORT_BATCH } from '@/lib/import/batches'
import { detectTagType } from '@/lib/tag-types'
import { detectEquipmentTypeCode } from '@/lib/equipment-types'
import { pickBestSheet, detectHeaderRow } from '@/lib/excel/detect-header'
import { TAG_COLUMNS, parseTagRows, usesSectionTitles } from '@/lib/import/tag-parse'
import { alpha, ink } from '@/lib/theme'
import { pressable } from '@/lib/a11y/pressable'

function downloadTemplate(disciplineCode: string) {
  const wb = XLSX.utils.book_new()
  const baseHeaders = ['TAG', 'DESCRIPTION', 'EQUIPMENT TYPE', 'AREA_CODE', 'AREA_NAME', 'SYSTEM_CODE', 'SYSTEM_NAME', 'SUBSYSTEM_CODE', 'SUBSYSTEM_NAME', 'P&ID', 'MANUFACTURER', 'MODEL', 'SERIAL', 'PRESERVATION', 'DATASHEET', 'DATASHEET REV', 'RANGE MIN', 'RANGE MAX', 'UNIT']
  const isInst = disciplineCode === 'INST'
  const isMec  = !isInst && disciplineCode !== 'ELEC'
  const headers = [
    ...baseHeaders,
    ...(isMec  ? ['FLUID TYPE']       : []),
    ...(isInst ? ['MOUNTING TYPICAL', 'JUNCTION BOX', 'SIL'] : []),
    'CRITICALITY',
  ]
  const sample =
    isInst
      ? [['FT-101', 'Flow transmitter feed water', 'FT', 'AREA-01', 'Process Area', 'SYS-01', 'Water System', 'SS-01', 'Feedwater', 'P&ID-1001', 'Rosemount', '3051S', 'SN12345', 'NO', 'DS-FT-101', 'B', '0', '100', 'psi', 'TYP-INST-001', 'JB-101', 'SIL2', 'Safety']]
      : disciplineCode === 'ELEC'
        ? [['SWG-CPF-1', 'Medium Voltage Switchgear', 'SWG', 'AREA-02', 'Power Room', 'SYS-02', 'MV System', 'SS-02', 'Distribution', '', 'ABB', 'UniGear', '', 'NO', 'DS-SWG-CPF-1', '', '', '', '', 'Process']]
        : [['P-101A', 'Booster Pump', 'P', 'AREA-01', 'Process Area', 'SYS-03', 'Pump System', 'SS-03', 'Booster', '', 'Grundfos', 'CM5-A', '', 'NO', 'DS-P-101A', '', '', '', '', 'Gas Natural', 'Normal']]
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
  const ti = useTranslations('TagImport')
  const [step, setStep]               = useState<Step>('upload')
  const [sectionNote, setSectionNote] = useState<{ systems: number; subsystems: number } | null>(null)
  const [dragging, setDragging]       = useState(false)
  const [fileName, setFileName]       = useState<string | null>(null)
  const [rows, setRows]               = useState<TagRow[]>([])
  const [parseWarnings, setParseWarnings] = useState<string[]>([])
  const [loading, setLoading]         = useState(false)
  const [result, setResult]           = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [manualDiscipline, setManualDiscipline] = useState<string>('')
  // S07 (D9): columnas que trae el archivo — lo que no viene no se toca al reimportar.
  const [columns, setColumns] = useState<string[]>([])
  const [preview, setPreview] = useState<TagImportPreview | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  // Tags del archivo que ya existen en el proyecto (null = consultando)
  const [existingTags, setExistingTags] = useState<Set<string> | null>(null)

  const disciplineCodes  = useMemo(() => new Set(disciplines.map(d => d.code.toUpperCase())), [disciplines])
  const prefillCode      = disciplinePrefill?.code.toUpperCase() ?? ''
  const effectivePrefill = prefillCode || manualDiscipline

  // Al entrar a la vista previa consultamos qué tags ya existen. El reset a
  // null ocurre donde cambian las filas (parseFile / "Cambiar archivo").
  useEffect(() => {
    if (step !== 'preview' || rows.length === 0) return
    let cancelled = false
    void findExistingTags(projectId, rows.map(r => r.tag_number))
      .then(res => { if (!cancelled) setExistingTags(new Set(res.existing ?? [])) })
      .catch(() => { if (!cancelled) setExistingTags(new Set()) })
    // S07: diff por campo antes de aplicar (por lotes, sin escribir nada).
    void (async () => {
      const acc: TagImportPreview = { newTags: 0, updatedTags: 0, unchangedTags: 0, fieldChanges: {}, moves: [] }
      const unique = dedupeLast(rows, r => r.tag_number.trim().toUpperCase())
      for (let i = 0; i < unique.length; i += IMPORT_BATCH) {
        const res = await previewTagImport(projectId, unique.slice(i, i + IMPORT_BATCH), columns)
        if (cancelled || !res.preview) return
        acc.newTags += res.preview.newTags; acc.updatedTags += res.preview.updatedTags; acc.unchangedTags += res.preview.unchangedTags
        for (const [k, v] of Object.entries(res.preview.fieldChanges)) acc.fieldChanges[k] = (acc.fieldChanges[k] ?? 0) + v
        acc.moves.push(...res.preview.moves)
      }
      if (!cancelled) setPreview(acc)
    })()
    return () => { cancelled = true }
  }, [step, rows, projectId, columns])

  // ── File parsing ──────────────────────────────────────────────

  const parseFile = useCallback((file: File, disciplineCode: string) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })

        // Hoja con más encabezados reconocibles (evita carátulas e índices)
        const { rows: rawRows } = pickBestSheet(wb, TAG_COLUMNS)

        if (rawRows.length === 0) {
          setParseWarnings([ti('warn.empty')]); return
        }

        const { headerRowIdx, colIndex } = detectHeaderRow(rawRows, TAG_COLUMNS)
        const warnings: string[] = []

        if (colIndex['tag'] === undefined) {
          warnings.push(ti('warn.noTagColumn'))
        }

        const parsed = parseTagRows(rawRows, colIndex, headerRowIdx + 1, disciplineCode)

        if (parsed.length === 0) {
          setParseWarnings([...warnings, ti('warn.noRows')]); return
        }

        if (!disciplineCode) {
          const unknown = [...new Set(parsed.map(r => r.discipline_code).filter(c => !disciplineCodes.has(c)))]
          if (unknown.length > 0) warnings.push(ti('warn.unknownDisciplines', { list: unknown.join(', ') }))
        }

        setParseWarnings(warnings)
        setFileName(file.name)
        setExistingTags(null)
        setPreview(null)
        // Sistema › subsistema desde los títulos de sección: cuentan como columnas presentes (un reimport mueve
        // los tags sin ITR ni punch, como con columnas explícitas).
        const fromSections = usesSectionTitles(colIndex) && parsed.some(r => r.subsystem_code !== 'GEN-SUB')
        setSectionNote(fromSections
          ? { systems: new Set(parsed.map(r => r.system_code)).size, subsystems: new Set(parsed.map(r => r.subsystem_code)).size }
          : null)
        setColumns([...Object.keys(colIndex).filter(k => colIndex[k] !== undefined), ...(fromSections ? ['system_code', 'subsystem_code'] : [])])
        setRows(parsed)
        setStep('preview')
      } catch {
        setParseWarnings([ti('warn.readError')])
      }
    }
    reader.readAsArrayBuffer(file)
  }, [disciplineCodes, ti])

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
    // S07 (C-24): lotes de 1000 filas con progreso; el servidor no recibe el archivo entero.
    const unique = dedupeLast(rows, r => r.tag_number.trim().toUpperCase())
    setProgress({ done: 0, total: unique.length })
    const { error, result: res } = await runBatches<ImportResult>(unique,
      batch => importTags(projectId, batch as TagRow[], columns), mergeCounts, (done, total) => setProgress({ done, total }))
    setLoading(false); setProgress(null)
    if (error && !res) { setImportError(error); return }
    if (error) setImportError(ti('stoppedMidway', { error }))
    setResult(res!); setStep('result')
  }

  const hasPid      = rows.some(r => r.pid_drawing)
  const validRows   = rows.filter(r => effectivePrefill ? true : disciplineCodes.has(r.discipline_code))
  const invalidRows = rows.filter(r => !effectivePrefill && !disciplineCodes.has(r.discipline_code))

  return (
    <div style={{ padding: '32px' }}>

      <Link href={`/projects/${projectId}/tags`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
        ← {projectName}
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {ti('title')}
            {disciplinePrefill && (
              <span style={{
                padding: '3px 10px', borderRadius: '6px', fontSize: '14px', fontWeight: 700,
                background: alpha(disciplinePrefill.color, 9), color: ink(disciplinePrefill.color),
              }}>
                {disciplinePrefill.code} — {disciplinePrefill.name}
              </span>
            )}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {ti('subtitle')}
          </p>
        </div>
        {step === 'upload' && (
          <button onClick={() => downloadTemplate(prefillCode || 'MECH')} style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            ↓ {ti('downloadTemplate')}
          </button>
        )}
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px' }}>
        {(['upload', 'preview', 'result'] as Step[]).map((s, i) => {
          const labels = [ti('step.upload'), ti('step.preview'), ti('step.result')]
          const done   = (step === 'preview' && i === 0) || step === 'result'
          const active = step === s
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <div style={{ width: '40px', height: '1px', background: (done || active) ? 'var(--primary-500)' : 'var(--border)' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 600,
                  background: done ? 'var(--primary-600)' : active ? 'var(--primary-50)' : 'var(--gray-100)',
                  color:      done ? 'var(--card-bg)'   : active ? 'var(--primary-700)' : 'var(--text-muted)',
                  border: active ? '2px solid var(--primary-500)' : '2px solid transparent',
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: '13px', color: active ? 'var(--primary-800)' : 'var(--text-muted)', fontWeight: active ? 500 : 400 }}>{labels[i]}</span>
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
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{ti('discipline')}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', flex: 1 }}>
                {disciplines.map(d => (
                  <button
                    key={d.code}
                    onClick={() => setManualDiscipline(manualDiscipline === d.code ? '' : d.code)}
                    style={{
                      padding: '5px 14px', borderRadius: '7px', border: '1px solid',
                      borderColor: manualDiscipline === d.code ? d.color : 'var(--border)',
                      background: manualDiscipline === d.code ? alpha(d.color, 8) : 'var(--card-bg)',
                      color: ink(manualDiscipline === d.code ? d.color : 'var(--text-muted)'),
                      fontSize: '12px', fontWeight: manualDiscipline === d.code ? 700 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {d.code}
                  </button>
                ))}
              </div>
              {!manualDiscipline && (
                <span style={{ fontSize: '12px', color: 'var(--warning-700)', whiteSpace: 'nowrap' }}>{ti('pickDiscipline')}</span>
              )}
            </div>
          )}

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            // G-12: la zona también se activa con Tab + Enter/Espacio (el input real está oculto).
            {...pressable(() => document.getElementById('file-input')?.click())}
            style={{
              border: `2px dashed ${dragging ? 'var(--primary-500)' : 'var(--gray-300)'}`,
              borderRadius: '14px', padding: '56px 32px', textAlign: 'center',
              background: dragging ? 'var(--primary-50)' : 'var(--card-bg)',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.4 }}>⊞</div>
            <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-muted)', margin: '0 0 6px' }}>{ti('drop')}</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px' }}>{ti('orClick')}</p>
            <input id="file-input" type="file" accept=".xlsx,.xls" onChange={onFileChange} style={{ display: 'none' }} />
            <span style={{ padding: '8px 20px', background: 'var(--primary-600)', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 500, pointerEvents: 'none' }}>
              {ti('selectFile')}
            </span>
            {parseWarnings.length > 0 && (
              <div style={{ marginTop: '20px', padding: '12px', background: 'var(--warning-100)', borderRadius: '8px', textAlign: 'left' }}>
                {parseWarnings.map((w, i) => <p key={i} style={{ fontSize: '12px', color: 'var(--warning-800)', margin: '2px 0' }}>⚠ {w}</p>)}
              </div>
            )}
          </div>
          </div>{/* end left column */}

          {/* Column guide */}
          <div style={{ background: 'var(--gray-50)', borderRadius: '12px', border: '1px solid var(--border)', padding: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {ti('columnsTitle')}
            </p>
            {[
              { key: 'TAG / ETIQUETA',           req: true,  note: 'ESDV-7621001, FT-101, P-762A' },
              { key: 'DESCRIPCION / EQUIPO',      req: true,  note: ti('colNote.description') },
              { key: 'TIPO EQUIPO / EQUIPMENT TYPE', req: false, note: ti('colNote.equipmentType') },
              { key: 'P&ID',                      req: false, note: ti('colNote.pid') },
              { key: 'AREA_CODE / SE/Sitio',      req: false, note: ti('colNote.area') },
              { key: 'SYSTEM_CODE / SISTEMA',     req: false, note: ti('colNote.system') },
              { key: 'SUBSYSTEM_CODE',            req: false, note: ti('colNote.subsystem') },
              { key: 'FABRICANTE / MARCA/MODELO', req: false, note: ti('colNote.manufacturer') },
              { key: 'DATASHEET / DATASHEET REV', req: false, note: ti('colNote.datasheet') },
              { key: 'SERIAL / SERIE',            req: false, note: ti('colNote.serial') },
              { key: 'RANGE MIN / RANGE MAX / UNIT', req: false, note: ti('colNote.range') },
              { key: 'JUNCTION BOX / CAJA',       req: false, note: ti('colNote.junctionBox') },
              { key: 'FLUID TYPE / FLUIDO',      req: false, note: ti('colNote.fluid') },
              { key: 'MOUNTING TYPICAL / TIPICO',req: false, note: ti('colNote.mounting') },
            ].map(col => (
              <div key={col.key} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '10px' }}>
                <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, flexShrink: 0, marginTop: '2px', background: col.req ? 'var(--danger-100)' : 'var(--gray-100)', color: col.req ? 'var(--danger-700)' : 'var(--text-muted)' }}>
                  {col.req ? 'REQ' : 'OPT'}
                </span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{col.key}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{col.note}</div>
                </div>
              </div>
            ))}
            {!disciplinePrefill && (
              <>
                <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{ti('availableDisciplines')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {disciplines.map(d => <span key={d.code} style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '12px', fontWeight: 700, background: alpha(d.color, 9), color: ink(d.color) }}>{d.code}</span>)}
                </div>
              </>
            )}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: '14px', paddingTop: '12px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                {ti('headerHint')}
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
              <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>·</span>
              <span style={{ color: 'var(--success-700)', fontWeight: 500 }}>{ti('valid', { n: validRows.length })}</span>
              {invalidRows.length > 0 && <span style={{ color: 'var(--danger-700)', fontWeight: 500, marginLeft: '8px' }}>{ti('skippedN', { n: invalidRows.length })}</span>}
            </div>
            <button onClick={() => { setStep('upload'); setRows([]); setFileName(null); setExistingTags(null) }} style={{ fontSize: '13px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>← {ti('changeFile')}</button>
          </div>

          {parseWarnings.length > 0 && (
            <div style={{ padding: '12px 16px', background: 'var(--warning-100)', borderRadius: '10px', marginBottom: '14px', border: '1px solid var(--warning-200)' }}>
              {parseWarnings.map((w, i) => <p key={i} style={{ fontSize: '13px', color: 'var(--warning-800)', margin: '2px 0' }}>⚠ {w}</p>)}
            </div>
          )}

          {sectionNote && (
            <p style={{ padding: '10px 16px', background: 'var(--primary-50)', border: '1px solid var(--primary-200)', borderRadius: '10px', marginBottom: '14px', fontSize: '13px', color: 'var(--primary-800)' }}>
              {ti('fromSections', sectionNote)}
            </p>
          )}

          {/* S07 (D9): qué cambia, campo por campo, antes de aplicar */}
          {existingTags && existingTags.size > 0 && (
            <div style={{ padding: '12px 16px', background: 'var(--primary-50)', borderRadius: '10px', marginBottom: '14px', border: '1px solid var(--primary-200)' }}>
              <p style={{ fontSize: '13px', color: 'var(--primary-800)', margin: 0 }}>
                {ti.rich('existing', { n: existingTags.size, total: rows.length, strong: c => <strong>{c}</strong> })}
              </p>
              {!preview ? (
                <p style={{ fontSize: '12px', color: 'var(--primary-800)', margin: '6px 0 0' }}>{ti('computing')}</p>
              ) : (
                <>
                  <p style={{ fontSize: '12px', color: 'var(--primary-800)', margin: '6px 0 0' }}>
                    {ti('diffSummary', { added: preview.newTags, changed: preview.updatedTags, same: preview.unchangedTags })}
                  </p>
                  {Object.keys(preview.fieldChanges).length > 0 && (
                    <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '12px', color: 'var(--primary-900)' }}>
                      {Object.entries(preview.fieldChanges).sort((a, b) => b[1] - a[1]).map(([field, n]) => (
                        <li key={field}>{FIELD_KEYS.includes(field) ? ti(`field.${field as 'description'}`) : field}: {ti('changesIn', { n })}</li>
                      ))}
                    </ul>
                  )}
                  {preview.moves.some(m => m.blocked) && (
                    <p style={{ fontSize: '12px', color: 'var(--warning-700)', margin: '6px 0 0' }}>
                      ⚠ {ti.rich('blockedMoves', { n: preview.moves.filter(m => m.blocked).length, strong: c => <strong>{c}</strong> })} ({preview.moves.filter(m => m.blocked).slice(0, 5).map((m, n) => (
                        <span key={m.tag}>{n > 0 && ', '}{m.tagId
                          ? <Link href={`/projects/${projectId}/tags/${m.tagId}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--warning-700)' }}>{m.tag}</Link>
                          : m.tag}</span>
                      ))}{preview.moves.filter(m => m.blocked).length > 5 ? '…' : ''}). {ti('blockedMovesHint')}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'auto', marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  <Th>#</Th><Th>TAG</Th><Th>{ti('col.description')}</Th><Th>{ti('col.type')}</Th><Th>{ti('col.discipline')}</Th>
                  <Th>{ti('col.hierarchy')}</Th>
                  {hasPid && <Th>P&ID</Th>}
                  <Th>{ti('col.manufacturer')}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 30).map((row, i) => {
                  const isInvalid = !effectivePrefill && !disciplineCodes.has(row.discipline_code)
                  const d = disciplines.find(x => x.code.toUpperCase() === row.discipline_code)
                  const manualD = disciplines.find(x => x.code.toUpperCase() === manualDiscipline)
                  const dColor = d?.color ?? (disciplinePrefill?.color ?? manualD?.color ?? 'var(--gray-400)')
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)', background: isInvalid ? 'var(--danger-50)' : undefined }}>
                      <td style={tdStyle}><span style={{ color: 'var(--text-muted)' }}>{i + 1}</span></td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'monospace' }}>{row.tag_number}</span>
                        {existingTags?.has(row.tag_number.trim()) && (
                          <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, background: 'var(--primary-50)', color: 'var(--primary-800)', border: '1px solid var(--primary-200)', verticalAlign: 'middle' }}>{ti('exists')}</span>
                        )}
                      </td>
                      <td style={tdStyle}><span style={{ color: 'var(--text-muted)' }}>{row.description || '—'}</span></td>
                      <td style={tdStyle}>{(() => {
                        // Tipo explícito del Excel (columna TIPO EQUIPO) o detectado por prefijo ISA
                        if (row.equipment_type_code) {
                          return <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, background: 'var(--primary-50)', color: 'var(--primary-800)', border: '1px solid var(--primary-200)', whiteSpace: 'nowrap' }}>{row.equipment_type_code}</span>
                        }
                        const t = detectTagType(row.tag_number)
                        const code = detectEquipmentTypeCode(row.tag_number)
                        return t
                          ? <span title={ti('detectedByPrefix')} style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, background: 'var(--success-50)', color: 'var(--success-700)', border: '1px solid var(--success-200)', whiteSpace: 'nowrap' }}>{t.typeName}{code ? ` (${code})` : ''}</span>
                          : <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                      })()}</td>
                      <td style={tdStyle}>
                        <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '12px', fontWeight: 700, background: alpha(dColor, 9), color: isInvalid ? 'var(--danger-700)' : dColor }}>
                          {row.discipline_code || '?'}
                        </span>
                      </td>
                      <td style={tdStyle}><span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '12px' }}>{[row.area_code, row.system_code, row.subsystem_code].join(' / ')}</span></td>
                      {hasPid && <td style={tdStyle}><span style={{ color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'monospace' }}>{row.pid_drawing ?? '—'}</span></td>}
                      <td style={tdStyle}><span style={{ color: 'var(--text-muted)' }}>{row.manufacturer ?? '—'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length > 30 && <div style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--gray-100)' }}>{ti('showing', { total: rows.length })}</div>}
          </div>

          {importError && (
            <div style={{ padding: '12px 16px', background: 'var(--danger-50)', borderRadius: '10px', border: '1px solid var(--danger-300)', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--danger-700)', margin: 0 }}>{importError}</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Link href={`/projects/${projectId}/tags`} style={{ padding: '10px 20px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>{ti('cancel')}</Link>
            <button onClick={handleImport} disabled={loading || validRows.length === 0} style={{ padding: '10px 24px', background: 'var(--success-500)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: loading ? 'wait' : 'pointer', opacity: validRows.length === 0 ? 0.5 : 1 }}>
              {loading ? (progress ? ti('importingProgress', { done: progress.done, total: progress.total }) : ti('importing')) : `✓ ${ti('importN', { n: validRows.length })}`}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Result ─────────────────────────────────── */}
      {step === 'result' && result && (
        <div style={{ textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '52px', marginBottom: '12px' }}>{result.errors.length === 0 ? '✅' : '⚠️'}</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 24px' }}>{ti('done')}</h2>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '32px', flexWrap: 'wrap' }}>
            <div style={{ padding: '20px 32px', background: 'var(--success-50)', borderRadius: '12px', border: '1px solid var(--success-200)' }}>
              <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--success-700)' }}>{result.imported}</div>
              <div style={{ fontSize: '13px', color: 'var(--success-700)', marginTop: '4px' }}>{ti('new')}</div>
            </div>
            {result.updated > 0 && (
              <div style={{ padding: '20px 32px', background: 'var(--primary-50)', borderRadius: '12px', border: '1px solid var(--primary-200)' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--primary-700)' }}>{result.updated}</div>
                <div style={{ fontSize: '13px', color: 'var(--primary-800)', marginTop: '4px' }}>{ti('updated')}</div>
              </div>
            )}
            {result.skipped > 0 && (
              <div style={{ padding: '20px 32px', background: 'var(--warning-100)', borderRadius: '12px', border: '1px solid var(--warning-200)' }}>
                <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--warning-700)' }}>{result.skipped}</div>
                <div style={{ fontSize: '13px', color: 'var(--warning-700)', marginTop: '4px' }}>{ti('skipped')}</div>
              </div>
            )}
          </div>
          {result.warnings.length > 0 && (
            <div style={{ textAlign: 'left', background: 'var(--warning-100)', borderRadius: '10px', padding: '16px', marginBottom: '24px', border: '1px solid var(--warning-200)' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--warning-800)', margin: '0 0 8px' }}>{ti('warnings')}</p>
              {result.warnings.map((w, i) => <p key={i} style={{ fontSize: '12px', color: 'var(--warning-800)', margin: '2px 0' }}>⚠ {w}</p>)}
            </div>
          )}
          {result.errors.length > 0 && (
            <div style={{ textAlign: 'left', background: 'var(--danger-50)', borderRadius: '10px', padding: '16px', marginBottom: '24px', border: '1px solid var(--danger-300)' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--danger-700)', margin: '0 0 8px' }}>{ti('errors')}</p>
              {result.errors.slice(0, 10).map((e, i) => <p key={i} style={{ fontSize: '12px', color: 'var(--danger-800)', margin: '2px 0', fontFamily: 'monospace' }}>{ti('errorRow', { row: e.row, tag: e.tag })} {e.reason}</p>)}
              {result.errors.length > 10 && <p style={{ fontSize: '12px', color: 'var(--danger-800)', margin: '6px 0 0' }}>{ti('andMore', { n: result.errors.length - 10 })}</p>}
              <button onClick={() => downloadErrors(result.errors, fileName, ti)} style={{ marginTop: '8px', padding: '6px 12px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--danger-300)', background: 'var(--card-bg)', color: 'var(--danger-700)', cursor: 'pointer' }}>⬇ {ti('downloadErrors')}</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <Link href={`/projects/${projectId}/tags`} style={{ padding: '10px 22px', background: 'var(--primary-600)', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 500, textDecoration: 'none' }}>{ti('viewTags')} →</Link>
            <button onClick={() => { setStep('upload'); setRows([]); setFileName(null); setExistingTags(null); setResult(null) }} style={{ padding: '10px 22px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}>{ti('importMore')}</button>
          </div>
        </div>
      )}

    </div>
  )
}

// Nombres legibles de las columnas de BD en la vista previa: TagImport.field.<columna>.
const FIELD_KEYS = [
  'description', 'manufacturer', 'model', 'serial_number', 'preservation_required', 'pid_drawing', 'datasheet_number',
  'revision', 'range_min', 'range_max', 'eng_unit', 'junction_box', 'fluid_type', 'mounting_typical', 'criticality',
  'sil_level', 'equipment_type_id', 'subsystem_id', 'discipline_id',
]

/** C-24: el informe de errores completo, no solo los 10 primeros. */
function downloadErrors(errors: ImportResult['errors'], fileName: string | null, ti: (key: string) => string) {
  const ws = XLSX.utils.json_to_sheet(errors.map(e => ({ [ti('xlsx.row')]: e.row, Tag: e.tag, [ti('xlsx.reason')]: e.reason })))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, ti('xlsx.sheet'))
  XLSX.writeFile(wb, `${ti('xlsx.file')}-${(fileName ?? 'import').replace(/\.[^.]+$/, '')}.xlsx`)
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{children}</th>
}
const tdStyle: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' }
