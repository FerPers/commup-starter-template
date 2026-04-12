import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'

// ── Types ──────────────────────────────────────────────────────────────────

type ExceptionRow = {
  id: string
  justification: string
  approved_at: string
  punches: {
    punch_number: string
    description: string
    category: string
  } | null
  approved_by_profile: { full_name: string } | null
}

type ItrRow = {
  id: string
  itr_number: string
  status: string
  progress_pct: number
  itr_templates: { code: string; title: string } | null
  tags: { tag_number: string; description: string } | null
}

export type CertPdfData = {
  id: string
  certificate_number: string
  title: string
  status: string
  issued_date: string | null
  notes: string | null
  created_at: string
  project_phases: {
    code: string
    name: string
    color: string
    certificate_name: string | null
  } | null
  subsystems: {
    code: string
    name: string
    systems: { code: string; name: string } | null
  } | null
  issued_by_profile: { full_name: string } | null
  projectName: string
  projectCode: string
  projectClient: string | null
  exceptions: ExceptionRow[]
  itrs: ItrRow[]
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
  // Decorative top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: '#7c3aed',
  },
  // Header
  header: {
    alignItems: 'center',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottom: '1.5pt solid #0f172a',
  },
  appName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#7c3aed',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  certTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 2,
  },
  certNumber: {
    fontSize: 11,
    fontFamily: 'Helvetica-Oblique',
    color: '#475569',
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 4,
  },
  // Info grid
  infoGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  infoCard: {
    flex: 1,
    border: '0.75pt solid #e2e8f0',
    borderRadius: 5,
    padding: 10,
    backgroundColor: '#f8fafc',
  },
  infoCardLabel: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  infoCardValue: {
    fontSize: 9,
    color: '#0f172a',
  },
  // Section header
  sectionHeader: {
    backgroundColor: '#f1f5f9',
    borderLeft: '3pt solid #7c3aed',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 14,
    marginBottom: 6,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // ITR table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottom: '0.75pt solid #e2e8f0',
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottom: '0.5pt solid #f1f5f9',
  },
  tableHeaderCell: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#64748b',
  },
  tableCell: {
    fontSize: 8.5,
    color: '#1e293b',
  },
  // Exception block
  exceptionBlock: {
    border: '0.75pt solid #fde68a',
    borderRadius: 5,
    padding: 9,
    marginBottom: 6,
    backgroundColor: '#fffbeb',
  },
  exceptionPunchNum: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    color: '#d97706',
    marginBottom: 2,
  },
  exceptionDesc: {
    fontSize: 8.5,
    color: '#1e293b',
    marginBottom: 3,
  },
  exceptionJustif: {
    fontSize: 7.5,
    color: '#64748b',
    fontStyle: 'italic',
    marginBottom: 2,
  },
  exceptionMeta: {
    fontSize: 7,
    color: '#94a3b8',
  },
  // Notes
  notesBox: {
    border: '0.75pt solid #e2e8f0',
    borderRadius: 5,
    padding: 10,
    marginTop: 10,
    backgroundColor: '#f8fafc',
  },
  notesText: {
    fontSize: 8.5,
    color: '#374151',
    lineHeight: 1.5,
  },
  // Signatures
  signaturesSection: {
    marginTop: 20,
    paddingTop: 12,
    borderTop: '1pt solid #e2e8f0',
  },
  signaturesTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: '#374151',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  signaturesGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  sigBox: {
    flex: 1,
    borderTop: '2pt solid #7c3aed',
    paddingTop: 8,
    minHeight: 50,
  },
  sigRole: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  sigName: {
    fontSize: 10,
    color: '#0f172a',
    marginBottom: 2,
  },
  sigDate: {
    fontSize: 7.5,
    color: '#94a3b8',
  },
  sigEmpty: {
    height: 28,
    borderBottom: '0.75pt solid #cbd5e1',
    marginBottom: 4,
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

function certStatusColor(status: string): string {
  const map: Record<string, string> = {
    issued:    '#16a34a',
    in_review: '#d97706',
    pending:   '#64748b',
    rejected:  '#dc2626',
    revoked:   '#7c3aed',
  }
  return map[status] ?? '#64748b'
}

function certStatusLabel(status: string): string {
  const map: Record<string, string> = {
    issued:    'ISSUED',
    in_review: 'IN REVIEW',
    pending:   'PENDING',
    rejected:  'REJECTED',
    revoked:   'REVOKED',
  }
  return map[status] ?? status.toUpperCase()
}

function itrStatusLabel(status: string): string {
  const map: Record<string, string> = {
    approved:    'APPROVED',
    completed:   'COMPLETED',
    in_progress: 'IN PROGRESS',
    not_started: 'NOT STARTED',
    rejected:    'REJECTED',
  }
  return map[status] ?? status.toUpperCase()
}

// ── Main Document ────────────────────────────────────────────────────────────

export function CertPdfDocument({ cert }: { cert: CertPdfData }) {
  const certColor = certStatusColor(cert.status)
  const generatedAt = new Date().toISOString().slice(0, 10)
  const approvedItrs = cert.itrs.filter(i => i.status === 'approved')

  return (
    <Document
      title={`Certificate ${cert.certificate_number}`}
      author="CommUp"
      subject="Completion Certificate"
    >
      <Page size="A4" style={s.page}>

        {/* Top color bar */}
        <View style={s.topBar} fixed />

        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.appName}>CommUp</Text>
          <Text style={s.certTitle}>
            {cert.project_phases?.certificate_name ?? 'Completion Certificate'}
          </Text>
          <Text style={s.certNumber}>{cert.certificate_number}</Text>
          <Text style={s.certTitle}>{cert.title}</Text>
          <View style={{ ...s.statusBadge, backgroundColor: `${certColor}20` }}>
            <Text style={{ color: certColor, fontFamily: 'Helvetica-Bold', fontSize: 9 }}>
              {certStatusLabel(cert.status)}
              {cert.issued_date ? ` · ${cert.issued_date}` : ''}
            </Text>
          </View>
        </View>

        {/* ── Info Grid ── */}
        <View style={s.infoGrid}>
          <View style={s.infoCard}>
            <Text style={s.infoCardLabel}>Project</Text>
            <Text style={s.infoCardValue}>{cert.projectCode} — {cert.projectName}</Text>
            {cert.projectClient && (
              <Text style={{ ...s.infoCardValue, color: '#64748b', fontSize: 8, marginTop: 2 }}>
                Client: {cert.projectClient}
              </Text>
            )}
          </View>
          <View style={s.infoCard}>
            <Text style={s.infoCardLabel}>Phase</Text>
            <Text style={s.infoCardValue}>
              {cert.project_phases?.code} — {cert.project_phases?.name ?? '—'}
            </Text>
          </View>
          {cert.subsystems && (
            <View style={s.infoCard}>
              <Text style={s.infoCardLabel}>Subsystem</Text>
              <Text style={s.infoCardValue}>{cert.subsystems.code} — {cert.subsystems.name}</Text>
              {cert.subsystems.systems && (
                <Text style={{ ...s.infoCardValue, color: '#64748b', fontSize: 8, marginTop: 2 }}>
                  System: {cert.subsystems.systems.code} — {cert.subsystems.systems.name}
                </Text>
              )}
            </View>
          )}
          <View style={s.infoCard}>
            <Text style={s.infoCardLabel}>Summary</Text>
            <Text style={s.infoCardValue}>{approvedItrs.length} ITRs approved</Text>
            {cert.exceptions.length > 0 && (
              <Text style={{ ...s.infoCardValue, color: '#d97706', fontSize: 8, marginTop: 2 }}>
                {cert.exceptions.length} Cat B exception{cert.exceptions.length > 1 ? 's' : ''}
              </Text>
            )}
          </View>
        </View>

        {/* ── ITR List ── */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>
            Approved Inspection & Test Records ({approvedItrs.length})
          </Text>
        </View>

        <View style={s.tableHeader}>
          <Text style={{ ...s.tableHeaderCell, width: 70 }}>ITR Number</Text>
          <Text style={{ ...s.tableHeaderCell, width: 60 }}>Template</Text>
          <Text style={{ ...s.tableHeaderCell, flex: 1 }}>Description</Text>
          <Text style={{ ...s.tableHeaderCell, width: 45 }}>Tag</Text>
          <Text style={{ ...s.tableHeaderCell, width: 45, textAlign: 'center' }}>Status</Text>
        </View>

        {approvedItrs.map((itr, idx) => (
          <View
            key={itr.id}
            style={[s.tableRow, { backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa' }]}
          >
            <Text style={{ ...s.tableCell, width: 70, fontFamily: 'Helvetica-Bold', fontSize: 8 }}>
              {itr.itr_number}
            </Text>
            <Text style={{ ...s.tableCell, width: 60, color: '#64748b', fontSize: 8 }}>
              {itr.itr_templates?.code ?? '—'}
            </Text>
            <Text style={{ ...s.tableCell, flex: 1, fontSize: 8 }}>
              {itr.itr_templates?.title ?? '—'}
            </Text>
            <Text style={{ ...s.tableCell, width: 45, fontSize: 8, color: '#475569' }}>
              {itr.tags?.tag_number ?? '—'}
            </Text>
            <Text style={{ ...s.tableCell, width: 45, textAlign: 'center', color: '#16a34a', fontFamily: 'Helvetica-Bold', fontSize: 7.5 }}>
              {itrStatusLabel(itr.status)}
            </Text>
          </View>
        ))}

        {approvedItrs.length === 0 && (
          <View style={{ padding: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 8.5, color: '#94a3b8', fontStyle: 'italic' }}>
              No approved ITRs associated with this certificate.
            </Text>
          </View>
        )}

        {/* ── Cat B Exceptions ── */}
        {cert.exceptions.length > 0 && (
          <>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>
                Category B Punch Exceptions ({cert.exceptions.length})
              </Text>
            </View>
            {cert.exceptions.map(exc => (
              <View key={exc.id} style={s.exceptionBlock}>
                <Text style={s.exceptionPunchNum}>
                  Punch {exc.punches?.punch_number ?? '—'} · Cat B
                </Text>
                <Text style={s.exceptionDesc}>
                  {exc.punches?.description ?? '—'}
                </Text>
                <Text style={s.exceptionJustif}>
                  Justification: {exc.justification}
                </Text>
                <Text style={s.exceptionMeta}>
                  Approved by {exc.approved_by_profile?.full_name ?? '—'} · {exc.approved_at.slice(0, 10)}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* ── Notes ── */}
        {cert.notes && (
          <>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Notes</Text>
            </View>
            <View style={s.notesBox}>
              <Text style={s.notesText}>{cert.notes}</Text>
            </View>
          </>
        )}

        {/* ── Signatures ── */}
        <View style={s.signaturesSection}>
          <Text style={s.signaturesTitle}>Authorized Signatures</Text>
          <View style={s.signaturesGrid}>
            {/* Issuer */}
            <View style={s.sigBox}>
              <Text style={s.sigRole}>Issued by</Text>
              {cert.issued_by_profile ? (
                <>
                  <Text style={s.sigName}>{cert.issued_by_profile.full_name}</Text>
                  <Text style={s.sigDate}>{cert.issued_date ?? '—'}</Text>
                </>
              ) : (
                <>
                  <View style={s.sigEmpty} />
                  <Text style={{ fontSize: 7.5, color: '#94a3b8' }}>Name / Date</Text>
                </>
              )}
            </View>

            {/* Reviewer */}
            <View style={s.sigBox}>
              <Text style={s.sigRole}>Reviewed by</Text>
              <View style={s.sigEmpty} />
              <Text style={{ fontSize: 7.5, color: '#94a3b8' }}>Name / Date</Text>
            </View>

            {/* Client */}
            <View style={s.sigBox}>
              <Text style={s.sigRole}>Client representative</Text>
              <View style={s.sigEmpty} />
              <Text style={{ fontSize: 7.5, color: '#94a3b8' }}>Name / Date</Text>
            </View>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>CommUp · {cert.certificate_number}</Text>
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
