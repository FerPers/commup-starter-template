'use client'

import { useState, useTransition, useRef } from 'react'
import * as XLSX from 'xlsx'
import { importTemplateItems, type ImportSection } from '@/app/actions/itr-templates'
import type { ItrItemType } from '@/types/database'

interface Props {
  templateId: string
  hasExistingContent: boolean
  onClose: () => void
  onSuccess: () => void
}

// ── Type mapping ───────────────────────────────────────────────

function normalizeStr(s: string) {
  return s.toString().toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const TYPE_MAP: Record<string, ItrItemType> = {
  verificacion: 'checkbox', check: 'checkbox', checkbox: 'checkbox', verificar: 'checkbox',
  si_no: 'yes_no', 's/n': 'yes_no', yes_no: 'yes_no', 'si/no': 'yes_no', sino: 'yes_no',
  numero: 'number', number: 'number', 'num': 'number',
  medicion: 'measurement', measurement: 'measurement', med: 'measurement',
  texto: 'text', 'texto libre': 'text', text: 'text',
  foto: 'photo', photo: 'photo',
  firma: 'signature', signature: 'signature',
  fecha: 'date', date: 'date',
  seleccion: 'select', select: 'select',
}

function mapType(raw: unknown, warnings: string[], rowNum: number): ItrItemType {
  if (!raw) return 'checkbox'
  const key = normalizeStr(String(raw))
  const mapped = TYPE_MAP[key]
  if (!mapped) warnings.push(`Fila ${rowNum}: tipo desconocido "${raw}" — se usará 'verificacion'`)
  return mapped ?? 'checkbox'
}

function mapBool(raw: unknown): boolean {
  if (!raw) return false
  const s = normalizeStr(String(raw))
  return s === 's' || s === 'si' || s === 'sí' || s === 'yes' || s === 'true' || s === '1' || s === 'x'
}

// ── Excel template download ───────────────────────────────────

function downloadTemplate() {
  const headers = [
    'N° Ítem', 'Sección', 'Descripción EN', 'Descripción ES',
    'Tipo', 'Crítico', 'Requerido', 'Foto', 'Unidad', 'Criterio Mín', 'Criterio Máx',
  ]
  const sample = [
    ['1.0', 'INSPECCIÓN GENERAL', 'Verify nameplate data', 'Verificar datos de placa de datos', 'verificacion', 'N', 'S', 'N', '', '', ''],
    ['1.1', 'INSPECCIÓN GENERAL', 'Check enclosure IP rating', 'Verificar clasificación IP del gabinete', 'verificacion', 'N', 'S', 'N', '', '', ''],
    ['2.0', 'PRUEBAS ELÉCTRICAS', 'Measure insulation resistance', 'Medir resistencia de aislamiento', 'medicion', 'S', 'S', 'N', 'MΩ', '100', ''],
    ['2.1', 'PRUEBAS ELÉCTRICAS', 'Verify trip settings', 'Verificar ajuste de protecciones', 'verificacion', 'S', 'S', 'N', '', '', ''],
    ['3.0', 'DOCUMENTACIÓN', 'Sign and date form', 'Firmar y fechar formulario', 'firma', 'N', 'S', 'N', '', '', ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample])
  ws['!cols'] = [
    { wch: 10 }, { wch: 22 }, { wch: 35 }, { wch: 38 },
    { wch: 14 }, { wch: 8 }, { wch: 9 }, { wch: 6 },
    { wch: 8 }, { wch: 12 }, { wch: 12 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ITR Items')
  XLSX.writeFile(wb, 'CommUp_ITR_Template.xlsx')
}

// ── Parser ─────────────────────────────────────────────────────

interface ParseResult {
  sections: ImportSection[]
  warnings: string[]
}

function parseRows(rows: unknown[][]): ParseResult {
  const warnings: string[] = []
  const sectionsMap: Map<string, ImportSection> = new Map()
  const sectionOrder: string[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const itemNumber = String(row[0] ?? '').trim()
    const sectionTitle = String(row[1] ?? '').trim()
    const descEN = String(row[2] ?? '').trim()
    const descES = String(row[3] ?? '').trim()
    const typeRaw = row[4]
    const critical = mapBool(row[5])
    const required = mapBool(row[6])
    const photo = mapBool(row[7])
    const unit = String(row[8] ?? '').trim() || null
    const minRaw = row[9]
    const maxRaw = row[10]

    // Skip truly empty rows
    if (!descEN && !sectionTitle && !itemNumber) continue

    if (!descEN) {
      warnings.push(`Fila ${i + 1}: descripción EN vacía — omitida`)
      continue
    }

    const sec = sectionTitle || 'SIN SECCIÓN'

    if (!sectionsMap.has(sec)) {
      sectionsMap.set(sec, { title: sec, items: [] })
      sectionOrder.push(sec)
    }

    const acceptMin = minRaw !== '' && minRaw != null ? Number(minRaw) : null
    const acceptMax = maxRaw !== '' && maxRaw != null ? Number(maxRaw) : null

    sectionsMap.get(sec)!.items.push({
      item_number: itemNumber || null,
      description: descEN,
      description_es: descES || null,
      item_type: mapType(typeRaw, warnings, i + 1),
      is_critical: critical,
      is_required: required,
      requires_photo: photo,
      unit,
      acceptance_min: isNaN(acceptMin as number) ? null : acceptMin,
      acceptance_max: isNaN(acceptMax as number) ? null : acceptMax,
    })
  }

  const sections = sectionOrder.map(k => sectionsMap.get(k)!)
  return { sections, warnings }
}

// ── Component ──────────────────────────────────────────────────

export default function ImportItemsModal({ templateId, hasExistingContent, onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [replace, setReplace] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ sectionsCreated: number; itemsCreated: number } | null>(null)

  function processFile(file: File) {
    setParseError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (rows.length < 2) {
          setParseError('El archivo está vacío o solo tiene el encabezado.')
          return
        }
        const result = parseRows(rows)
        if (result.sections.length === 0) {
          setParseError('No se encontraron ítems válidos en el archivo.')
          return
        }
        setParsed(result)
        setStep('preview')
      } catch {
        setParseError('Error al leer el archivo. Verifica que sea un .xlsx o .xls válido.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  function handleImport() {
    if (!parsed) return
    startTransition(async () => {
      const res = await importTemplateItems(templateId, parsed.sections, replace)
      if (res.error) { setParseError(res.error); return }
      setImportResult({ sectionsCreated: res.sectionsCreated, itemsCreated: res.itemsCreated })
      setStep('done')
    })
  }

  const totalItems = parsed?.sections.reduce((s, sec) => s + sec.items.length, 0) ?? 0

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'white', borderRadius: '16px', padding: '28px',
        width: '100%', maxWidth: '560px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
              Importar ítems desde Excel
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              {step === 'upload' && 'Sube tu archivo .xlsx con las secciones e ítems del ITR'}
              {step === 'preview' && `${parsed!.sections.length} secciones · ${totalItems} ítems detectados`}
              {step === 'done' && 'Importación completada'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px', lineHeight: 1, padding: '2px' }}>✕</button>
        </div>

        {/* Step: upload */}
        {step === 'upload' && (
          <div>
            {/* Download template link */}
            <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#f0f9ff', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: '#0284c7' }}>¿Primera vez? Descarga el formato de ejemplo</span>
              <button
                onClick={downloadTemplate}
                style={{ fontSize: '12px', fontWeight: 600, color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Descargar template
              </button>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#3b82f6' : '#cbd5e1'}`,
                borderRadius: '12px', padding: '40px 20px', textAlign: 'center',
                cursor: 'pointer', background: dragOver ? '#eff6ff' : '#fafafa',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '10px', opacity: 0.5 }}>📊</div>
              <p style={{ fontSize: '14px', fontWeight: 500, color: '#475569', margin: '0 0 4px' }}>
                Arrastra tu archivo Excel aquí
              </p>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                o haz clic para seleccionar (.xlsx, .xls)
              </p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} style={{ display: 'none' }} />
            </div>

            {parseError && (
              <p style={{ fontSize: '13px', color: '#ef4444', margin: '12px 0 0', padding: '10px 14px', background: '#fee2e2', borderRadius: '8px' }}>
                {parseError}
              </p>
            )}

            {/* Column reference */}
            <div style={{ marginTop: '16px', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Columnas esperadas (fila 1 = encabezado)
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
                {[
                  ['A', 'N° Ítem'], ['B', 'Sección'], ['C', 'Descripción EN *'],
                  ['D', 'Descripción ES'], ['E', 'Tipo'], ['F', 'Crítico (S/N)'],
                  ['G', 'Requerido (S/N)'], ['H', 'Foto (S/N)'], ['I', 'Unidad'],
                  ['J', 'Criterio Mín'], ['K', 'Criterio Máx'],
                ].map(([col, label]) => (
                  <div key={col} style={{ display: 'flex', gap: '6px', fontSize: '11px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#3b82f6', minWidth: '14px' }}>{col}</span>
                    <span style={{ color: '#475569' }}>{label}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '8px 0 0' }}>
                Tipos válidos: verificacion · si_no · medicion · numero · texto · foto · firma · fecha · seleccion
              </p>
            </div>
          </div>
        )}

        {/* Step: preview */}
        {step === 'preview' && parsed && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Warnings */}
            {parsed.warnings.length > 0 && (
              <div style={{ padding: '10px 14px', background: '#fffbeb', borderRadius: '8px', marginBottom: '12px', border: '1px solid #fcd34d' }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', margin: '0 0 4px' }}>
                  {parsed.warnings.length} advertencia{parsed.warnings.length > 1 ? 's' : ''}:
                </p>
                {parsed.warnings.map((w, i) => (
                  <p key={i} style={{ fontSize: '11px', color: '#78350f', margin: '2px 0 0' }}>• {w}</p>
                ))}
              </div>
            )}

            {/* Section list (scrollable) */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '14px' }}>
              {parsed.sections.map((sec, sIdx) => (
                <div key={sIdx} style={{ borderBottom: sIdx < parsed.sections.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ padding: '10px 14px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>{sec.title}</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{sec.items.length} ítems</span>
                  </div>
                  {sec.items.slice(0, 3).map((item, iIdx) => (
                    <div key={iIdx} style={{ padding: '7px 14px 7px 22px', display: 'flex', gap: '10px', alignItems: 'center', borderTop: '1px solid #f8fafc' }}>
                      <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace', minWidth: '32px' }}>{item.item_number ?? '—'}</span>
                      <span style={{ fontSize: '12px', color: '#475569', flex: 1 }}>{item.description}</span>
                      <span style={{
                        fontSize: '10px', padding: '1px 6px', borderRadius: '999px',
                        background: '#e2e8f0', color: '#475569',
                      }}>{item.item_type}</span>
                      {item.is_critical && <span style={{ fontSize: '10px', color: '#ef4444' }}>●</span>}
                    </div>
                  ))}
                  {sec.items.length > 3 && (
                    <p style={{ padding: '6px 22px', fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                      + {sec.items.length - 3} más...
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Replace option */}
            {hasExistingContent && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', marginBottom: '14px', padding: '12px 14px', background: replace ? '#fff7ed' : '#f8fafc', borderRadius: '8px', border: `1px solid ${replace ? '#fed7aa' : '#e2e8f0'}` }}>
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={e => setReplace(e.target.checked)}
                  style={{ accentColor: '#f97316', marginTop: '1px', flexShrink: 0 }}
                />
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: replace ? '#c2410c' : '#475569', margin: '0 0 2px' }}>
                    Reemplazar contenido existente
                  </p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                    {replace ? 'Se eliminarán todas las secciones e ítems actuales antes de importar.' : 'Los nuevos ítems se agregarán al final del template.'}
                  </p>
                </div>
              </label>
            )}

            {parseError && (
              <p style={{ fontSize: '13px', color: '#ef4444', margin: '0 0 12px', padding: '10px 14px', background: '#fee2e2', borderRadius: '8px' }}>
                {parseError}
              </p>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setStep('upload'); setParsed(null); setParseError(null) }}
                style={{ padding: '9px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
              >
                ← Volver
              </button>
              <button
                onClick={handleImport}
                disabled={isPending}
                style={{
                  padding: '9px 20px', background: isPending ? '#93c5fd' : '#3b82f6',
                  color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {isPending ? 'Importando...' : `Importar ${totalItems} ítems →`}
              </button>
            </div>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && importResult && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '14px' }}>✅</div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: '0 0 6px' }}>
              Importación exitosa
            </p>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 24px' }}>
              {importResult.sectionsCreated} sección{importResult.sectionsCreated !== 1 ? 'es' : ''} y{' '}
              {importResult.itemsCreated} ítem{importResult.itemsCreated !== 1 ? 's' : ''} creados.
            </p>
            <button
              onClick={onSuccess}
              style={{
                padding: '10px 24px', background: '#3b82f6', color: 'white',
                borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer',
              }}
            >
              Ver template actualizado →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
