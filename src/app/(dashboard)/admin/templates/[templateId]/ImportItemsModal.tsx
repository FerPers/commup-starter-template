'use client'

import { useState, useTransition, useId } from 'react'
import { useTranslations } from 'next-intl'
import * as XLSX from 'xlsx'
import { importTemplateItems, type ImportSection } from '@/app/actions/itr-templates'
import type { ItrItemType } from '@/types/database'
import { DialogSurface } from '@/components/ui/dialog-a11y'
import { pressable } from '@/lib/a11y/pressable'

type Tx = ReturnType<typeof useTranslations>

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
  continuidad: 'continuity', continuity: 'continuity',
  medicion: 'measurement', measurement: 'measurement', med: 'measurement',
  texto: 'text', 'texto libre': 'text', text: 'text',
  foto: 'photo', photo: 'photo',
  firma: 'signature', signature: 'signature',
  fecha: 'date', date: 'date',
  seleccion: 'select', select: 'select',
}

function mapType(raw: unknown, warnings: string[], rowNum: number, tx: Tx): ItrItemType {
  if (!raw) return 'checkbox'
  const key = normalizeStr(String(raw))
  const mapped = TYPE_MAP[key]
  if (!mapped) warnings.push(tx('warnUnknownType', { row: rowNum, raw: String(raw) }))
  return mapped ?? 'checkbox'
}

function mapBool(raw: unknown): boolean {
  if (!raw) return false
  const s = normalizeStr(String(raw))
  return s === 's' || s === 'si' || s === 'sí' || s === 'y' || s === 'yes' || s === 'true' || s === '1' || s === 'x'
}

// ── Excel template download ───────────────────────────────────

