'use client'

import { useState, useTransition, useId } from 'react'
import { useTranslations } from 'next-intl'
import * as XLSX from 'xlsx'
import { FileSpreadsheet } from 'lucide-react'
import { bulkImportCatalog, type CatalogRow } from '@/app/actions/itr-templates'
import { detectItrPhase } from '@/lib/utils'
import { DialogSurface } from '@/components/ui/dialog-a11y'
import { pressable } from '@/lib/a11y/pressable'
import { alpha, ink } from '@/lib/theme'

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
  const [isPending, startTransition] = useTransition()
  const titleId = useId()
  const tA11y = useTranslations('A11y')
  const t = useTranslations('CatalogImport')
  const [step, setStep] = useState<'upload' | 'map' | 'done'>('upload')
  const [parsed, setParsed] = useState<ParsedCatalog | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // discipline mapping: discLetter → discipline_id
  const [discMap, setDiscMap] = useState<Record<string, string>>({})
  // phase mapping: 'A'|'B'|'C' → phase_id (auto-detect from phase codes)
  const [phaseMap, setPhaseMap] = useState<Record<string, string>>({})
  const [importResult, setImportResult] = useState<{ templatesCreated: number; templatesSkipped: number; itemsCreated: number; errors: string[] } | null>(null)

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
        if (raw.length < 2) { setParseError(t('empty')); return }

        const result = parseCatalog(raw)
        if (result.templateCount === 0) { setParseError(t('noTemplates')); return }

        setParsed(result)
        setPhaseMap(buildDefaultPhaseMap())
        // Auto-map obvious disciplines
        const autoDisc: Record<string, string> = {}
        for (const letter of result.discLetters) {
          const match = disciplines.find(d =>
            (letter === 'E' && d.code === 'ELEC') ||
            (letter === 'H' && d.code === 'HVAC') ||
            (letter === 'I' && d.code === 'INST') ||
            (letter === 'M' && d.code === 'MECH') ||
            (letter === 'P' && d.code === 'PIPE') ||
            (letter === 'T' && (d.code === 'TELE' || d.code === 'TELEC')) ||
            (letter === 'L' && d.code === 'SAFE') ||
            (letter === 'Q' && d.code === 'INSU') ||
            (letter === 'X' && d.code === 'PAINT')
          )
          if (match) autoDisc[letter] = match.id
        }
        setDiscMap(autoDisc)
        setStep('map')
      } catch {
        setParseError(t('readError'))
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
      // el wrapper withAuth puede devolver solo { error } — normalizar
      setImportResult({
        templatesCreated: res.templatesCreated ?? 0,
        templatesSkipped: res.templatesSkipped ?? 0,
        itemsCreated: res.itemsCreated ?? 0,
        errors: res.error ? [res.error, ...(res.errors ?? [])] : (res.errors ?? []),
      })
      setStep('done')
    })
  }

  const mappedCount = Object.keys(discMap).filter(k => discMap[k]).length
  const totalDiscLetters = parsed?.discLetters.length ?? 0
  const allMapped = mappedCount === totalDiscLetters
  const sortedPhases = [...phases].sort((a, b) => a.order_index - b.order_index)

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <DialogSurface onClose={onClose} labelledBy={titleId} style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '600px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '22px' }}>
          <div>
            <h2 id={titleId} style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>
              {t('title')}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              {step === 'upload' && t('uploadHint')}
              {step === 'map' && t('detected', { templates: parsed!.templateCount, items: parsed!.itemCount })}
              {step === 'done' && t('done')}
            </p>
          </div>
          <button onClick={onClose} aria-label={tA11y('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', padding: '2px' }}>✕</button>
        </div>

        {/* STEP: upload */}
        {step === 'upload' && (
          <div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              {...pressable(e => {
                // El input oculto vive dentro de la zona: su propio clic burbujea hasta aquí.
                if (e.target instanceof HTMLInputElement) return
                e.currentTarget.querySelector<HTMLInputElement>('input[type="file"]')?.click()
              })}
              style={{ border: `2px dashed ${dragOver ? 'var(--primary-500)' : 'var(--gray-300)'}`, borderRadius: '12px', padding: '44px 20px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'var(--primary-50)' : 'var(--gray-50)', transition: 'all 0.15s' }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px', opacity: 0.5 }}>
                <FileSpreadsheet size={36} aria-hidden="true" />
              </div>
              <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)', margin: '0 0 4px' }}>{t('drop')}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>{t('dropHint')}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, padding: '8px 14px', background: 'var(--gray-100)', borderRadius: '6px', display: 'inline-block' }}>
                {t('columns')}
              </p>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} style={{ display: 'none' }} />
            </div>
            {parseError && <p style={{ fontSize: '13px', color: 'var(--danger-700)', margin: '12px 0 0', padding: '10px 14px', background: 'var(--danger-100)', borderRadius: '8px' }}>{parseError}</p>}
          </div>
        )}

        {/* STEP: map disciplines + preview */}
        {step === 'map' && parsed && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>

              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '20px' }}>
                {[
                  { label: t('stat.templates'), value: parsed.templateCount, color: 'var(--primary-700)' },
                  { label: t('stat.items'), value: parsed.itemCount, color: 'var(--success-700)' },
                  { label: t('stat.disciplines'), value: parsed.discLetters.length, color: 'var(--violet-700)' },
                ].map(c => (
                  <div key={c.label} style={{ padding: '12px 14px', background: alpha(c.color, 3), border: `1px solid ${alpha(c.color, 13)}`, borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: ink(c.color) }}>{c.value}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{c.label}</div>
                  </div>
                ))}
              </div>

              {/* Phase breakdown */}
              <div style={{ marginBottom: '20px', padding: '12px 14px', background: 'var(--gray-50)', borderRadius: '8px' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('byPhase')}</p>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {sortedPhases.map(p => {
                    const count = parsed.phaseBreakdown[p.code] ?? 0
                    const phaseId = phaseMap[p.code]
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: alpha(p.color, 9), color: ink(p.color) }}>{p.code}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-strong)', fontWeight: 500 }}>{t('templatesN', { n: count })}</span>
                        {!phaseId && count > 0 && <span style={{ fontSize: '12px', color: 'var(--danger-700)' }}>{t('unmapped')}</span>}
                        {phaseId && count > 0 && <span style={{ fontSize: '12px', color: 'var(--success-700)' }}>✓</span>}
                      </div>
                    )
                  })}
                </div>
                {/* Allow manual phase override if needed */}
                {sortedPhases.some(p => !phaseMap[p.code] && (parsed.phaseBreakdown[p.code] ?? 0) > 0) && (
                  <div style={{ marginTop: '12px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--danger-700)', margin: '0 0 8px' }}>{t('mapPhases')}</p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {sortedPhases.filter(p => !phaseMap[p.code] && (parsed.phaseBreakdown[p.code] ?? 0) > 0).map(p => (
                        <label key={p.code} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-body)' }}>
                          <span style={{ fontWeight: 600 }}>{t('phase', { code: p.code })}</span>
                          <select
                            value={phaseMap[p.code] ?? ''}
                            onChange={e => setPhaseMap(pm => ({ ...pm, [p.code]: e.target.value }))}
                            style={selStyle}
                          >
                            <option value="">{t('pick')}</option>
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
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('mapDisciplines')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {parsed.discLetters.map(letter => {
                    const count = parsed.rows.filter(r => r.discLetter === letter).length
                    const templateCount = new Set(parsed.rows.filter(r => r.discLetter === letter).map(r => r.code)).size
                    const mapped = discMap[letter]
                    return (
                      <div key={letter} style={{ display: 'grid', gridTemplateColumns: '40px 120px 1fr', gap: '12px', alignItems: 'center', padding: '10px 12px', background: mapped ? 'var(--success-50)' : 'var(--warning-50)', borderRadius: '8px', border: `1px solid ${mapped ? 'var(--success-200)' : 'var(--warning-300)'}` }}>
                        <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-strong)', fontFamily: 'monospace', textAlign: 'center' }}>{letter}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('templatesN', { n: templateCount })} · {t('itemsN', { n: count })}</span>
                        <select
                          value={discMap[letter] ?? ''}
                          onChange={e => setDiscMap(dm => ({ ...dm, [letter]: e.target.value }))}
                          style={selStyle}
                        >
                          <option value="">{t('skip')}</option>
                          {disciplines.map(d => (
                            <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
                {!allMapped && (
                  <p style={{ fontSize: '12px', color: 'var(--warning-700)', margin: '10px 0 0' }}>
                    {t('unmappedHelp')}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--gray-100)' }}>
              <button onClick={() => { setStep('upload'); setParsed(null) }} style={{ padding: '9px 16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                {t('back')}
              </button>
              <button
                onClick={handleImport}
                disabled={isPending}
                style={{ padding: '9px 22px', background: isPending ? 'var(--primary-300)' : 'var(--primary-600)', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer' }}
              >
                {isPending ? t('importing') : t('import', { n: parsed.templateCount })}
              </button>
            </div>
          </div>
        )}

        {/* STEP: done */}
        {step === 'done' && importResult && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '14px' }}>✅</div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 6px' }}>{t('done')}</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', margin: '16px 0' }}>
              {[
                { label: t('stat.created'), value: importResult.templatesCreated, color: 'var(--success-700)' },
                { label: t('stat.skipped'), value: importResult.templatesSkipped, color: 'var(--text-muted)' },
                { label: t('stat.items'), value: importResult.itemsCreated, color: 'var(--primary-700)' },
              ].map(c => (
                <div key={c.label} style={{ padding: '12px 18px', background: alpha(c.color, 6), borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: ink(c.color) }}>{c.value}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.label}</div>
                </div>
              ))}
            </div>
            {importResult.errors.length > 0 && (
              <div style={{ margin: '0 0 16px', padding: '12px 14px', background: 'var(--orange-50)', borderRadius: '8px', textAlign: 'left', maxHeight: '120px', overflowY: 'auto' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--warning-800)', margin: '0 0 6px' }}>
                  {t('warnings', { n: importResult.errors.length })}
                </p>
                {importResult.errors.map((e, i) => <p key={i} style={{ fontSize: '12px', color: 'var(--warning-900)', margin: '2px 0' }}>• {e}</p>)}
              </div>
            )}
            <button onClick={onSuccess} style={{ padding: '10px 24px', background: 'var(--primary-600)', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}>
              {t('viewTemplates')}
            </button>
          </div>
        )}
      </DialogSurface>
    </div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '7px',
  fontSize: '12px', color: 'var(--text-strong)', background: 'var(--card-bg)', cursor: 'pointer',
  fontFamily: 'inherit', flex: 1,
}
