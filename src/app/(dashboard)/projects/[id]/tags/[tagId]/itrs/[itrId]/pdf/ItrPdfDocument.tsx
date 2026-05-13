import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'

// Prevent react-pdf from inserting soft-hyphens into long unbreakable strings
// (e.g. email addresses like luis.perdomo@outlook.com → "out-/look.com").
Font.registerHyphenationCallback(word => [word])

// ── Types ──────────────────────────────────────────────────────────────────

type ItrItem = {
  id: string
  item_number: string | null
  description: string
  item_type: string
  is_critical: boolean
  acceptance_min: number | null
  acceptance_max: number | null
  acceptance_text: string | null
  unit: string | null
  order_index: number
}

type ItrSection = {
  id: string
  title: string
  order_index: number
  itr_template_items: ItrItem[]
}

type ItrResponse = {
  item_id: string
  value_text: string | null
  value_numeric: number | null
  value_bool: boolean | null
  value_option: string | null
  remarks: string | null
  is_passed: boolean | null
}

type ItrSignature = {
  role: string
  signed_at: string
  profiles: { full_name: string } | null
}

export type ItrPdfData = {
  itr_number: string
  status: string
  progress_pct: number
  scheduled_date: string | null
  itr_templates: {
    code: string
    title: string
    description: string | null
    itr_template_sections: ItrSection[]
  } | null
  tags: { tag_number: string; description: string } | null
  projects: { code: string; name: string } | null
  itr_responses: ItrResponse[]
  itr_signatures: ItrSignature[]
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1e293b',
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
  },
  // Header
  header: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: '1.5pt solid #0f172a',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  appName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#7c3aed',
    letterSpacing: 1,
  },
  itrNumber: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    gap: 4,
  },
  metaLabel: {
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
  },
  metaValue: {
    color: '#1e293b',
  },
  // Progress bar
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  progressBarOuter: {
    flex: 1,
    height: 5,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
  },
  progressBarInner: {
    height: 5,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 8,
    color: '#64748b',
    width: 28,
    textAlign: 'right',
  },
  // Section
  sectionHeader: {
    backgroundColor: '#f8fafc',
    borderLeft: '3pt solid #7c3aed',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 14,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  // Item row
  itemRow: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #e2e8f0',
    paddingVertical: 4,
    paddingHorizontal: 6,
    minHeight: 18,
  },
  itemRowFail: {
    backgroundColor: '#fff5f5',
  },
  itemNum: {
    width: 28,
    fontSize: 8,
    color: '#94a3b8',
    fontFamily: 'Helvetica-Oblique',
  },
  itemDesc: {
    flex: 1,
    fontSize: 8.5,
    color: '#1e293b',
    paddingRight: 8,
  },
  itemCriticalDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ef4444',
    marginTop: 2,
    marginRight: 4,
  },
  responseCell: {
    width: 80,
    fontSize: 8.5,
    textAlign: 'center',
  },
  responsePass: {
    color: '#16a34a',
    fontFamily: 'Helvetica-Bold',
  },
  responseFail: {
    color: '#dc2626',
    fontFamily: 'Helvetica-Bold',
  },
  responseNeutral: {
    color: '#64748b',
  },
  remarksText: {
    fontSize: 7.5,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 1,
  },
  // Signatures
  signaturesSection: {
    marginTop: 20,
    paddingTop: 10,
    borderTop: '1pt solid #e2e8f0',
  },
  signaturesTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: '#374151',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  signaturesGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  sigBox: {
    flex: 1,
    border: '0.75pt solid #e2e8f0',
    borderRadius: 4,
    padding: 8,
    minHeight: 56,
  },
  sigBoxSigned: {
    borderColor: '#a7f3d0',
    backgroundColor: '#f0fdf4',
  },
  sigRole: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  sigName: {
    fontSize: 9,
    color: '#0f172a',
    marginBottom: 2,
  },
  sigDate: {
    fontSize: 7.5,
    color: '#94a3b8',
  },
  sigEmpty: {
    fontSize: 8,
    color: '#cbd5e1',
    fontStyle: 'italic',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '0.5pt solid #e2e8f0',
    paddingTop: 5,
  },
  footerText: {
    fontSize: 7,
    color: '#94a3b8',
  },
})

// ── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  const map: Record<string, string> = {
    approved: '#7c3aed',
    completed: '#16a34a',
    in_progress: '#2563eb',
    rejected: '#dc2626',
    not_started: '#64748b',
  }
  return map[status] ?? '#64748b'
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    approved: 'APPROVED',
    completed: 'COMPLETED',
    in_progress: 'IN PROGRESS',
    rejected: 'REJECTED',
    not_started: 'NOT STARTED',
  }
  return map[status] ?? status.toUpperCase()
}

function formatResponse(item: ItrItem, response: ItrResponse | undefined): string {
  if (!response) return '—'
  if (item.item_type === 'checkbox' || item.item_type === 'yes_no') {
    return response.value_bool === true ? '✓ Yes' : response.value_bool === false ? '✗ No' : '—'
  }
  if (item.item_type === 'measurement' || item.item_type === 'number') {
    const val = response.value_numeric
    if (val === null) return '—'
    return `${val}${item.unit ? ` ${item.unit}` : ''}`
  }
  if (item.item_type === 'select') return response.value_option ?? '—'
  if (item.item_type === 'text') return response.value_text?.slice(0, 40) ?? '—'
  if (item.item_type === 'photo') return response.value_text ? '📷 Photo' : '—'
  if (item.item_type === 'signature') return response.value_text ? '✍ Signed' : '—'
  if (item.item_type === 'date') return response.value_text ?? '—'
  return '—'
}

// ── Main Document ────────────────────────────────────────────────────────────

