'use client'

import type { Json } from '@/types/supabase.generated'
import { useState } from 'react'

type ItrItemType = 'checkbox' | 'text' | 'number' | 'measurement' | 'select' | 'photo' | 'signature' | 'date' | 'yes_no'

interface PreviewItem {
  id: string
  item_number: string | null
  description: string
  description_es: string | null
  item_type: ItrItemType
  is_required: boolean
  is_critical: boolean
  requires_photo: boolean
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

// ── Item type labels ────────────────────────────────────────────
const TYPE_LABEL: Record<ItrItemType, string> = {
  checkbox:    'Verificación',
  yes_no:      'Sí / No',
  number:      'Número',
  measurement: 'Medición',
  text:        'Texto',
  select:      'Selección',
  photo:       'Foto',
  signature:   'Firma',
  date:        'Fecha',
}

// ── Mock controls per item type ─────────────────────────────────

function ItemControl({ item }: { item: PreviewItem }) {
  const inputBase: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '14px', color: 'var(--text-strong)', background: 'var(--card-bg)',
    boxSizing: 'border-box', fontFamily: 'inherit',
  }

  if (item.item_type === 'checkbox') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input type="checkbox" disabled style={{ width: 18, height: 18, accentColor: '#3b82f6', cursor: 'not-allowed' }} />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Marcar como verificado</span>
      </div>
    )
  }

  if (item.item_type === 'yes_no') {
    return (
      <div style={{ display: 'flex', gap: '8px' }}>
        {['Sí', 'No', 'N/A'].map(opt => (
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
          <input type="number" disabled placeholder="Valor medido" style={{ ...inputBase, width: '160px' }} />
          {item.unit && <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>{item.unit}</span>}
          <span style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '6px', background: 'var(--gray-50)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            Resultado: —
          </span>
        </div>
        {(item.acceptance_min !== null || item.acceptance_max !== null) && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Criterio de aceptación:{' '}
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
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Criterio: <strong>{item.acceptance_text}</strong></div>
        )}
      </div>
    )
  }

  if (item.item_type === 'text') {
    return <textarea disabled placeholder="Ingrese observación..." rows={2} style={{ ...inputBase, resize: 'vertical' }} />
  }

  if (item.item_type === 'select') {
    const opts = Array.isArray(item.options) ? item.options.filter((o): o is string => typeof o === 'string') : []
    return (
      <select disabled style={{ ...inputBase, width: 'auto', minWidth: '200px' }}>
        <option value="">— Seleccionar —</option>
        {opts.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  if (item.item_type === 'photo') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px', border: '1.5px dashed #cbd5e1', borderRadius: '10px',
        background: 'var(--gray-50)', color: 'var(--text-muted)', fontSize: '13px',
      }}>
        <span style={{ fontSize: '22px' }}>📷</span>
        <span>Tomar / adjuntar foto</span>
      </div>
    )
  }

  if (item.item_type === 'signature') {
    return (
      <div style={{
        height: '80px', border: '1.5px dashed #cbd5e1', borderRadius: '10px',
        background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--gray-400)', fontSize: '13px', gap: '8px',
      }}>
        <span style={{ fontSize: '20px' }}>✍️</span>
        <span>Área de firma</span>
      </div>
    )
  }

  if (item.item_type === 'date') {
    return <input type="date" disabled style={{ ...inputBase, width: '180px' }} />
  }

  return null
}

// ── Remarks field (shared) ──────────────────────────────────────

