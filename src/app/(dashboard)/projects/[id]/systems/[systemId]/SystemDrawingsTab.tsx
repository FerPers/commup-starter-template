import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

// P3 (maqueta «Planos» aprobada 2026-10-22): pestaña Planos de la ficha del sistema. Hojas P&ID que lo tocan en su
// revisión vigente (system_pid_sheets): tags del sistema en la hoja, cuántos con pin, estado de sus límites LOSH y
// el enlace al visor con el sistema aislado y encuadrado (`?system=`); planos citados sin documento cargado; y los
// tags sin pin con un atajo para ubicarlos (`?place=`). El PDF de límites por sistema llega en P4.

export type PidSheet = {
  document_id: string; number: string; title: string | null; revision_id: string; rev: string; rev_status: string
  tags: number; cited: number; pinned: number; markups: number; markups_review: number; markup_pages: number
}
export type SystemPidSheets = {
  tags_total: number
  tags_pinned: number
  sheets: PidSheet[]
  missing: { number: string; tags: number }[]
  unpinned_total: number
  unpinned: { tag_id: string; tag_number: string; drawing: string | null; document_id: string | null }[]
}

const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
const kpiLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }
const kpiValue: React.CSSProperties = { fontSize: 26, fontWeight: 700, color: 'var(--text-strong)' }
const th: React.CSSProperties = { padding: '10px 8px', fontWeight: 600, textAlign: 'left' }
const td: React.CSSProperties = { padding: '12px 8px', verticalAlign: 'middle' }
/** Planos citados sin documento que se listan (el resto, en una línea). */
const MISSING_ROWS = 6