export function ItrPdfDocument({ itr }: { itr: ItrPdfData }) {
  const responseMap = Object.fromEntries(
    itr.itr_responses.map(r => [r.item_id, r])
  )

  const sections = (itr.itr_templates?.itr_template_sections ?? [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index)

  const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
  const progressPct = itr.progress_pct ?? 0
  const color = statusColor(itr.status)

  return (
    <Document
      title={`ITR ${itr.itr_number}`}
      author="CommUp"
      subject="Inspection & Test Record"
    >
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <View>
              <Text style={s.appName}>CommUp</Text>
              <Text style={{ fontSize: 8, color: '#64748b', marginTop: 1 }}>
                Inspection & Test Record
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.itrNumber}>{itr.itr_number}</Text>
              <View style={{ ...s.statusBadge, backgroundColor: `${color}18` }}>
                <Text style={{ color, fontFamily: 'Helvetica-Bold', fontSize: 8 }}>
                  {statusLabel(itr.status)}
                </Text>
              </View>
            </View>
          </View>

          <View style={s.metaRow}>
            {itr.projects && (
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>Project:</Text>
                <Text style={s.metaValue}>{itr.projects.code} — {itr.projects.name}</Text>
              </View>
            )}
            {itr.tags && (
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>Tag:</Text>
                <Text style={s.metaValue}>{itr.tags.tag_number} — {itr.tags.description}</Text>
              </View>
            )}
            {itr.scheduled_date && (
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>Date:</Text>
                <Text style={s.metaValue}>{itr.scheduled_date}</Text>
              </View>
            )}
            {itr.itr_templates && (
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>Template:</Text>
                <Text style={s.metaValue}>{itr.itr_templates.code} — {itr.itr_templates.title}</Text>
              </View>
            )}
          </View>

          <View style={s.progressRow}>
            <Text style={{ fontSize: 8, color: '#64748b', width: 52 }}>Progress:</Text>
            <View style={s.progressBarOuter}>
              <View style={{
                ...s.progressBarInner,
                width: `${progressPct}%`,
                backgroundColor: progressPct >= 100 ? '#16a34a' : '#3b82f6',
              }} />
            </View>
            <Text style={s.progressLabel}>{progressPct}%</Text>
          </View>
        </View>

        {/* ── Column headers ── */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 3, backgroundColor: '#f1f5f9', borderRadius: 3 }}>
          <Text style={{ width: 28, fontSize: 7.5, color: '#64748b', fontFamily: 'Helvetica-Bold' }}>#</Text>
          <Text style={{ flex: 1, fontSize: 7.5, color: '#64748b', fontFamily: 'Helvetica-Bold' }}>Description</Text>
          <Text style={{ width: 80, fontSize: 7.5, color: '#64748b', fontFamily: 'Helvetica-Bold', textAlign: 'center' }}>Response</Text>
          <Text style={{ width: 32, fontSize: 7.5, color: '#64748b', fontFamily: 'Helvetica-Bold', textAlign: 'center' }}>Result</Text>
        </View>

        {/* ── Sections & Items ── */}
        {sections.map(section => {
          const items = (section.itr_template_items ?? [])
            .slice()
            .sort((a, b) => a.order_index - b.order_index)

          return (
            <View key={section.id} wrap={false}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>{section.title}</Text>
              </View>

              {items.map(item => {
                const resp = responseMap[item.id]
                const isPassed = resp?.is_passed
                const responseText = formatResponse(item, resp)

                return (
                  <View
                    key={item.id}
                    style={[s.itemRow, isPassed === false ? s.itemRowFail : {}]}
                  >
                    <Text style={s.itemNum}>
                      {item.item_number ?? ''}
                    </Text>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        {item.is_critical && (
                          <View style={s.itemCriticalDot} />
                        )}
                        <Text style={s.itemDesc}>{item.description}</Text>
                      </View>
                      {(item.acceptance_min !== null || item.acceptance_max !== null || item.acceptance_text) && (
                        <Text style={{ fontSize: 7, color: '#94a3b8', marginTop: 1 }}>
                          {item.acceptance_text
                            ? `Criterion: ${item.acceptance_text}`
                            : `Range: ${item.acceptance_min ?? '—'} – ${item.acceptance_max ?? '—'}${item.unit ? ` ${item.unit}` : ''}`}
                        </Text>
                      )}
                      {resp?.remarks && (
                        <Text style={s.remarksText}>Remarks: {resp.remarks}</Text>
                      )}
                    </View>
                    <Text style={[s.responseCell, isPassed === false ? s.responseFail : isPassed === true ? s.responsePass : s.responseNeutral]}>
                      {responseText}
                    </Text>
                    <Text style={{ width: 32, fontSize: 8.5, textAlign: 'center',
                      color: isPassed === true ? '#16a34a' : isPassed === false ? '#dc2626' : '#94a3b8',
                      fontFamily: isPassed !== null ? 'Helvetica-Bold' : 'Helvetica',
                    }}>
                      {isPassed === true ? 'PASS' : isPassed === false ? 'FAIL' : ''}
                    </Text>
                  </View>
                )
              })}
            </View>
          )
        })}

        {/* ── Signatures ── */}
        <View style={s.signaturesSection}>
          <Text style={s.signaturesTitle}>Signatures</Text>
          <View style={s.signaturesGrid}>
            {(['executor', 'supervisor', 'client'] as const).map(role => {
              const sig = itr.itr_signatures.find(s => s.role === role)
              const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
              return (
                <View key={role} style={[s.sigBox, sig ? s.sigBoxSigned : {}]}>
                  <Text style={s.sigRole}>{roleLabel}</Text>
                  {sig ? (
                    <>
                      <Text style={s.sigName}>{sig.profiles?.full_name ?? '—'}</Text>
                      <Text style={s.sigDate}>{sig.signed_at.slice(0, 10)}</Text>
                    </>
                  ) : (
                    <Text style={s.sigEmpty}>Pending signature</Text>
                  )}
                </View>
              )
            })}
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>CommUp — Inspection & Test Record · {itr.itr_number}</Text>
          <Text style={s.footerText}>Generated: {generatedAt}</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  )
}
