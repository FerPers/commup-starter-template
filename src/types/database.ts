// ============================================================
// CommUp — Database Types
// Auto-synchronized with Supabase schema
// ============================================================

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// ── Enums ────────────────────────────────────────────────────

export type OrgMemberRole = 'owner' | 'admin' | 'architect' | 'leader' | 'inspector' | 'client'
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
export type TagStatus = 'not_started' | 'in_progress' | 'completed' | 'on_hold'
export type ItrStatus = 'not_started' | 'in_progress' | 'completed' | 'approved' | 'rejected'
export type ItrItemType = 'checkbox' | 'text' | 'number' | 'measurement' | 'select' | 'photo' | 'signature' | 'date' | 'yes_no'
export type SignatureRole = 'executor' | 'supervisor' | 'client'
export type PunchCategory = 'A' | 'B' | 'C'
export type PunchStatus = 'open' | 'in_progress' | 'closed' | 'cancelled'
export type PunchPriority = 'critical' | 'major' | 'minor'
export type CertificateStatus = 'pending' | 'in_review' | 'issued' | 'rejected'
export type PreservationFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly'
export type PreservationStatus = 'active' | 'suspended' | 'completed'
export type PreservationResult = 'ok' | 'nok' | 'na'
export type SignalType = 'AI' | 'AO' | 'DI' | 'DO' | 'PI' | 'PO'
export type WorkPlanStatus = 'draft' | 'published' | 'in_progress' | 'completed'

// ── Module 1: Multi-tenancy ──────────────────────────────────

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  plan: string
  settings: Json
  created_at: string
}

export interface User {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
  created_at: string
}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: OrgMemberRole
  joined_at: string
}

// ── Module 2: Configuration (fully flexible) ─────────────────

export interface ProjectPhase {
  id: string
  org_id: string
  code: string          // 'A' | 'B' | 'C' | custom
  name: string          // 'Mechanical Completion' | custom
  order_index: number
  color: string         // hex color for UI
  certificate_name: string | null
}

export interface Discipline {
  id: string
  org_id: string
  code: string          // 'MECH' | 'ELEC' | 'INST' | 'PIPE' | custom
  name: string
  color: string
}

export interface EquipmentType {
  id: string
  org_id: string
  code: string
  name: string
  category: string | null
}

// ── Module 3: Project Hierarchy ──────────────────────────────

export interface Project {
  id: string
  org_id: string
  name: string
  code: string
  location: string | null
  client: string | null
  start_date: string | null
  end_date: string | null
  status: ProjectStatus
  created_at: string
}

export interface Area {
  id: string
  project_id: string
  name: string
  code: string
  description: string | null
}

export interface System {
  id: string
  area_id: string
  project_id: string
  name: string
  code: string
  description: string | null
  current_phase_id: string | null
}

export interface Subsystem {
  id: string
  system_id: string
  project_id: string
  name: string
  code: string
  description: string | null
  current_phase_id: string | null
  completion_pct: number
}

// ── Module 4: Tags & Assets ──────────────────────────────────

export interface Tag {
  id: string
  subsystem_id: string
  project_id: string
  discipline_id: string
  equipment_type_id: string | null
  tag_number: string
  description: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  status: TagStatus
  preservation_required: boolean
  pid_drawing: string | null
  // Engineering parameters (Sprint 2)
  range_min: number | null
  range_max: number | null
  eng_unit: string | null
  sp_h: number | null
  sp_hh: number | null
  sp_l: number | null
  sp_ll: number | null
  signal_type: string | null
  sil_level: string | null
  io_address: string | null
  junction_box: string | null
  datasheet_number: string | null
  revision: string | null
  fluid_type: string | null
  mounting_typical: string | null
  created_at: string
}

export interface Cable {
  id: string
  project_id: string
  subsystem_id: string | null
  cable_number: string
  from_tag_id: string | null
  to_tag_id: string | null
  cable_type: string | null
  size: string | null
  length_m: number | null
  status: TagStatus
}