function Bar({ pct }: { pct: number }) {
  return (
    <div style={{ flex: 1, minWidth: 60, height: 8, borderRadius: 4, background: 'var(--gray-100)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: 'var(--primary-600)' }} />
    </div>
  )
}

export default async function SystemDrawingsTab({ projectId, systemId, data, canEdit }: {
  projectId: string
  systemId: string
  data: SystemPidSheets
  canEdit: boolean
}) {
  const t = await getTranslations('Systems.drawings')
  const td2 = await getTranslations('Documents')
  const viewer = (docId: string, extra = '') => `/projects/${projectId}/documents/${docId}/viewer?system=${systemId}${extra}`
  const drawn = data.sheets.filter(s => s.markups > 0).length
  const review = data.sheets.reduce((n, s) => n + s.markups_review, 0)
  const pinPct = data.tags_total ? Math.round((data.tags_pinned * 100) / data.tags_total) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={card}>
          <div style={kpiLabel}>{t('kpi.sheets')}</div>
          <div style={kpiValue}>{data.sheets.length}</div>
          {data.missing.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('kpi.missing', { count: data.missing.length })}</div>}
        </div>
        <div style={card}>
          <div style={kpiLabel}>{t('kpi.pinned')}</div>
          <div style={kpiValue}>{t('kpi.of', { a: data.tags_pinned, b: data.tags_total })}</div>
          <div style={{ marginTop: 6, display: 'flex' }}><Bar pct={pinPct} /></div>
        </div>
        <div style={card}>
          <div style={kpiLabel}>{t('kpi.limits')}</div>
          <div style={kpiValue}>{t('kpi.ofSheets', { a: drawn, b: data.sheets.length })}</div>
          {review > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning-800)' }}>{t('kpi.review', { count: review })}</div>}
        </div>
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={kpiLabel}>{t('kpi.deliverable')}</div>
          <button type="button" disabled style={{ minHeight: 40, border: '1px dashed var(--gray-400)', borderRadius: 8, background: 'var(--gray-50)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
            {t('kpi.pdfLater')}
          </button>
        </div>
      </div>

      <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {data.sheets.length === 0 && data.missing.length === 0 ? (
          <p style={{ margin: 0, padding: '20px 18px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('empty')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  <th style={{ ...th, paddingLeft: 18 }}>{t('col.sheet')}</th>
                  <th style={th}>{t('col.rev')}</th>
                  <th style={th}>{t('col.tags')}</th>
                  <th style={{ ...th, width: 200 }}>{t('col.pinned')}</th>
                  <th style={th}>{t('col.limits')}</th>
                  <th style={{ ...th, paddingRight: 18 }}><span className="sr-only" style={{ position: 'absolute', left: -9999 }}>{t('col.open')}</span></th>
                </tr>
              </thead>
              <tbody>
                {data.sheets.map(s => {
                  const pct = s.tags ? Math.round((s.pinned * 100) / s.tags) : 0
                  const chip = s.markups === 0
                    ? { text: t('limits.none'), style: { border: '1.5px dashed var(--gray-400)', color: 'var(--text-muted)' } }
                    : s.markups_review > 0
                      ? { text: t('limits.review', { count: s.markups_review }), style: { background: 'var(--warning-50)', color: 'var(--warning-800)', border: '1px solid var(--warning-200)' } }
                      : { text: t('limits.drawn', { count: s.markups }), style: { background: 'var(--success-50)', color: 'var(--success-800)', border: '1px solid var(--success-200)' } }
                  return (
                    <tr key={s.document_id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...td, paddingLeft: 18 }}>
                        <strong style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text-strong)' }}>{s.number}</strong>
                        {s.title && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.title}</div>}
                      </td>
                      <td style={td}>{t('revLabel', { rev: s.rev })}{s.rev_status ? ` · ${td2(`status.${s.rev_status as 'ifc'}`)}` : ''}</td>
                      <td style={td}>{s.tags}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Bar pct={pct} /><span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{s.pinned} · {pct} %</span>
                        </div>
                      </td>
                      <td style={td}><span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', ...chip.style }}>{chip.text}</span></td>
                      <td style={{ ...td, paddingRight: 18, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link href={viewer(s.document_id)} style={{ fontWeight: 600, color: 'var(--primary-600)', textDecoration: 'none' }}>
                          {s.markups === 0 && canEdit ? t('drawLimits') : t('openOnSheet')} ›
                        </Link>
                      </td>
                    </tr>
                  )
                })}
                {data.missing.slice(0, MISSING_ROWS).map(m => (
                  <tr key={m.number} style={{ borderTop: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                    <td style={{ ...td, paddingLeft: 18 }}>
                      <strong style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text-strong)' }}>{m.number}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('missingRow', { count: m.tags })}</div>
                    </td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>—</td>
                    <td style={td}>{m.tags}</td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>—</td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>—</td>
                    <td style={{ ...td, paddingRight: 18, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link href={`/projects/${projectId}/documents?type=pid`} style={{ fontWeight: 600, color: 'var(--primary-600)', textDecoration: 'none' }}>{t('loadDocument')} ›</Link>
                    </td>
                  </tr>
                ))}
                {data.missing.length > MISSING_ROWS && (
                  <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                    <td colSpan={6} style={{ ...td, paddingLeft: 18, fontSize: 13, color: 'var(--text-muted)' }}>
                      {t('missingMore', { count: data.missing.length - MISSING_ROWS, list: data.missing.slice(MISSING_ROWS).map(m => m.number).join(', ') })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.unpinned_total > 0 && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 16, color: 'var(--text-strong)' }}>{t('unpinned', { count: data.unpinned_total })}</h2>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('unpinnedHint')}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.unpinned.map(u => {
              const text = u.document_id ? t('placeOn', { drawing: u.drawing ?? '' }) : u.drawing ? t('noDocument', { drawing: u.drawing }) : t('noDrawing')
              const href = u.document_id && canEdit ? viewer(u.document_id, `&place=${u.tag_id}`) : `/projects/${projectId}/tags/${u.tag_id}`
              return (
                <Link key={u.tag_id} href={href} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, textDecoration: 'none', color: 'var(--text-strong)' }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{u.tag_number}</span> · <span style={{ color: 'var(--text-muted)' }}>{text}</span>
                </Link>
              )
            })}
            {data.unpinned_total > data.unpinned.length && (
              <span style={{ padding: '6px 4px', fontSize: 13, color: 'var(--text-muted)' }}>{t('more', { count: data.unpinned_total - data.unpinned.length })}</span>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
