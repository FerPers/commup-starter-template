/**
 * Handover Package — shape returned by RPC `generate_handover_package`.
 * v3.0 (S24, D17): por sistema, además de ITR/tags/punch, todo F1–F8 con firmas (nombre + empresa congelada) y hashes.
 * Los paquetes v2.0 ya emitidos no traen las secciones nuevas: por eso son opcionales al leer.
 */

export type HandoverSignature = {
  role: 'executor' | 'supervisor' | 'client'
  user_id: string
  name?: string | null
  company?: string | null
  signed_at: string
  signature_url: string | null
}

export type HandoverItr = {
  itr_id: string
  itr_number: string
  status: string
  progress_pct: number
  scheduled_date: string | null
  completed_date: string | null
  tag_number: string | null
  signatures: HandoverSignature[]
}

export type HandoverTag = {
  tag_id: string
  tag_number: string
  description: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  status: string
  criticality?: string | null
}

/** Firma de una persona: nombre, empresa congelada al firmar y fecha. */
export type HandoverSigner = { name: string | null; company: string | null; signed_at: string | null }

export type HandoverGate = {
  gate_id: string
  code: string
  name: string
  order: number
  status: string
  approval: {
    status: string
    approved_by: string | null
    approved_role: string | null
    company: string | null
    approved_at: string
    completed_at: string | null
    conditions: unknown
    notes: string | null
    signatures: { capacity: string; name: string | null; company: string | null; signed_at: string; comments: string | null }[]
  } | null
  attestations: { criterion: string; label: string | null; comment: string; file_path: string; by: string | null; at: string }[]
}

export type HandoverPssr = {
  review_id: string
  review_number: string
  title: string
  status: string
  submitted_by: string | null
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  items: { total: number; yes: number; na: number; no: number }
  signatures: { capacity: string | null; discipline: string | null; name: string | null; signed_at: string }[]
}

export type HandoverRunStep = {
  ord: number
  action: string
  expected: string | null
  actual: string | null
  status: string
  comment: string | null
  hold: boolean
  done_by: string | null
  done_at: string | null
  released_by: string | null
  released_at: string | null
  release_role: string | null
  /** S25 (E-09) */
  release_comment?: string | null
  /** S25b (E-23) */
  expected_min?: number | null; expected_max?: number | null; expected_unit?: string | null; out_of_range?: boolean
}

export type HandoverProcedure = {
  procedure_id: string
  number: string
  title: string
  kind: string
  revision: {
    revision_id: string
    rev: number
    status: string
    approved_by: string | null
    approved_at: string | null
    field_verified_by: string | null
    field_verified_at: string | null
    walkdown_note: string | null
    content_hash: string | null
  } | null
  last_run: {
    run_id: string
    number: string
    status: string
    started_by: string | null
    started_at: string | null
    completed_by: string | null
    completed_at: string | null
    steps: HandoverRunStep[]
    /** S25 (E-10): paradas, reanudaciones y holds liberados. */
    timeline?: { kind: string; by: string | null; at: string; comment: string | null }[]
  } | null
}

export type HandoverLineup = {
  sheet_id: string
  number: string
  title: string
  status: string
  issued_by: string | null
  issued_at: string | null
  verified_by: string | null
  verified_at: string | null
  content_hash: string | null
  items: {
    ord: number; tag: string | null; label: string; required: string; found: string | null; critical: boolean; remarks: string | null
    /** S25b (E-21) */
    as_found?: string | null; lock_number?: string | null; seal_number?: string | null
    set_by: string | null; set_at: string | null; verified_by: string | null; verified_at: string | null
  }[]
}

export type HandoverStartupEvent = {
  number: string
  kind: string
  milestone: string | null
  category: string | null
  occurred_at: string
  title: string
  description: string | null
  status: string
  recorded_by: string | null
  witness_capacity: string | null
  /** S25 (E-16) */
  backdate_reason?: string | null
  witness_by: string | null
  witness_at: string | null
  params: { label: string; value: number | null; value_text: string | null; unit: string | null; quality: number | null; sampled_at: string | null; source: string }[]
}

export type HandoverTransfer = {
  number: string
  from_stage: string
  to_stage: string
  is_reversal: boolean
  reason: string | null
  checklist: { key: string; ok: boolean; detail?: unknown }[] | null
  exceptions: { key: string; justification: string }[] | null
  requested_by: string | null
  requested_at: string
  commissioning: HandoverSigner
  operations: HandoverSigner
  /** S25 (E-13): excepciones que reconoció cada firmante. */
  commissioning_ack?: string[] | null
  operations_ack?: string[] | null
  completed_at: string | null
  content_hash: string | null
}

