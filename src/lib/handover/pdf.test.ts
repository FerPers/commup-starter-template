import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { renderHandoverPdf } from './pdf'
import { safeName } from './bundle'
import type { HandoverPackageData, HandoverSystem } from './types'

const signer = (name: string) => ({ name, company: 'EPC Andina', signed_at: '2026-10-20T15:00:00Z' })

const sysV2: HandoverSystem = {
  system_id: 's1', code: 'A100-S02', name: 'Compresión', description: null, tag_count: 2, itr_count: 2, itr_approved: 1,
  punch_summary: { cat_a_open: 0, cat_b_open: 1, cat_c_open: 0, total_open: 1 },
  itrs: [], tags: [{ tag_id: 't1', tag_number: 'C-103', description: 'Compresor → descarga', manufacturer: 'Ariel', model: 'JGK', serial_number: null, status: 'active' }],
}

const sysV3: HandoverSystem = {
  ...sysV2,
  ownership: { stage: 'operations', since: '2026-10-20T15:00:00Z' },
  gates: [{
    gate_id: 'g1', code: 'RFSU', name: 'Ready for start-up', order: 30, status: 'approved',
    approval: { status: 'approved', approved_by: 'Ana', approved_role: 'leader', company: 'EPC Andina', approved_at: '2026-10-19T12:00:00Z', completed_at: null,
      conditions: ['Cerrar punch B-12'], notes: null, signatures: [{ capacity: 'operations', name: 'Pedro', company: 'Operadora', signed_at: '2026-10-19T13:00:00Z', comments: null }] },
    attestations: [{ criterion: 'manual_attestation', label: 'Brigada', comment: 'Entrenada', file_path: 'x', by: 'Ana', at: '2026-10-18T10:00:00Z' }],
  }],
  pssr: [{ review_id: 'p1', review_number: 'PSSR-001', title: 'PSSR', status: 'approved', submitted_by: 'Ana', submitted_at: null, approved_by: 'Luis', approved_at: '2026-10-19T00:00:00Z', items: { total: 10, yes: 8, na: 2, no: 0 }, signatures: [{ capacity: 'hse', discipline: null, name: 'Marta', signed_at: '2026-10-19T00:00:00Z' }] }],
  procedures: [{
    procedure_id: 'pr1', number: 'PRC-0001', title: 'Arranque del compresor', kind: 'startup',
    revision: { revision_id: 'r1', rev: 1, status: 'approved', approved_by: 'Luis', approved_at: '2026-10-18T00:00:00Z', field_verified_by: 'Pedro', field_verified_at: '2026-10-18T05:00:00Z', walkdown_note: null, content_hash: 'c'.repeat(64) },
    last_run: { run_id: 'ru1', number: 'PRC-0001/E1', status: 'completed', started_by: 'Pedro', started_at: '2026-10-19T10:00:00Z', completed_by: 'Pedro', completed_at: '2026-10-19T12:00:00Z',
      steps: [
        { ord: 1, action: 'Abrir válvula de succión', expected: '11–12 barg', actual: '11,8', status: 'done', comment: 'Fuga menor en brida', hold: false, done_by: 'Pedro', done_at: '2026-10-19T10:05:00Z', released_by: null, released_at: null, release_role: null },
        { ord: 2, action: 'Arrancar motor', expected: null, actual: null, status: 'released', comment: null, hold: true, done_by: 'Pedro', done_at: '2026-10-19T10:30:00Z', released_by: 'Ana', released_at: '2026-10-19T10:40:00Z', release_role: 'commissioning' },
      ] },
  }],
  lineups: [{ sheet_id: 'l1', number: 'LU-0001', title: 'Succión', status: 'verified', issued_by: 'Ana', issued_at: null, verified_by: 'Pedro', verified_at: '2026-10-19T09:00:00Z', content_hash: 'd'.repeat(64),
    items: [{ ord: 1, tag: 'XV-101', label: 'Válvula', required: 'open', found: 'open', critical: true, remarks: null, set_by: 'Juan', set_at: '2026-10-19T08:00:00Z', verified_by: 'Pedro', verified_at: '2026-10-19T09:00:00Z' }] }],
  startup_events: [{ number: 'EVT-0001', kind: 'milestone', milestone: 'first_startup', category: null, occurred_at: '2026-10-19T10:30:00Z', title: 'Primer arranque', description: null, status: 'witnessed', recorded_by: 'Pedro', witness_capacity: 'operations', witness_by: 'Marta', witness_at: '2026-10-19T10:35:00Z',
    params: [{ label: 'PT-101', value: 11.8, value_text: null, unit: 'barg', quality: 0, sampled_at: '2026-10-19T10:30:00Z', source: 'iiot' }] }],
  transfers: [{ number: 'TRF-0001', from_stage: 'joint_operation', to_stage: 'operations', is_reversal: false, reason: null, checklist: [{ key: 'no_cat_a', ok: true }], exceptions: [{ key: 'spares', justification: 'Repuesto en tránsito, ETA 30/10' }],
    requested_by: 'Ana', requested_at: '2026-10-20T10:00:00Z', commissioning: signer('Ana'), operations: signer('Pedro'), completed_at: '2026-10-20T15:00:00Z', content_hash: 'e'.repeat(64) }],
  competencies: { required_per_shift: 2, personnel: [{ name: 'Juan', company: 'Operadora', position: 'Operador', shift: 'A', level: 3, assessed_at: '2026-10-01', expires_at: null }] },
  spares: [{ kind: 'spare', item: 'Sello mecánico', part_number: 'SM-1', tag: 'C-103', critical: true, qty_required: 2, qty_available: 1, status: 'ordered', eta: '2026-10-30', notes: null }],
  performance: [{ test_id: 'pt1', number: 'PTT-0001', title: 'Capacidad', status: 'active', revision: { rev: 0, status: 'approved', content_hash: 'a'.repeat(64), approved_by: 'Ana', approved_at: null },
    runs: [{ run_id: 'x', number: 'PTT-0001/R1', attempt: 1, status: 'evaluated', formal_started_at: null, closed_at: null, result: 'accepted', result_reason: null, result_by: 'Luis', result_at: null, evaluation_hash: 'b'.repeat(64) }],
    certificates: [{ number: 'PTC-0001', status: 'accepted', run_id: 'x', content_hash: 'f'.repeat(64), commissioning: signer('Ana'), operations: signer('Pedro'), client: signer('Cliente') }] }],
  documents: [{ document_id: 'd1', number: 'DOC-001', title: 'P&ID', doc_type: 'pid', company: null, revision: { revision_id: 'dr1', rev: 'B', status: 'as_built', issued_on: '2026-10-01', file_name: 'pid.pdf', file_path: 'p/d/x', external_url: null } }],
  vendors: [{ number: 'VND-0001', title: 'Compresor', status: 'demobilized', company: 'Ariel', mobilized_at: null, demobilized_at: null,
    activities: [{ kind: 'sat', title: 'SAT', performed_on: '2026-10-10', result: 'passed_with_findings', retest: false, findings: 2 }],
    final_report: { report_date: '2026-10-15', issued_by: 'Ana', issued_at: '2026-10-15T00:00:00Z', activities: null, issues: null },
    recommendations: [{ seq: 1, description: 'Cambiar filtro', status: 'implemented', requires_moc: true, moc_reference: 'MOC-12', decided_by: 'Luis', decided_at: null }] }],
}

