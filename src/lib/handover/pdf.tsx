/**
 * Handover Package PDF — server-side render via @react-pdf/renderer.
 * Returns a Uint8Array that the export endpoint uploads to Storage.
 */

import React from 'react'
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'
import type { HandoverPackageData } from './types'

const styles = StyleSheet.create({
  page:       { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#0f172a' },
  h1:         { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  subtitle:   { fontSize: 11, color: '#475569', marginBottom: 16 },
  sectionH:   { fontSize: 13, fontWeight: 'bold', marginTop: 16, marginBottom: 6, borderBottom: '1pt solid #cbd5e1', paddingBottom: 2 },
  kvRow:      { flexDirection: 'row', marginBottom: 2 },
  kvKey:      { width: 110, color: '#64748b' },
  kvVal:      { flex: 1 },
  pill:       { fontSize: 8, padding: '2 6', borderRadius: 4, marginRight: 6 },
  pillGreen:  { backgroundColor: '#dcfce7', color: '#166534' },
  pillAmber:  { backgroundColor: '#fef3c7', color: '#92400e' },
  pillRed:    { backgroundColor: '#fee2e2', color: '#991b1b' },
  pillBlue:   { backgroundColor: '#dbeafe', color: '#1e40af' },
  sysCard:    { marginBottom: 10, padding: 8, border: '1pt solid #e2e8f0', borderRadius: 4 },
  sysTitle:   { fontSize: 11, fontWeight: 'bold', marginBottom: 4 },
  table:      { marginTop: 6, border: '1pt solid #e2e8f0' },
  thead:      { flexDirection: 'row', backgroundColor: '#f1f5f9', borderBottom: '1pt solid #e2e8f0' },
  th:         { padding: 4, fontWeight: 'bold', fontSize: 8 },
  tr:         { flexDirection: 'row', borderBottom: '1pt solid #f1f5f9' },
  td:         { padding: 4, fontSize: 8 },
  footer:     { position: 'absolute', bottom: 20, left: 36, right: 36, fontSize: 7, color: '#94a3b8',
                borderTop: '1pt solid #e2e8f0', paddingTop: 4, flexDirection: 'row', justifyContent: 'space-between' },
  empty:      { color: '#94a3b8', fontStyle: 'italic', fontSize: 8 },
})

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase()
  const style =
    s.includes('approv') || s.includes('issu') || s.includes('complet') ? styles.pillGreen :
    s.includes('progress') ? styles.pillBlue :
    s.includes('reject') || s.includes('block') ? styles.pillRed :
    styles.pillAmber
  return <Text style={[styles.pill, style]}>{status}</Text>
}

export function HandoverPdfDocument({ data, signatureHash }: { data: HandoverPackageData; signatureHash: string }) {
  const pkg = data.handover_package
  const totalTags   = pkg.systems.reduce((a, s) => a + s.tag_count, 0)
  const totalItrs   = pkg.systems.reduce((a, s) => a + s.itr_count, 0)
  const totalCatA   = pkg.systems.reduce((a, s) => a + s.punch_summary.cat_a_open, 0)
  const totalCatB   = pkg.systems.reduce((a, s) => a + s.punch_summary.cat_b_open, 0)
  const hashShort   = signatureHash.slice(0, 16)

  return (
    <Document
      title={`Handover Package — ${pkg.project.name}`}
      author="CommUp"
      creator="CommUp Handover Exporter v2.0"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Handover Package</Text>
        <Text style={styles.subtitle}>
          Schema v{pkg.schema_version} · Generated {pkg.generated_at}
        </Text>

        {/* Project */}
        <Text style={styles.sectionH}>Project</Text>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Name</Text><Text style={styles.kvVal}>{pkg.project.name}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Code</Text><Text style={styles.kvVal}>{pkg.project.code}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Client</Text><Text style={styles.kvVal}>{pkg.project.client || '—'}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Location</Text><Text style={styles.kvVal}>{pkg.project.location || '—'}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Status</Text><Text style={styles.kvVal}>{pkg.project.status}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Start / End</Text><Text style={styles.kvVal}>{pkg.project.start_date ?? '—'} → {pkg.project.end_date ?? '—'}</Text></View>

        {/* Summary */}
        <Text style={styles.sectionH}>Executive summary</Text>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Systems</Text><Text style={styles.kvVal}>{pkg.systems.length}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Tags</Text><Text style={styles.kvVal}>{totalTags}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>ITRs</Text><Text style={styles.kvVal}>{totalItrs}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Punch Cat A open</Text><Text style={styles.kvVal}>{totalCatA}</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Punch Cat B open</Text><Text style={styles.kvVal}>{totalCatB} (transferable)</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Certificates</Text><Text style={styles.kvVal}>{pkg.certificates.length}</Text></View>

        {/* Systems */}
        <Text style={styles.sectionH}>Systems</Text>
        {pkg.systems.length === 0 && <Text style={styles.empty}>No systems in scope.</Text>}
        {pkg.systems.map((sys) => (
          <View key={sys.system_id} style={styles.sysCard} wrap={false}>
            <Text style={styles.sysTitle}>{sys.code} — {sys.name}</Text>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Tags / ITRs</Text>
              <Text style={styles.kvVal}>{sys.tag_count} tags · {sys.itr_approved}/{sys.itr_count} ITRs approved</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Punch open</Text>
              <Text style={styles.kvVal}>A:{sys.punch_summary.cat_a_open} · B:{sys.punch_summary.cat_b_open} · C:{sys.punch_summary.cat_c_open}</Text>
            </View>
            {sys.tags.length > 0 && (
              <View style={styles.table}>
                <View style={styles.thead}>
                  <Text style={[styles.th, { width: 90 }]}>Tag</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Description</Text>
                  <Text style={[styles.th, { width: 70 }]}>Manufacturer</Text>
                  <Text style={[styles.th, { width: 60 }]}>Model</Text>
                  <Text style={[styles.th, { width: 50 }]}>Status</Text>
                </View>
                {sys.tags.map((t) => (
                  <View key={t.tag_id} style={styles.tr}>
                    <Text style={[styles.td, { width: 90 }]}>{t.tag_number}</Text>
                    <Text style={[styles.td, { flex: 1 }]}>{t.description}</Text>
                    <Text style={[styles.td, { width: 70 }]}>{t.manufacturer ?? '—'}</Text>
                    <Text style={[styles.td, { width: 60 }]}>{t.model ?? '—'}</Text>
                    <Text style={[styles.td, { width: 50 }]}>{t.status}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {/* Punch Cat B */}
        <Text style={styles.sectionH}>Punch items Cat B (transferable to Operations)</Text>
        {pkg.punch_items.length === 0 && <Text style={styles.empty}>No Cat B punches in scope.</Text>}
        {pkg.punch_items.length > 0 && (
          <View style={styles.table}>
            <View style={styles.thead}>
              <Text style={[styles.th, { width: 80 }]}>Number</Text>
              <Text style={[styles.th, { flex: 1 }]}>Description</Text>
              <Text style={[styles.th, { width: 50 }]}>Priority</Text>
              <Text style={[styles.th, { width: 55 }]}>Status</Text>
              <Text style={[styles.th, { width: 65 }]}>Target date</Text>
            </View>
            {pkg.punch_items.map((p) => (
              <View key={p.punch_id} style={styles.tr} wrap={false}>
                <Text style={[styles.td, { width: 80 }]}>{p.punch_number}</Text>
                <Text style={[styles.td, { flex: 1 }]}>{p.description}</Text>
                <Text style={[styles.td, { width: 50 }]}>{p.priority}</Text>
                <Text style={[styles.td, { width: 55 }]}>{p.status}</Text>
                <Text style={[styles.td, { width: 65 }]}>{p.target_date ?? '—'}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Certificates */}
        <Text style={styles.sectionH}>Certificates</Text>
        {pkg.certificates.length === 0 && <Text style={styles.empty}>No certificates in scope.</Text>}
        {pkg.certificates.length > 0 && (
          <View style={styles.table}>
            <View style={styles.thead}>
              <Text style={[styles.th, { width: 90 }]}>Number</Text>
              <Text style={[styles.th, { flex: 1 }]}>Title</Text>
              <Text style={[styles.th, { width: 60 }]}>Status</Text>
              <Text style={[styles.th, { width: 65 }]}>Issued</Text>
            </View>
            {pkg.certificates.map((c) => (
              <View key={c.certificate_id} style={styles.tr}>
                <Text style={[styles.td, { width: 90 }]}>{c.certificate_number}</Text>
                <Text style={[styles.td, { flex: 1 }]}>{c.title}</Text>
                <View style={[styles.td, { width: 60 }]}><StatusPill status={c.status} /></View>
                <Text style={[styles.td, { width: 65 }]}>{c.issued_date ?? '—'}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Signature */}
        <Text style={styles.sectionH}>Digital signature</Text>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Algorithm</Text><Text style={styles.kvVal}>HMAC-SHA256</Text></View>
        <View style={styles.kvRow}><Text style={styles.kvKey}>Hash</Text><Text style={styles.kvVal}>{signatureHash}</Text></View>
        <Text style={[styles.empty, { marginTop: 6 }]}>
          Hash calculated over the companion JSON payload. Verify integrity by recomputing HMAC-SHA256 with the org&apos;s handover signing secret.
        </Text>

        <View style={styles.footer} fixed>
          <Text>CommUp Handover Package v{pkg.schema_version} · {pkg.project.name}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          <Text>sig:{hashShort}…</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderHandoverPdf(
  data: HandoverPackageData,
  signatureHash: string,
): Promise<Uint8Array> {
  const instance = pdf(<HandoverPdfDocument data={data} signatureHash={signatureHash} />)
  const blob = await instance.toBlob()
  const buf = await blob.arrayBuffer()
  return new Uint8Array(buf)
}