export interface Signal {
  id: string
  tag_id: string
  loop_id: string | null
  signal_tag: string
  description: string | null
  signal_type: SignalType
  eng_unit: string | null
  range_min: number | null
  range_max: number | null
  service: string | null
  alarm_setpoints: string | null
  origin: string | null
  destination: string | null
  pid_drawing: string | null
  loop_diagram: string | null
  wiring_diagram: string | null
  notes: string | null
}

export interface Loop {
  id: string
  project_id: string
  subsystem_id: string
  loop_number: string
  description: string | null
  discipline_id: string
  status: TagStatus
}

export interface Interlock {
  id: string
  project_id: string
  subsystem_id: string
  interlock_number: string
  description: string
  cause_tag_id: string | null
  effect_tag_id: string | null
  set_point: string | null
  action: string | null
}

// ── Module 5: Preservation ───────────────────────────────────

export interface PreservationProcedure {
  id: string
  org_id: string
  equipment_type_id: string | null
  discipline_id: string | null
  code: string
  title: string
  description: string | null
  frequency: PreservationFrequency
  interval_days: number
  requires_photo: boolean
  requires_signature: boolean
}

export type PreservationItemType = 'checkbox' | 'measurement' | 'number' | 'text' | 'yes_no'

export interface PreservationProcedureItem {
  id: string
  procedure_id: string
  order_index: number
  label: string
  item_type: PreservationItemType
  unit: string | null
  min_value: number | null
  max_value: number | null
  is_critical: boolean
  is_required: boolean
  created_at: string
}

export interface PreservationPlan {
  id: string
  tag_id: string
  project_id: string
  procedure_id: string
  responsible_user_id: string | null
  start_date: string
  end_date: string | null
  last_performed_date: string | null
  next_due_date: string
  status: PreservationStatus
}

export interface PreservationRecord {
  id: string
  plan_id: string
  tag_id: string
  performed_by: string
  performed_at: string
  result: PreservationResult
  remarks: string | null
  punch_raised: boolean
  punch_id: string | null
  created_at: string
}

export interface PreservationRecordResponse {
  id: string
  record_id: string
  item_id: string
  value_bool: boolean | null
  value_numeric: number | null
  value_text: string | null
  is_passed: boolean | null
  responded_at: string
  responded_by: string
}

export interface PreservationAttachment {
  id: string
  record_id: string
  file_url: string
  file_type: string
  latitude: number | null
  longitude: number | null
  captured_at: string
}

// ── Module 6: ITR Templates ──────────────────────────────────

export interface ItrTemplate {
  id: string
  org_id: string
  discipline_id: string
  equipment_type_id: string | null
  phase_id: string
  code: string
  title: string
  description: string | null
  version: number
  is_active: boolean
  is_global: boolean
  created_at: string
}

export interface ItrTemplateSection {
  id: string
  template_id: string
  title: string
  order_index: number
}

export interface ItrTemplateItem {
  id: string
  section_id: string
  template_id: string
  item_number: string | null  // hierarchical numbering e.g. "1.0", "1.1", "10.0a"
  description: string
  description_es: string | null  // Spanish translation
  item_type: ItrItemType
  is_required: boolean
  is_critical: boolean       // if fails → blocks ITR signature
  requires_photo: boolean
  requires_measurement: boolean
  options: Json | null       // for 'select' type items
  unit: string | null
  acceptance_min: number | null
  acceptance_max: number | null
  acceptance_text: string | null
  order_index: number
  condition_item_id: string | null  // if set, item is only visible when referenced item has condition_value
  condition_value: string | null    // 'true'/'false' for yes_no/checkbox; exact value for select/text
}

// ── Module 7: ITR Instances ──────────────────────────────────

export interface Itr {
  id: string
  template_id: string
  tag_id: string | null
  subsystem_id: string
  project_id: string
  phase_id: string
  itr_number: string
  status: ItrStatus
  scheduled_date: string | null
  completed_date: string | null
  progress_pct: number
  created_at: string
}

export interface ItrAssignment {
  id: string
  itr_id: string
  user_id: string
  role: SignatureRole
  assigned_at: string
}

export interface ItrResponse {
  id: string
  itr_id: string
  item_id: string
  value_text: string | null
  value_numeric: number | null
  value_bool: boolean | null
  value_option: string | null
  remarks: string | null
  is_passed: boolean | null
  responded_at: string | null
  responded_by: string | null
}