function downloadTemplate(tx: Tx) {
  const headers = [
    tx('col.number'), tx('col.section'), tx('col.descEn'), tx('col.descEs'),
    tx('col.type'), tx('col.critical'), tx('col.required'), tx('col.photo'), tx('col.unit'), tx('col.min'), tx('col.max'),
  ]
  const [secGeneral, secElectrical, secDocs] = [tx('sample.sectionGeneral'), tx('sample.sectionElectrical'), tx('sample.sectionDocs')]
  const [check, measure, sign] = [tx('sample.typeCheck'), tx('sample.typeMeasurement'), tx('sample.typeSignature')]
  const [yes, no] = [tx('sample.yes'), tx('sample.no')]
  const sample = [
    ['1.0', secGeneral, 'Verify nameplate data', 'Verificar datos de placa de datos', check, no, yes, no, '', '', ''],
    ['1.1', secGeneral, 'Check enclosure IP rating', 'Verificar clasificación IP del gabinete', check, no, yes, no, '', '', ''],
    ['2.0', secElectrical, 'Measure insulation resistance', 'Medir resistencia de aislamiento', measure, yes, yes, no, 'MΩ', '100', ''],
    ['2.1', secElectrical, 'Verify trip settings', 'Verificar ajuste de protecciones', check, yes, yes, no, '', '', ''],
    ['3.0', secDocs, 'Sign and date form', 'Firmar y fechar formulario', sign, no, yes, no, '', '', ''],
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

function parseRows(rows: unknown[][], tx: Tx): ParseResult {
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
      warnings.push(tx('warnEmptyDesc', { row: i + 1 }))
      continue
    }

    const sec = sectionTitle || tx('noSection')

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
      item_type: mapType(typeRaw, warnings, i + 1, tx),
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
  const tx = useTranslations('ItemImport')
  const tA11y = useTranslations('A11y')
  const titleId = useId()
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
          setParseError(tx('errEmpty'))
          return
        }
        const result = parseRows(rows, tx)
        if (result.sections.length === 0) {
          setParseError(tx('errNoItems'))
          return
        }
        setParsed(result)
        setStep('preview')
      } catch {
        setParseError(tx('errRead'))
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
      setImportResult({ sectionsCreated: res.sectionsCreated ?? 0, itemsCreated: res.itemsCreated ?? 0 })
      setStep('done')
    })
  }

  const totalItems = parsed?.sections.reduce((s, sec) => s + sec.items.length, 0) ?? 0

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '20px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <DialogSurface onClose={onClose} labelledBy={titleId} style={{
        background: 'var(--card-bg)', borderRadius: '16px', padding: '28px',
        width: '100%', maxWidth: '560px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 id={titleId} style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>
              {tx('title')}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              {step === 'upload' && tx('subtitleUpload')}
              {step === 'preview' && tx('subtitlePreview', { sections: parsed!.sections.length, items: totalItems })}
              {step === 'done' && tx('subtitleDone')}
            </p>
          </div>
          <button onClick={onClose} aria-label={tA11y('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', lineHeight: 1, padding: '2px' }}>✕</button>
        </div>

        {/* Step: upload */}
        {step === 'upload' && (
          <div>
            {/* Download template link */}
            <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'var(--sky-50)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--sky-700)' }}>{tx('firstTime')}</span>
              <button
                onClick={() => downloadTemplate(tx)}
                style={{ fontSize: '12px', fontWeight: 600, color: 'var(--sky-700)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {tx('downloadTemplate')}
              </button>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              {...pressable(e => {
                // El input oculto vive dentro de la zona: su propio clic burbujea hasta aquí.
                if (e.target instanceof HTMLInputElement) return
                e.currentTarget.querySelector<HTMLInputElement>('input[type="file"]')?.click()
              })}
              style={{
                border: `2px dashed ${dragOver ? 'var(--primary-500)' : 'var(--gray-300)'}`,
                borderRadius: '12px', padding: '40px 20px', textAlign: 'center',
                cursor: 'pointer', background: dragOver ? 'var(--primary-50)' : 'var(--gray-50)',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '10px', opacity: 0.5 }}>📊</div>
              <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)', margin: '0 0 4px' }}>
                {tx('dropHere')}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                {tx('orClick')}
              </p>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} style={{ display: 'none' }} />
            </div>

            {parseError && (
              <p style={{ fontSize: '13px', color: 'var(--danger-700)', margin: '12px 0 0', padding: '10px 14px', background: 'var(--danger-100)', borderRadius: '8px' }}>
                {parseError}
              </p>
            )}

            {/* Column reference */}
            <div style={{ marginTop: '16px', padding: '12px 14px', background: 'var(--gray-50)', borderRadius: '8px' }}>
              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {tx('columnsTitle')}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
                {[
                  ['A', tx('col.number')], ['B', tx('col.section')], ['C', `${tx('col.descEn')} *`],
                  ['D', tx('col.descEs')], ['E', tx('col.type')], ['F', tx('col.criticalYn')],
                  ['G', tx('col.requiredYn')], ['H', tx('col.photoYn')], ['I', tx('col.unit')],
                  ['J', tx('col.min')], ['K', tx('col.max')],
                ].map(([col, label]) => (
                  <div key={col} style={{ display: 'flex', gap: '6px', fontSize: '12px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-700)', minWidth: '14px' }}>{col}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '8px 0 0' }}>
                {tx('validTypes')}
              </p>
            </div>
          </div>
        )}

        {/* Step: preview */}
        {step === 'preview' && parsed && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Warnings */}
            {parsed.warnings.length > 0 && (
              <div style={{ padding: '10px 14px', background: 'var(--warning-50)', borderRadius: '8px', marginBottom: '12px', border: '1px solid var(--warning-300)' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--warning-800)', margin: '0 0 4px' }}>
                  {tx('warnings', { count: parsed.warnings.length })}
                </p>
                {parsed.warnings.map((w, i) => (
                  <p key={i} style={{ fontSize: '12px', color: 'var(--warning-900)', margin: '2px 0 0' }}>• {w}</p>
                ))}
              </div>
            )}

            {/* Section list (scrollable) */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '14px' }}>
              {parsed.sections.map((sec, sIdx) => (
                <div key={sIdx} style={{ borderBottom: sIdx < parsed.sections.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                  <div style={{ padding: '10px 14px', background: 'var(--gray-50)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)' }}>{sec.title}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx('itemsCount', { count: sec.items.length })}</span>
                  </div>
                  {sec.items.slice(0, 3).map((item, iIdx) => (
                    <div key={iIdx} style={{ padding: '7px 14px 7px 22px', display: 'flex', gap: '10px', alignItems: 'center', borderTop: '1px solid var(--gray-50)' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: '32px' }}>{item.item_number ?? '—'}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', flex: 1 }}>{item.description}</span>
                      <span style={{
                        fontSize: '12px', padding: '1px 6px', borderRadius: '999px',
                        background: 'var(--border)', color: 'var(--text-muted)',
                      }}>{item.item_type}</span>
                      {item.is_critical && <span style={{ fontSize: '12px', color: 'var(--danger-700)' }}>●</span>}
                    </div>
                  ))}
                  {sec.items.length > 3 && (
                    <p style={{ padding: '6px 22px', fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                      {tx('more', { count: sec.items.length - 3 })}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Replace option */}
            {hasExistingContent && (
              <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'start', columnGap: '8px', cursor: 'pointer', marginBottom: '14px', padding: '12px 14px', background: replace ? 'var(--orange-50)' : 'var(--gray-50)', borderRadius: '8px', border: `1px solid ${replace ? 'var(--orange-200)' : 'var(--border)'}` }}>
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={e => setReplace(e.target.checked)}
                  style={{ accentColor: 'var(--orange-500)', marginTop: '1px', flexShrink: 0, gridRow: 'span 2' }}
                />
                <p style={{ fontSize: '13px', fontWeight: 500, color: replace ? 'var(--orange-700)' : 'var(--text-muted)', margin: '0 0 2px' }}>
                  {tx('replaceTitle')}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  {tx(replace ? 'replaceOn' : 'replaceOff')}
                </p>
              </label>
            )}

            {parseError && (
              <p style={{ fontSize: '13px', color: 'var(--danger-700)', margin: '0 0 12px', padding: '10px 14px', background: 'var(--danger-100)', borderRadius: '8px' }}>
                {parseError}
              </p>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setStep('upload'); setParsed(null); setParseError(null) }}
                style={{ padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                {tx('back')}
              </button>
              <button
                onClick={handleImport}
                disabled={isPending}
                style={{
                  padding: '9px 20px', background: isPending ? 'var(--primary-300)' : 'var(--primary-600)',
                  color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {isPending ? tx('importing') : tx('importBtn', { count: totalItems })}
              </button>
            </div>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && importResult && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '14px' }}>✅</div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 6px' }}>
              {tx('successTitle')}
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 24px' }}>
              {tx('successDetail', { sections: importResult.sectionsCreated, items: importResult.itemsCreated })}
            </p>
            <button
              onClick={onSuccess}
              style={{
                padding: '10px 24px', background: 'var(--primary-600)', color: '#fff',
                borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer',
              }}
            >
              {tx('viewUpdated')}
            </button>
          </div>
        )}
      </DialogSurface>
    </div>
  )
}
