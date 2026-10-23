'use client'

import { SOURCE_REFS, TABLE_SOURCE_LABELS, parseTableConfig } from '@/lib/itr/table'
import { itemDescription } from '@/lib/itr/item-text'

import type { Json } from '@/types/supabase.generated'
import { useId, useState } from 'react'
import { alpha, ink } from '@/lib/theme'
import { useLocale, useTranslations } from 'next-intl'

type ItrItemType = 'checkbox' | 'text' | 'number' | 'measurement' | 'select' | 'photo' | 'signature' | 'date' | 'yes_no' | 'continuity' | 'table'

interface PreviewItem {
  id: string
  item_number: string | null
  description: string
  description_es: string | null
  item_type: ItrItemType
  is_required: boolean
  is_critical: boolean
  requires_photo: boolean
  requires_document?: boolean
  requires_measurement: boolean
  unit: string | null
  acceptance_min: number | null
  acceptance_max: number | null
  acceptance_text: string | null
  options: Json
  order_index: number
}

interface PreviewSection {
  id: string
  title: string
  order_index: number
  itr_template_items: PreviewItem[]
}

interface TemplateData {
  id: string
  code: string
  title: string
  description: string | null
  version: number
  is_active: boolean
  disciplines: { id: string; code: string; name: string; color: string } | null
  project_phases: { id: string; code: string; name: string; color: string } | null
  itr_template_sections: PreviewSection[]
}

// ── Textos del formulario simulado ──────────────────────────────
// V2: la vista previa muestra el ITR en el idioma del selector ES/EN (el del documento, no el de la interfaz).
type Lang = 'es' | 'en'
const DOC = {
  es: {
    type: { continuity: 'Continuidad por conductor', table: 'Tabla de registro', checkbox: 'Verificación', yes_no: 'Sí / No', number: 'Número', measurement: 'Medición', text: 'Texto', select: 'Selección', photo: 'Foto', signature: 'Firma', date: 'Fecha' } as Record<ItrItemType, string>,
    tableInvalid: 'Tabla sin configuración válida.', row: 'Fila', auto: 'Automático', resultOptions: 'Aceptado / Rechazado / N.A.', computed: 'calculado', datetime: 'AAAA-MM-DD hh:mm',
    sourceNote: (src: string, unit: string) => `Filas desde ${src}: se arman al generar el ITR (una por ${unit}); los datos ‹entre comillas› se toman de esa foto.`,
    signal: 'señal', effect: 'efecto',
    variableNote: (min: number, max: number) => `Filas variables: el inspector declara entre ${min} y ${max}.`,
    stability: (n: number) => `Estabilidad: las últimas ${n} lecturas`,
    continuity: 'Registro por pares o conductores: terminales, resultados, pantallas y lecturas según el procedimiento. Las filas se configuran al ejecutar el ITR.',
    verify: 'Marcar como verificado', yesNo: ['Sí', 'No', 'N/A'], measured: 'Valor medido', result: 'Resultado: —', acceptance: 'Criterio de aceptación:', criterion: 'Criterio:',
    observation: 'Ingrese observación…', select: '— Seleccionar —', photo: 'Tomar / adjuntar foto', signArea: 'Área de firma',
    remarks: 'Observaciones', remarksPh: 'Observaciones opcionales…', digitalSig: 'Firma digital', name: 'Nombre', date: 'Fecha',
    critical: 'Crítico', required: 'Requerido', photoReq: 'Requiere foto', docReq: 'Requiere documento (PDF)',
  },
  en: {
    type: { continuity: 'Continuity per conductor', table: 'Record table', checkbox: 'Check', yes_no: 'Yes / No', number: 'Number', measurement: 'Measurement', text: 'Text', select: 'Select', photo: 'Photo', signature: 'Signature', date: 'Date' } as Record<ItrItemType, string>,
    tableInvalid: 'Table without a valid configuration.', row: 'Row', auto: 'Automatic', resultOptions: 'Accepted / Rejected / N.A.', computed: 'computed', datetime: 'YYYY-MM-DD hh:mm',
    sourceNote: (src: string, unit: string) => `Rows from ${src}: built when the ITR is generated (one per ${unit}); the ‹quoted› data comes from that snapshot.`,
    signal: 'signal', effect: 'effect',
    variableNote: (min: number, max: number) => `Variable rows: the inspector declares between ${min} and ${max}.`,
    stability: (n: number) => `Stability: the last ${n} readings`,
    continuity: 'Record by pairs or conductors: terminals, results, screens and readings per the procedure. Rows are configured when the ITR is executed.',
    verify: 'Mark as verified', yesNo: ['Yes', 'No', 'N/A'], measured: 'Measured value', result: 'Result: —', acceptance: 'Acceptance criterion:', criterion: 'Criterion:',
    observation: 'Enter a remark…', select: '— Select —', photo: 'Take / attach photo', signArea: 'Signature area',
    remarks: 'Remarks', remarksPh: 'Optional remarks…', digitalSig: 'Digital signature', name: 'Name', date: 'Date',
    critical: 'Critical', required: 'Required', photoReq: 'Photo required', docReq: 'Document required (PDF)',
  },
}
type Doc = (typeof DOC)[Lang]