export interface ItrSignature {
  id: string
  itr_id: string
  user_id: string
  role: SignatureRole
  signature_url: string | null
  signed_at: string
}

export interface ItrAttachment {
  id: string
  itr_id: string
  item_id: string | null
  response_id: string | null
  file_url: string
  file_type: string
  latitude: number | null
  longitude: number | null
  captured_at: string
  uploaded_by: string
}

// ── Module 8: Punch List ─────────────────────────────────────

export interface Punch {
  id: string
  project_id: string
  subsystem_id: string
  tag_id: string | null
  itr_id: string | null
  preservation_record_id: string | null
  punch_number: string
  category: PunchCategory   // A=blocker, B=transferable, C=minor
  description: string
  discipline_id: string
  raised_by: string
  assigned_to: string | null
  status: PunchStatus
  priority: PunchPriority
  target_date: string | null
  closed_date: string | null
  created_via: string | null  // manual | workflow | import
  created_at: string
}

export interface PunchComment {
  id: string
  punch_id: string
  user_id: string
  comment: string
  created_at: string
}

export interface PunchAttachment {
  id: string
  punch_id: string
  file_url: string
  uploaded_by: string
  created_at: string
}

// ── Module 9: Certificates ───────────────────────────────────

export interface Certificate {
  id: string
  project_id: string
  system_id: string | null
  subsystem_id: string | null
  phase_id: string
  certificate_number: string
  title: string
  status: CertificateStatus
  issued_date: string | null
  issued_by: string | null
  approved_by: string | null
  document_url: string | null
  is_blocked: boolean
  block_reason: string | null
  notes: string | null
  created_at: string
}

export interface CertificatePunchException {
  id: string
  certificate_id: string
  punch_id: string
  justification: string
  approved_by: string
  approved_at: string
}

export type CertSignatureRole = 'completion' | 'client' | 'authority'

export interface CertificateSignature {
  id: string
  certificate_id: string
  user_id: string
  role: CertSignatureRole
  signature_image: string | null
  comments: string | null
  signed_at: string
}

// ── Module 10: Work Plans & KPIs ─────────────────────────────

export interface WorkPlan {
  id: string
  project_id: string
  discipline_id: string
  leader_id: string
  plan_date: string
  status: WorkPlanStatus
  notes: string | null
}

export interface WorkPlanItem {
  id: string
  work_plan_id: string
  itr_id: string
  assigned_to: string
  status: TagStatus
  remarks: string | null
}

export interface KpiSnapshot {
  id: string
  project_id: string
  area_id: string | null
  system_id: string | null
  subsystem_id: string | null
  phase_id: string | null
  total_itrs: number
  completed_itrs: number
  total_punches_a: number
  open_punches_a: number
  total_punches_b: number
  open_punches_b: number
  total_tags: number
  total_preservation: number
  overdue_preservation: number
  completion_pct: number
  snapshot_date: string
}

// ── Module 11: PSSR ─────────────────────────────────────────

export type PssrReviewStatus = 'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'rejected'
export type PssrItemStatus   = 'pending' | 'si' | 'no' | 'na'