function RemarksField() {
  return (
    <div style={{ marginTop: '8px' }}>
      <label style={{ fontSize: '11px', color: 'var(--gray-400)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>
        Observaciones / Remarks
      </label>
      <textarea
        disabled
        placeholder="Observaciones opcionales..."
        rows={1}
        style={{
          width: '100%', padding: '6px 10px', border: '1px solid var(--border)',
          borderRadius: '6px', fontSize: '13px', color: 'var(--gray-400)',
          background: 'var(--gray-50)', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      />
    </div>
  )
}

// ── Signature block ─────────────────────────────────────────────

function SignatureBlock({ role, label }: { role: string; label: string }) {
  return (
    <div style={{
      flex: '1 1 200px', border: '1px solid var(--border)', borderRadius: '10px',
      padding: '12px 16px', background: 'var(--card-bg)',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
        {label} — {role}
      </div>
      <div style={{
        height: '60px', border: '1.5px dashed #cbd5e1', borderRadius: '8px',
        background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--gray-400)', fontSize: '12px',
      }}>
        Firma digital
      </div>
      <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1, borderBottom: '1px solid var(--border)', paddingBottom: '2px', fontSize: '11px', color: 'var(--gray-400)' }}>Nombre</div>
        <div style={{ flex: 1, borderBottom: '1px solid var(--border)', paddingBottom: '2px', fontSize: '11px', color: 'var(--gray-400)' }}>Fecha</div>
      </div>
    </div>
  )
}

// ── Main preview component ──────────────────────────────────────

export default function TemplatePreview({ template }: { template: TemplateData }) {
  const [lang, setLang] = useState<'es' | 'en'>('es')

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
    <div style={{ background: '#f0f4f8', minHeight: '100vh', paddingBottom: '60px' }}>

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
            Vista de campo — Preview
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
            background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe',
          }}>
            Solo vista
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
            background: disc ? `linear-gradient(90deg, ${disc.color}, ${disc.color}88)` : '#3b82f6',
          }} />
          <div style={{ padding: '24px 28px' }}>
            {/* Meta row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
              {disc && (
                <span style={{
                  padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                  background: `${disc.color}15`, color: disc.color,
                }}>
                  {disc.code} — {disc.name}
                </span>
              )}
              {phase && (
                <span style={{
                  padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  background: `${phase.color}18`, color: phase.color,
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
              <span style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>
                {template.title}
              </span>
            </div>
            {template.description && (
              <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--text-muted)' }}>{template.description}</p>
            )}

            {/* Stats */}
            <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
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
                  <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
            <span style={{ color: '#ef4444', fontWeight: 700 }}>★</span>
            <span>{lang === 'es' ? 'Crítico — falla bloquea firma' : 'Critical — fail blocks signature'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>*</span>
            <span>{lang === 'es' ? 'Requerido' : 'Required'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#ec4899', fontWeight: 700 }}>📷</span>
            <span>{lang === 'es' ? 'Requiere foto' : 'Photo required'}</span>
          </div>
        </div>

        {/* Sections */}
        {sections.map((section, si) => (
          <div key={section.id} style={{ marginBottom: '20px' }}>
            {/* Section header */}
            <div style={{
              background: '#1e293b', color: '#fff',
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
                const visibleDesc = lang === 'es'
                  ? (item.description_es?.trim() ?? item.description)
                  : item.description

                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '14px 20px',
                      borderBottom: ii < section.itr_template_items.length - 1 ? '1px solid #f1f5f9' : 'none',
                      background: item.is_critical ? '#fff8f8' : 'var(--card-bg)',
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
                              <span title="Crítico" style={{ color: '#ef4444', fontSize: '13px', fontWeight: 700 }}>★</span>
                            )}
                            {item.is_required && !item.is_critical && (
                              <span title="Requerido" style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 700 }}>*</span>
                            )}
                            {item.requires_photo && (
                              <span title="Requiere foto" style={{ fontSize: '13px' }}>📷</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Type badge */}
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 600,
                        background: 'var(--gray-100)', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {TYPE_LABEL[item.item_type]}
                      </span>
                    </div>

                    {/* Control */}
                    <div style={{ paddingLeft: item.item_number ? '50px' : '0' }}>
                      <ItemControl item={item} />
                      <RemarksField />
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
            <SignatureBlock role={lang === 'es' ? 'Ejecutor / Inspector' : 'Executor / Inspector'} label={lang === 'es' ? 'Firma' : 'Signature'} />
            <SignatureBlock role={lang === 'es' ? 'Supervisor / Líder' : 'Supervisor / Leader'} label={lang === 'es' ? 'Firma' : 'Signature'} />
            <SignatureBlock role={lang === 'es' ? 'Cliente' : 'Client'} label={lang === 'es' ? 'Firma' : 'Signature'} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: 'var(--gray-400)' }}>
          CommUp · {template.code} · v{template.version} · {lang === 'es' ? 'Vista de campo — solo previsualización' : 'Field view — preview only'}
        </div>
      </div>
    </div>
  )
}