const pkg = (version: string, systems: HandoverSystem[]): HandoverPackageData => ({
  handover_package: {
    schema_version: version, generated_at: '2026-10-20T15:05:00Z', org_id: 'o1',
    project: { id: 'p1', name: 'Planta GLP', code: 'DEMO-GLP', client: 'Operadora', location: null, status: 'active', start_date: null, end_date: null, timezone: 'America/Bogota', org_name: 'DEMO' },
    systems,
    punch_items: [{ punch_id: 'pu1', punch_number: 'P-0012', category: 'B', description: 'Pintura', status: 'open', priority: 'low', raised_by: null, assigned_to: null, target_date: null, closed_date: null, subsystem_id: 'ss', tag_id: null, created_at: '2026-10-01' }],
    certificates: [{ certificate_id: 'c1', certificate_number: 'MC-001', title: 'MC', status: 'issued', issued_date: '2026-10-10', issued_by: null, approved_by: null, system_id: 's1', subsystem_id: null, document_url: null, signatures: [{ role: 'client', name: 'Cliente', signed_at: '2026-10-10' }] }],
  },
})

describe('índice PDF del handover v3 (S24)', () => {
  it('renderiza todas las secciones v3 con anexos y firma Ed25519', async () => {
    const bytes = await renderHandoverPdf(pkg('3.0', [sysV3]), {
      lang: 'es', dataSha256: '0'.repeat(64), keyId: '1234abcd1234abcd', verifyUrl: 'https://commup.app/verify/' + '0'.repeat(64),
      annexes: ['anexos/A100-S02/procedimientos/PRC-0001-R1.pdf'], omitted: [{ path: 'anexos/A100-S02/itr/x.pdf', reason: 'tope' }],
      label: k => (k === 'ops.stage.operations' ? 'Operaciones' : k),
    })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3)
    expect(doc.getTitle()).toContain('DEMO-GLP')
  })

  it('lee un paquete v2 (sin secciones nuevas) en inglés', async () => {
    const bytes = await renderHandoverPdf(pkg('2.0', [sysV2]), { lang: 'en', dataSha256: 'a'.repeat(64) })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(3)
  })
})

describe('safeName', () => {
  it('quita acentos, espacios y barras', () => {
    expect(safeName('PTT-0001/R2 Válvula ñ')).toBe('PTT-0001_R2_Valvula_n')
    expect(safeName('///')).toBe('archivo')
  })
})