export interface PssrTemplate {
  id: string
  org_id: string
  name: string
  description: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PssrTemplateItem {
  id: string
  template_id: string
  item_order: number
  category: string
  element: string
  requirement: string
  notes_hint: string | null
  is_required: boolean
  created_at: string
}

export interface PssrReview {
  id: string
  org_id: string
  project_id: string
  system_id: string
  template_id: string | null
  review_number: string
  title: string
  status: PssrReviewStatus
  rfsu_certificate_id: string | null
  notes: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface PssrReviewItem {
  id: string
  review_id: string
  template_item_id: string | null
  item_order: number
  category: string
  element: string
  requirement: string
  notes_hint: string | null
  status: PssrItemStatus
  responsible: string | null
  actions: string | null
  completion_date: string | null
  updated_by: string | null
  updated_at: string
}

export interface PssrSignature {
  id: string
  review_id: string
  user_id: string
  discipline: string | null
  signature_data: string
  signed_at: string
}

// ── Joined / View Types ──────────────────────────────────────

export interface TagWithRelations extends Tag {
  discipline: Discipline
  equipment_type: EquipmentType | null
  subsystem: Subsystem
  open_punches: number
  itr_status: ItrStatus | null
}

export interface SubsystemWithKpi extends Subsystem {
  system: System
  total_itrs: number
  completed_itrs: number
  open_punches_a: number
  open_punches_b: number
  completion_pct: number
  current_phase: ProjectPhase | null
}

export interface ItrWithRelations extends Itr {
  template: ItrTemplate
  tag: Tag | null
  subsystem: Subsystem
  phase: ProjectPhase
  assignments: ItrAssignment[]
  signatures: ItrSignature[]
  open_punches: number
}

// ── P&ID Hotspots ─────────────────────────────────────────────

export interface PidHotspot {
  id: string
  pid_document_id: string
  tag_id: string
  project_id: string
  org_id: string
  page_num: number
  x_pct: number
  y_pct: number
  created_by: string
  created_at: string
}

export interface PidHotspotWithTag extends PidHotspot {
  tag: Pick<Tag, 'id' | 'tag_number' | 'description' | 'status'>
  discipline: Pick<Discipline, 'id' | 'code' | 'name' | 'color'>
  open_punches_a: number
  itr_completion_pct: number
}

// ── Explorer ──────────────────────────────────────────────────

export interface ExplorerSubsystem {
  id: string
  code: string
  name: string
  tag_count: number
  itr_total: number
  itr_approved: number
  open_punches_a: number
}

export interface ExplorerSystem {
  id: string
  code: string
  name: string
  subsystems: ExplorerSubsystem[]
}

export interface ExplorerArea {
  id: string
  code: string
  name: string
  systems: ExplorerSystem[]
}

// ── Module 11: Audit Log ─────────────────────────────────────

export interface ActivityLog {
  id: string
  org_id: string
  user_id: string
  entity_type: 'certificate' | 'itr' | 'punch' | 'user' | 'pssr' | string
  entity_id: string | null
  action: 'issued' | 'approved' | 'rejected' | 'revoked' | 'closed' | 'invited' | 'removed' | 'role_updated' | string
  payload: Json | null
  created_at: string
}

// ── Module 12: Workflow Engine ──────────────────────���───────

export type WorkflowActionType =
  | 'block_certificate'
  | 'notify_user'
  | 'create_punch'
  | 'change_system_state'
  | 'webhook_call'

export interface WorkflowRule {
  id: string
  org_id: string
  name: string
  description: string | null
  trigger_event: string
  condition_jsonlogic: Json
  action_type: WorkflowActionType
  action_payload: Json
  priority: number
  enabled: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface WorkflowExecution {
  id: string
  rule_id: string
  event_id: string
  org_id: string
  matched: boolean
  action_result: Json | null
  error_message: string | null
  executed_at: string
}

// ── Module 13: Alerts ───────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface Alert {
  id: string
  org_id: string
  project_id: string | null
  user_id: string | null
  role: string | null
  severity: AlertSeverity
  title: string
  message: string | null
  source_event_id: string | null
  read: boolean
  read_at: string | null
  created_at: string
}

// ── Module 13: Public API + Webhooks ────────────────────────

export type ApiScope =
  | 'tags:read'        | 'tags:write'
  | 'itrs:read'        | 'itrs:write'
  | 'punches:read'     | 'punches:write'
  | 'certificates:read'
  | 'systems:read'
  | 'events:read'
  | '*'

export interface ApiKey {
  id: string
  org_id: string
  name: string
  key_prefix: string
  key_hash: string
  scopes: ApiScope[]
  created_at: string
  created_by: string | null
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

export interface WebhookSubscription {
  id: string
  org_id: string
  project_id: string | null
  name: string
  endpoint_url: string
  secret: string
  event_types: string[]
  enabled: boolean
  created_at: string
  created_by: string | null
  last_success_at: string | null
  last_error_at: string | null
  failure_count: number
}

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'abandoned'

export interface WebhookDelivery {
  id: string
  subscription_id: string
  domain_event_id: string
  status: WebhookDeliveryStatus
  attempts: number
  next_retry_at: string
  last_response_code: number | null
  last_response_body: string | null
  delivered_at: string | null
  created_at: string
}

