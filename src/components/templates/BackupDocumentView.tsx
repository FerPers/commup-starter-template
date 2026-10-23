'use client'

import { useEffect, useId } from 'react'
import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import { useMounted } from '@/hooks/useMounted'
import { DialogSurface } from '@/components/ui/dialog-a11y'
import type {
  TemplatesBackup,
  ItrTemplateBackup,
  PreservationProcedureBackup,
  PssrTemplateBackup,
} from '@/lib/constants/templates-backup'

interface Props {
  backup: TemplatesBackup
  onClose: () => void
}

export default function BackupDocumentView({ backup, onClose }: Props) {
  const t = useTranslations('BackupDocument')
  const mounted = useMounted()
  const titleId = useId()

  // Esc, foco y bloqueo del fondo: DialogSurface (G-12).
  useEffect(() => {
    // Browsers print the document <title> as the page header. Swap it
    // temporarily so the printed PDF doesn't say "CommUp — Completion ..."
    const prevTitle = document.title
    const orgName = backup.org?.name ?? t('org')
    document.title = `${t('docTitle')} — ${orgName}`

    return () => {
      document.title = prevTitle
    }
  }, [backup.org?.name, t])

  const totalItr = backup.itr_templates.length
  const totalPres = backup.preservation_procedures.length
  const totalPssr = backup.pssr_templates.length
  const exportedAt = backup.exported_at
    ? new Date(backup.exported_at).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })
    : '—'

  if (!mounted) return null

  const overlay = (
    <DialogSurface onClose={onClose} labelledBy={titleId}
      className="backup-doc-overlay"
      data-backup-doc-portal
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/*
        Print isolation: hide every direct child of <body> except this portal.
        `visibility:hidden` left the subtree taking layout space, which is why
        the printed PDF had 7 blank pages before the content (the underlying
        template detail kept pushing the overlay down). `display:none` removes
        them from the flow entirely. We only need to handle body's direct
        children because the overlay is mounted via createPortal at body root.
      */}
      <style>{`
        @media print {
          @page { margin: 12mm 10mm; }
          body > *:not([data-backup-doc-portal]) { display: none !important; }
          html, body { background: #fff !important; }
          .backup-doc-overlay {
            position: static !important;
            background: #fff !important;
            display: block !important;
          }
          .backup-doc-toolbar { display: none !important; }
          .backup-doc-scroll {
            overflow: visible !important;
            height: auto !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .backup-doc-paper {
            box-shadow: none !important;
            margin: 0 !important;
            max-width: 100% !important;
            padding: 0 !important;
          }
          .backup-doc-page-break { break-before: page; page-break-before: always; }
          .backup-doc-section { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {/* Toolbar */}
      <div
        className="backup-doc-toolbar"
        style={{
          padding: '12px 20px',
          background: '#0f172a',
          color: '#e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span id={titleId} style={{ fontSize: '13px', fontWeight: 600 }}>{t('view')}</span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
            {t('templates', { n: totalItr + totalPres + totalPssr })} · {backup.org?.name ?? '—'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => window.print()}
            style={{
              padding: '6px 14px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title={t('printHint')}
          >
            {t('print')}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {t('close')}
          </button>
        </div>
      </div>

      {/* Scrollable paper */}
      <div
        className="backup-doc-scroll"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '32px 16px',
          background: '#e2e8f0',
        }}
      >
        <div
          className="backup-doc-paper"
          style={{
            maxWidth: '900px',
            margin: '0 auto',
            background: '#fff',
            padding: '56px 64px',
            boxShadow: '0 4px 24px rgba(15, 23, 42, 0.18)',
            color: '#0f172a',
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            fontSize: '12px',
            lineHeight: 1.5,
          }}
        >
          {/* Header */}
          <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b', fontWeight: 700 }}>
                  CommUp · {t('docTitle')}
                </div>
                <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 0' }}>
                  {backup.org?.name ?? t('org')}
                </h1>
              </div>
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#64748b' }}>
                <div>{t('format', { v: backup.version })}</div>
                <div>{t('exported', { at: exportedAt })}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '20px', marginTop: '14px', fontSize: '11px' }}>
              <Stat label="ITR" value={totalItr} color="#3b82f6" />
              <Stat label={t('preservation')} value={totalPres} color="#10b981" />
              <Stat label="PSSR" value={totalPssr} color="#8b5cf6" />
            </div>
          </div>

          {/* ITR Templates */}
          {totalItr > 0 && (
            <ModuleHeader title={t('itrTemplates')} color="#3b82f6" count={totalItr} />
          )}
          {backup.itr_templates.map((t, i) => (
            <ItrCard key={`itr-${i}`} tpl={t} />
          ))}

          {/* Preservation */}
          {totalPres > 0 && (
            <>
              {totalItr > 0 && <div className="backup-doc-page-break" />}
              <ModuleHeader title={t('preservationProcedures')} color="#10b981" count={totalPres} />
            </>
          )}
          {backup.preservation_procedures.map((p, i) => (
            <PreservationCard key={`pres-${i}`} proc={p} />
          ))}

          {/* PSSR */}
          {totalPssr > 0 && (
            <>
              {(totalItr > 0 || totalPres > 0) && <div className="backup-doc-page-break" />}
              <ModuleHeader title={t('pssrTemplates')} color="#8b5cf6" count={totalPssr} />
            </>
          )}
          {backup.pssr_templates.map((t, i) => (
            <PssrCard key={`pssr-${i}`} tpl={t} />
          ))}

          {totalItr + totalPres + totalPssr === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              {t('empty')}
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: '40px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', fontSize: '10px', color: '#94a3b8', textAlign: 'center' }}>
            {t('footer', { format: backup.format, v: backup.version })}
          </div>
        </div>
      </div>
    </DialogSurface>
  )

  return createPortal(overlay, document.body)
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block' }} />
      <strong style={{ color: '#0f172a' }}>{value}</strong>
      <span style={{ color: '#64748b' }}>{label}</span>
    </div>
  )
}

function ModuleHeader({ title, color, count }: { title: string; color: string; count: number }) {
  return (
    <div
      className="backup-doc-section"
      style={{
        margin: '28px 0 14px',
        padding: '10px 14px',
        background: `${color}10`,
        borderLeft: `4px solid ${color}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <h2 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color }}>{title}</h2>
      <span style={{ fontSize: '11px', color: '#64748b' }}>{count} elemento{count === 1 ? '' : 's'}</span>
    </div>
  )
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '999px',
        background: `${color}18`,
        color,
        fontSize: '10px',
        fontWeight: 600,
        border: `1px solid ${color}40`,
      }}
    >
      {children}
    </span>
  )
}