// ── Mock controls per item type ─────────────────────────────────

function ItemControl({ item, d }: { item: PreviewItem; d: Doc }) {
  const inputBase: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '14px', color: 'var(--text-strong)', background: 'var(--card-bg)',
    boxSizing: 'border-box', fontFamily: 'inherit',
  }

  if (item.item_type === 'table') {
    const config = parseTableConfig(item.options)
    if (!config) return <p style={{ color: 'var(--danger-700)' }}>{d.tableInvalid}</p>
    const rows = config.rows.mode === 'fixed' ? config.rows.labels : [`${config.rows.label} 1`, `${config.rows.label} 2`, '…']
    const source = config.rows.mode === 'source' ? config.rows.source : null
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>
          <thead><tr><th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)' }}>{config.rows.mode === 'fixed' ? d.row : config.rows.label}</th>{config.columns.map(c => <th key={c.key} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{c.label}{c.unit ? ` (${c.unit})` : ''}</th>)}</tr></thead>
          <tbody>{rows.map(label => <tr key={label}><td style={{ padding: '4px 8px', fontWeight: 600 }}>{label}</td>{config.columns.map(c => <td key={c.key} style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>{c.type === 'reference' && source ? `‹${SOURCE_REFS[source][c.ref ?? ''] ?? c.ref}›` : c.type === 'result' ? (c.auto_from ? d.auto : d.resultOptions) : c.type === 'computed' ? `${d.computed}${c.tolerance !== null && c.tolerance !== undefined ? ` ±${c.tolerance}` : ''}${c.pass === 'as_found' ? ' (as found)' : ''}` : c.type === 'datetime' ? d.datetime : c.type === 'select' ? (c.options ?? []).join(' / ') : c.type === 'number' ? '0.00' : '…'}</td>)}</tr>)}</tbody>
        </table>
        {source && <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.sourceNote(TABLE_SOURCE_LABELS[source].toLowerCase(), source === 'loop_signals' ? d.signal : d.effect)}</p>}
        {config.rows.mode === 'variable' && <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.variableNote(config.rows.min, config.rows.max)}</p>}
        {config.stability && <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.stability(config.stability.last_n)}{config.stability.min !== null ? ` ≥ ${config.stability.min}` : ''}{config.stability.max !== null ? ` ≤ ${config.stability.max}` : ''}.</p>}
      </div>
    )
  }
  if (item.item_type === 'continuity') return <p>{d.continuity}</p>

  if (item.item_type === 'checkbox') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input type="checkbox" disabled style={{ width: 18, height: 18, accentColor: 'var(--primary-500)', cursor: 'not-allowed' }} />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{d.verify}</span>
      </div>
    )
  }

  if (item.item_type === 'yes_no') {
    return (
      <div style={{ display: 'flex', gap: '8px' }}>
        {d.yesNo.map(opt => (
          <button key={opt} disabled style={{
            padding: '6px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            background: 'var(--gray-50)', border: '1px solid var(--border)', color: 'var(--text-muted)',
            cursor: 'not-allowed',
          }}>
            {opt}
          </button>
        ))}
      </div>
    )
  }

  if (item.item_type === 'number') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input type="number" disabled placeholder="0.00" style={{ ...inputBase, width: '140px' }} />
        {item.unit && <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>{item.unit}</span>}
        {(item.acceptance_min !== null || item.acceptance_max !== null) && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--gray-50)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            {item.acceptance_min !== null && item.acceptance_max !== null
              ? `${item.acceptance_min} – ${item.acceptance_max} ${item.unit ?? ''}`
              : item.acceptance_min !== null
              ? `≥ ${item.acceptance_min} ${item.unit ?? ''}`
              : `≤ ${item.acceptance_max} ${item.unit ?? ''}`}
          </span>
        )}
      </div>
    )
  }

  if (item.item_type === 'measurement') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="number" disabled placeholder={d.measured} style={{ ...inputBase, width: '160px' }} />
          {item.unit && <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>{item.unit}</span>}
          <span style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '6px', background: 'var(--gray-50)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            {d.result}
          </span>
        </div>
        {(item.acceptance_min !== null || item.acceptance_max !== null) && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {d.acceptance}{' '}
            <strong>
              {item.acceptance_min !== null && item.acceptance_max !== null
                ? `${item.acceptance_min} – ${item.acceptance_max} ${item.unit ?? ''}`
                : item.acceptance_min !== null
                ? `≥ ${item.acceptance_min} ${item.unit ?? ''}`
                : `≤ ${item.acceptance_max} ${item.unit ?? ''}`}
            </strong>
          </div>
        )}
        {item.acceptance_text && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{d.criterion} <strong>{item.acceptance_text}</strong></div>
        )}
      </div>
    )
  }

  if (item.item_type === 'text') {
    return <textarea disabled placeholder={d.observation} rows={2} style={{ ...inputBase, resize: 'vertical' }} />
  }

  if (item.item_type === 'select') {
    const opts = Array.isArray(item.options) ? item.options.filter((o): o is string => typeof o === 'string') : []
    return (
      <select disabled style={{ ...inputBase, width: 'auto', minWidth: '200px' }}>
        <option value="">{d.select}</option>
        {opts.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  if (item.item_type === 'photo') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px', border: '1.5px dashed var(--gray-300)', borderRadius: '10px',
        background: 'var(--gray-50)', color: 'var(--text-muted)', fontSize: '13px',
      }}>
        <span style={{ fontSize: '22px' }}>📷</span>
        <span>{d.photo}</span>
      </div>
    )
  }

  if (item.item_type === 'signature') {
    return (
      <div style={{
        height: '80px', border: '1.5px dashed var(--gray-300)', borderRadius: '10px',
        background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '13px', gap: '8px',
      }}>
        <span style={{ fontSize: '20px' }}>✍️</span>
        <span>{d.signArea}</span>
      </div>
    )
  }

  if (item.item_type === 'date') {
    return <input type="date" disabled style={{ ...inputBase, width: '180px' }} />
  }

  return null
}