export type HandoverCompetencies = {
  required_per_shift: number
  personnel: { name: string; company: string | null; position: string | null; shift: string | null; level: number; assessed_at: string | null; expires_at: string | null }[]
}

export type HandoverSpare = {
  kind: string
  item: string
  part_number: string | null
  tag: string | null
  critical: boolean
  qty_required: number
  qty_available: number
  status: string
  eta: string | null
  notes: string | null
}

export type HandoverPerformance = {
  test_id: string
  number: string
  title: string
  status: string
  revision: { rev: number; status: string; content_hash: string | null; approved_by: string | null; approved_at: string | null } | null
  runs: {
    run_id: string; number: string; attempt: number; status: string; formal_started_at: string | null; closed_at: string | null
    result: string | null; result_reason: string | null; result_by: string | null; result_at: string | null; evaluation_hash: string | null
  }[]
  certificates: {
    number: string; status: string; run_id: string; content_hash: string | null
    commissioning: HandoverSigner; operations: HandoverSigner; client: HandoverSigner
  }[]
}

export type HandoverDocument = {
  document_id: string
  number: string
  title: string
  doc_type: string | null
  company: string | null
  revision: {
    revision_id: string; rev: string; status: string; issued_on: string | null
    file_name: string | null; file_path: string | null; external_url: string | null
  } | null
}

export type HandoverVendor = {
  number: string
  title: string
  status: string
  company: string | null
  mobilized_at: string | null
  demobilized_at: string | null
  activities: { kind: string; title: string; performed_on: string | null; result: string; retest: boolean; findings: number }[]
  final_report: { report_date: string; issued_by: string | null; issued_at: string; activities: string | null; issues: string | null } | null
  recommendations: { seq: number; description: string; status: string; requires_moc: boolean; moc_reference: string | null; decided_by: string | null; decided_at: string | null }[]
}

export type HandoverSystem = {
  system_id: string
  code: string
  name: string
  description: string | null
  tag_count: number
  itr_count: number
  itr_approved: number
  punch_summary: {
    cat_a_open: number
    cat_b_open: number
    cat_c_open: number
    total_open: number
  }
  itrs: HandoverItr[]
  tags: HandoverTag[]
  // v3.0
  ownership?: { stage: string; since: string } | null
  gates?: HandoverGate[]
  pssr?: HandoverPssr[]
  procedures?: HandoverProcedure[]
  lineups?: HandoverLineup[]
  startup_events?: HandoverStartupEvent[]
  transfers?: HandoverTransfer[]
  competencies?: HandoverCompetencies
  spares?: HandoverSpare[]
  performance?: HandoverPerformance[]
  documents?: HandoverDocument[]
  vendors?: HandoverVendor[]
}

export type HandoverPunch = {
  punch_id: string
  punch_number: string
  category: 'A' | 'B' | 'C'
  description: string
  status: string
  priority: string
  raised_by: string | null
  assigned_to: string | null
  target_date: string | null
  closed_date: string | null
  subsystem_id: string
  tag_id: string | null
  created_at: string
}

export type HandoverCertificate = {
  certificate_id: string
  certificate_number: string
  title: string
  status: string
  issued_date: string | null
  issued_by: string | null
  approved_by: string | null
  system_id: string | null
  subsystem_id: string | null
  document_url: string | null
  signatures?: { role: string; name: string | null; signed_at: string }[]
}

export type HandoverPackageData = {
  handover_package: {
    schema_version: string
    generated_at: string
    org_id: string
    project: {
      id: string
      name: string
      code: string
      client: string | null
      location: string | null
      status: string
      start_date: string | null
      end_date: string | null
      timezone?: string
      org_name?: string
    }
    systems: HandoverSystem[]
    punch_items: HandoverPunch[]
    certificates: HandoverCertificate[]
  }
}

/** Entrada de manifest.json: un archivo del ZIP con su sha256. */
export type HandoverManifestFile = { path: string; sha256: string; bytes: number }

export type HandoverManifest = {
  format: 'commup-handover'
  schema_version: string
  package_id: string
  generated_at: string
  project_code: string
  systems: string[]
  /** sha256 de handover.json = el hash que se consulta en /verify/<hash>. */
  data_sha256: string
  files: HandoverManifestFile[]
  /** Anexos que no entraron (tope de tamaño o error al generarlos), con el motivo. */
  omitted: { path: string; reason: string }[]
  /** A10: true solo si no se omitió nada. Va dentro de lo firmado: un parcial no puede pasar por completo. */
  complete: boolean
  signature: { alg: 'Ed25519'; key_id: string }
}