function ItrCard({ tpl }: { tpl: ItrTemplateBackup }) {
  const t = useTranslations('BackupDocument')
  const totalItems = tpl.sections.reduce((a, s) => a + s.items.length, 0)
  return (
    <div className="backup-doc-section" style={{ marginBottom: '24px', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', fontWeight: 700, color: '#3b82f6' }}>
              {tpl.code}
            </span>
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>{tpl.title}</h3>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {tpl.discipline_code && <Tag color="#0ea5e9">{tpl.discipline_code}</Tag>}
            {tpl.phase_code && <Tag color="#f59e0b">Fase {tpl.phase_code}</Tag>}
            {tpl.is_global && <Tag color="#8b5cf6">GLOBAL</Tag>}
            {!tpl.is_active && <Tag color="#64748b">{t('inactive')}</Tag>}
          </div>
        </div>
        {tpl.description && (
          <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>{tpl.description}</p>
        )}
        <div style={{ marginTop: '8px', fontSize: '10px', color: '#64748b' }}>
          {t('sections', { n: tpl.sections.length })} · {t('items', { n: totalItems })} · v{tpl.version}
        </div>
      </div>

      {tpl.sections
        .slice()
        .sort((a, b) => a.order_index - b.order_index)
        .map((sec, si) => (
          <div key={si} style={{ borderTop: si === 0 ? 'none' : '1px solid #e2e8f0' }}>
            <div style={{ padding: '8px 16px', background: '#eff6ff', fontWeight: 600, fontSize: '12px', color: '#1e40af' }}>
              {sec.order_index + 1}. {sec.title}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>{t('col.description')}</th>
                  <th style={thStyle}>{t('col.type')}</th>
                  <th style={thStyle}>{t('col.acceptance')}</th>
                  <th style={thStyle}>{t('col.flags')}</th>
                </tr>
              </thead>
              <tbody>
                {sec.items
                  .slice()
                  .sort((a, b) => a.order_index - b.order_index)
                  .map((it, ii) => (
                    <tr key={ii} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}>
                        {it.item_number ?? `${sec.order_index + 1}.${it.order_index + 1}`}
                      </td>
                      <td style={tdStyle}>
                        {it.description}
                        {it.description_es && it.description_es !== it.description && (
                          <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
                            ES: {it.description_es}
                          </div>
                        )}
                        {it.condition_key && (
                          <div style={{ color: '#a16207', fontSize: '9.5px', marginTop: '2px' }}>
                            ⤷ Solo si [{it.condition_key}] = {it.condition_value ?? '—'}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{it.item_type}</span>
                        {it.unit && <div style={{ color: '#64748b', fontSize: '9.5px' }}>{t('unit', { unit: it.unit })}</div>}
                      </td>
                      <td style={tdStyle}>{formatAcceptance(it)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                          {it.is_required && <FlagBadge>R</FlagBadge>}
                          {it.is_critical && <FlagBadge color="#dc2626">!</FlagBadge>}
                          {it.requires_photo && <FlagBadge color="#6366f1">📷</FlagBadge>}
                          {it.requires_measurement && <FlagBadge color="#0ea5e9">M</FlagBadge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                {sec.items.length === 0 && (
                  <tr><td colSpan={5} style={{ ...tdStyle, color: '#94a3b8', fontStyle: 'italic' }}>{t('noItems')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  )
}

function PreservationCard({ proc }: { proc: PreservationProcedureBackup }) {
  const t = useTranslations('BackupDocument')
  return (
    <div className="backup-doc-section" style={{ marginBottom: '24px', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', fontWeight: 700, color: '#10b981' }}>
              {proc.code}
            </span>
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>{proc.title}</h3>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <Tag color="#10b981">{proc.frequency}</Tag>
            <Tag color="#64748b">{proc.interval_days}d</Tag>
            {proc.discipline_code && <Tag color="#0ea5e9">{proc.discipline_code}</Tag>}
            {proc.equipment_type_code && <Tag color="#a855f7">{proc.equipment_type_code}</Tag>}
            {proc.requires_photo && <Tag color="#6366f1">📷</Tag>}
            {proc.requires_signature && <Tag color="#0f172a">✍</Tag>}
          </div>
        </div>
        {proc.description && (
          <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>{proc.description}</p>
        )}
        <div style={{ marginTop: '8px', fontSize: '10px', color: '#64748b' }}>
          {t('inspectionItems', { n: proc.items.length })}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <th style={thStyle}>#</th>
            <th style={thStyle}>{t('col.label')}</th>
            <th style={thStyle}>{t('col.type')}</th>
            <th style={thStyle}>{t('col.acceptance')}</th>
            <th style={thStyle}>{t('col.flags')}</th>
          </tr>
        </thead>
        <tbody>
          {proc.items
            .slice()
            .sort((a, b) => a.order_index - b.order_index)
            .map((it, ii) => (
              <tr key={ii} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={tdStyle}>{it.order_index + 1}</td>
                <td style={tdStyle}>{it.label}</td>
                <td style={tdStyle}>
                  <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{it.item_type}</span>
                  {it.unit && <div style={{ color: '#64748b', fontSize: '9.5px' }}>{t('unit', { unit: it.unit })}</div>}
                </td>
                <td style={tdStyle}>
                  {it.min_value != null || it.max_value != null
                    ? `${it.min_value ?? '−∞'} ${it.unit ?? ''} – ${it.max_value ?? '+∞'} ${it.unit ?? ''}`
                    : '—'}
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                    {it.is_required && <FlagBadge>R</FlagBadge>}
                    {it.is_critical && <FlagBadge color="#dc2626">!</FlagBadge>}
                  </div>
                </td>
              </tr>
            ))}
          {proc.items.length === 0 && (
            <tr><td colSpan={5} style={{ ...tdStyle, color: '#94a3b8', fontStyle: 'italic' }}>{t('noItems')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function PssrCard({ tpl }: { tpl: PssrTemplateBackup }) {
  const t = useTranslations('BackupDocument')
  const byCategory = new Map<string, typeof tpl.items>()
  for (const it of tpl.items) {
    const arr = byCategory.get(it.category) ?? []
    arr.push(it)
    byCategory.set(it.category, arr)
  }
  const categories = Array.from(byCategory.entries())

  return (
    <div className="backup-doc-section" style={{ marginBottom: '24px', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: '#faf5ff', borderBottom: '1px solid #f3e8ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#8b5cf6' }}>{tpl.name}</h3>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {!tpl.is_active && <Tag color="#64748b">{t('inactive')}</Tag>}
            <Tag color="#8b5cf6">{t('items', { n: tpl.items.length })}</Tag>
          </div>
        </div>
        {tpl.description && (
          <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>{tpl.description}</p>
        )}
      </div>

      {categories.map(([cat, items], ci) => (
        <div key={cat} style={{ borderTop: ci === 0 ? 'none' : '1px solid #e2e8f0' }}>
          <div style={{ padding: '8px 16px', background: '#faf5ff', fontWeight: 600, fontSize: '12px', color: '#6d28d9' }}>
            {cat}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={thStyle}>#</th>
                <th style={thStyle}>{t('col.element')}</th>
                <th style={thStyle}>{t('col.requirement')}</th>
                <th style={thStyle}>{t('col.notes')}</th>
              </tr>
            </thead>
            <tbody>
              {items
                .slice()
                .sort((a, b) => a.item_order - b.item_order)
                .map((it, ii) => (
                  <tr key={ii} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={tdStyle}>
                      {it.item_order}
                      {it.is_required && <span style={{ marginLeft: '4px', color: '#dc2626' }}>*</span>}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{it.element}</td>
                    <td style={tdStyle}>{it.requirement}</td>
                    <td style={{ ...tdStyle, color: '#64748b' }}>{it.notes_hint ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
      {tpl.items.length === 0 && (
        <div style={{ padding: '12px 16px', color: '#94a3b8', fontStyle: 'italic', fontSize: '11px' }}>{t('noItems')}</div>
      )}
    </div>
  )
}

function FlagBadge({ children, color = '#0f172a' }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: '16px',
        padding: '1px 4px',
        borderRadius: '4px',
        background: `${color}15`,
        color,
        fontSize: '9.5px',
        fontWeight: 700,
        textAlign: 'center',
        lineHeight: 1.4,
      }}
    >
      {children}
    </span>
  )
}

function formatAcceptance(it: ItrTemplateBackup['sections'][number]['items'][number]): string {
  if (it.acceptance_text) return it.acceptance_text
  if (it.acceptance_min != null || it.acceptance_max != null) {
    const u = it.unit ?? ''
    return `${it.acceptance_min ?? '−∞'} ${u} – ${it.acceptance_max ?? '+∞'} ${u}`.trim()
  }
  if (it.options && Array.isArray(it.options) && it.options.length > 0) {
    return (it.options as unknown[]).map(String).join(' / ')
  }
  return '—'
}

const thStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: '10px',
  fontWeight: 600,
  color: '#475569',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid #e2e8f0',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  verticalAlign: 'top',
}