// ── Remarks field (shared) ──────────────────────────────────────

function RemarksField({ d }: { d: Doc }) {
  const uid = useId()
  return (
    <div style={{ marginTop: '8px' }}>
      <label htmlFor={`${uid}-remarks`} style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
        {d.remarks}
      </label>
      <textarea
        id={`${uid}-remarks`}
        disabled
        placeholder={d.remarksPh}
        rows={1}
        style={{
          width: '100%', padding: '6px 10px', border: '1px solid var(--border)',
          borderRadius: '6px', fontSize: '13px', color: 'var(--text-muted)',
          background: 'var(--gray-50)', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      />
    </div>
  )
}

// ── Signature block ─────────────────────────────────────────────

function SignatureBlock({ role, label, d }: { role: string; label: string; d: Doc }) {
  return (
    <div style={{
      flex: '1 1 200px', border: '1px solid var(--border)', borderRadius: '10px',
      padding: '12px 16px', background: 'var(--card-bg)',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        {label} — {role}
      </div>
      <div style={{
        height: '60px', border: '1.5px dashed var(--gray-300)', borderRadius: '8px',
        background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '12px',
      }}>
        {d.digitalSig}
      </div>
      <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1, borderBottom: '1px solid var(--border)', paddingBottom: '2px', fontSize: '11px', color: 'var(--text-muted)' }}>{d.name}</div>
        <div style={{ flex: 1, borderBottom: '1px solid var(--border)', paddingBottom: '2px', fontSize: '11px', color: 'var(--text-muted)' }}>{d.date}</div>
      </div>
    </div>
  )
}

// ── Main preview component ──────────────────────────────────────

export default function TemplatePreview({ template }: { template: TemplateData }) {
  const t = useTranslations('TemplatePreview')
  const locale = useLocale()
  const [lang, setLang] = useState<Lang>(locale === 'en' ? 'en' : 'es')
  const d = DOC[lang]

  const disc = template.disciplines
  const phase = template.project_phases

  const sections = [...template.itr_template_sections]
    .sort((a, b) => a.order_index - b.order_index)
    .map(s => ({
      ...s,
      itr_template_items: [...s.itr_template_items].sort((a, b) => a.order_index - b.order_index),
    }))

  const totalItems = sections.reduce((n, s) => n + s.itr_template_items.length, 0)

  return (
    <div style={{ background: 'var(--gray-100)', minHeight: '100vh', paddingBottom: '60px' }}>

      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--card-bg)', borderBottom: '1px solid var(--border)',
        padding: '12px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: '16px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a
            href={`/admin/templates/${template.id}`}
            style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            ← {template.code}
          </a>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
            {t('title')}
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
            background: 'var(--violet-50)', color: 'var(--violet-700)', border: '1px solid var(--violet-200)',
          }}>
            {t('readOnly')}
          </span>
        </div>
        {/* Language toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          background: 'var(--gray-100)', borderRadius: '8px', padding: '3px',
        }}>
          {(['es', 'en'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              style={{
                padding: '4px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                border: 'none', cursor: 'pointer',
                background: lang === l ? 'var(--card-bg)' : 'transparent',
                color: lang === l ? 'var(--text-strong)' : 'var(--text-muted)',
                boxShadow: lang === l ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s',
                textTransform: 'uppercase',
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Document */}
      <div style={{ maxWidth: '800px', margin: '32px auto', padding: '0 20px' }}>

        {/* Header card */}
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          overflow: 'hidden', marginBottom: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          {/* Colored top stripe */}
          <div style={{
            height: '4px',
            background: disc ? `linear-gradient(90deg, ${disc.color}, ${alpha(disc.color, 53)})` : 'var(--primary-500)',
          }} />
          <div style={{ padding: '24px 28px' }}>
            {/* Meta row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
              {disc && (
                <span style={{
                  padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                  background: alpha(disc.color, 8), color: ink(disc.color),
                }}>
                  {disc.code} — {disc.name}
                </span>
              )}
              {phase && (
                <span style={{
                  padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  background: alpha(phase.color, 9), color: ink(phase.color),
                }}>
                  Fase {phase.code}
                </span>
              )}
              <span style={{
                padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                background: 'var(--gray-100)', color: 'var(--text-muted)',
              }}>
                v{template.version}
              </span>
            </div>

            {/* Title */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginBottom: '6px' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.5px' }}>
                {template.code}
              </span>
              <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-strong)' }}>
                {template.title}
              </span>
            </div>
            {template.description && (
              <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--text-muted)' }}>{template.description}</p>
            )}

            {/* Stats */}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {totalItems} ítem{totalItems !== 1 ? 's' : ''} · {sections.length} sección{sections.length !== 1 ? 'es' : ''}
            </div>

            {/* Field header table */}
            <div style={{
              marginTop: '20px', display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
            }}>
              {[
                { label: lang === 'es' ? 'Tag / Equipo' : 'Tag / Equipment', value: '' },
                { label: lang === 'es' ? 'Sistema' : 'System', value: '' },
                { label: lang === 'es' ? 'Ubicación' : 'Location', value: '' },
                { label: lang === 'es' ? 'Fecha de ejecución' : 'Execution date', value: '' },
                { label: lang === 'es' ? 'Inspector' : 'Inspector', value: '' },
                { label: lang === 'es' ? 'Supervisor' : 'Supervisor', value: '' },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {f.label}
                  </span>
                  <div style={{ borderBottom: '1.5px solid var(--border)', height: '24px' }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px',
          padding: '10px 16px', background: 'var(--card-bg)', borderRadius: '10px',
          border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--danger-700)', fontWeight: 700 }}>★</span>
            <span>{lang === 'es' ? 'Crítico — falla bloquea firma' : 'Critical — fail blocks signature'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--warning-700)', fontWeight: 700 }}>*</span>
            <span>{lang === 'es' ? 'Requerido' : 'Required'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--pink-500)', fontWeight: 700 }}>📷</span>
            <span>{lang === 'es' ? 'Requiere foto' : 'Photo required'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--cyan-700)', fontWeight: 700 }}>📄</span>
            <span>{lang === 'es' ? 'Requiere documento (PDF)' : 'Document required (PDF)'}</span>
          </div>
        </div>

        {/* Sections */}
        {sections.map((section, si) => (
          <div key={section.id} style={{ marginBottom: '20px' }}>
            {/* Section header */}
            <div style={{
              background: 'var(--gray-800)', color: '#fff',
              padding: '10px 20px', borderRadius: '10px 10px 0 0',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{
                fontSize: '11px', fontWeight: 700,
                background: 'rgba(255,255,255,0.15)', borderRadius: '4px',
                padding: '1px 7px', letterSpacing: '0.04em',
              }}>
                {String(si + 1).padStart(2, '0')}
              </span>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>{section.title}</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.6 }}>
                {section.itr_template_items.length} {lang === 'es' ? 'ítems' : 'items'}
              </span>
            </div>

            {/* Items */}
            <div style={{
              background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderTop: 'none', borderRadius: '0 0 10px 10px',
              overflow: 'hidden',
            }}>
              {section.itr_template_items.map((item, ii) => {
                // Schema convention: `description` is the primary text (English),
                // `description_es` is the Spanish translation. Fall back to the
                // primary when a translation isn't filled in yet.
                const visibleDesc = itemDescription(item, lang)

                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '14px 20px',
                      borderBottom: ii < section.itr_template_items.length - 1 ? '1px solid var(--gray-100)' : 'none',
                      background: item.is_critical ? 'var(--danger-50)' : 'var(--card-bg)',
                    }}
                  >
                    {/* Item header row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                      {/* Number */}
                      {item.item_number && (
                        <span style={{
                          fontFamily: 'ui-monospace, monospace', fontSize: '12px', fontWeight: 700,
                          color: 'var(--text-muted)', minWidth: '40px', paddingTop: '1px',
                        }}>
                          {item.item_number}
                        </span>
                      )}

                      {/* Description */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px', color: 'var(--text-strong)', lineHeight: 1.5 }}>
                            {visibleDesc}
                          </span>
                          {/* Flags */}
                          <span style={{ display: 'inline-flex', gap: '4px', flexShrink: 0 }}>
                            {item.is_critical && (
                              <span title={d.critical} style={{ color: 'var(--danger-700)', fontSize: '13px', fontWeight: 700 }}>★</span>
                            )}
                            {item.is_required && !item.is_critical && (
                              <span title={d.required} style={{ color: 'var(--warning-700)', fontSize: '13px', fontWeight: 700 }}>*</span>
                            )}
                            {item.requires_photo && (
                              <span title={d.photoReq} style={{ fontSize: '13px' }}>📷</span>
                            )}
                            {item.requires_document && (
                              <span title={d.docReq} style={{ fontSize: '13px' }}>📄</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Type badge */}
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 600,
                        background: 'var(--gray-100)', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {d.type[item.item_type]}
                      </span>
                    </div>

                    {/* Control */}
                    <div style={{ paddingLeft: item.item_number ? '50px' : '0' }}>
                      <ItemControl item={item} d={d} />
                      <RemarksField d={d} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Signature block */}
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '24px 28px', marginTop: '8px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-strong)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px' }}>
            {lang === 'es' ? 'Firmas de aprobación' : 'Approval signatures'}
          </h3>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <SignatureBlock role={lang === 'es' ? 'Ejecutor / Inspector' : 'Executor / Inspector'} label={lang === 'es' ? 'Firma' : 'Signature'} d={d} />
            <SignatureBlock role={lang === 'es' ? 'Supervisor / Líder' : 'Supervisor / Leader'} label={lang === 'es' ? 'Firma' : 'Signature'} d={d} />
            <SignatureBlock role={lang === 'es' ? 'Cliente' : 'Client'} label={lang === 'es' ? 'Firma' : 'Signature'} d={d} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
          CommUp · {template.code} · v{template.version} · {lang === 'es' ? 'Vista de campo — solo previsualización' : 'Field view — preview only'}
        </div>
      </div>
    </div>
  )
}