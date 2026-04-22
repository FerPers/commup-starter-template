/**
 * Handover Package v2.0 — shape returned by RPC `generate_handover_package`.
 */

export type HandoverSignature = {
  role: 'executor' | 'supervisor' | 'client'
  user_id: string
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
    }
    systems: HandoverSystem[]
    punch_items: HandoverPunch[]
    certificates: HandoverCertificate[]
  }
}
