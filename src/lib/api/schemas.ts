import { z } from 'zod'
import { Constants } from '@/types/supabase.generated'

/**
 * A05: esquemas de entrada de la API v1 (cuerpos y consultas). Puros, sin Next ni Supabase, para probarlos con
 * entradas hostiles. Los enums salen de los tipos generados de la BD, así no se desalinean.
 * UUID = `z.guid()` (cualquier 8-4-4-4-12 hexadecimal, como Postgres), no solo RFC 4122.
 */

const id = z.guid()
const text = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().max(max).optional()
const date = z.iso.date()
/** `a` o `A`: el contrato de siempre aceptaba la categoría en minúscula. */
const upper = <T extends readonly [string, ...string[]]>(values: T) => z.string().transform(s => s.toUpperCase()).pipe(z.enum(values))

const E = Constants.public.Enums

export const TagCreate = z.object({
  project_id: id,
  tag_number: text(120),
  subsystem_id: id,
  discipline_id: id,
  description: optionalText(2000),
  status: z.enum(E.tag_status).optional(),
})

export const ItrCreate = z.object({
  project_id: id,
  tag_id: id,
  template_id: id,
  itr_number: text(160).optional(),
  scheduled_date: date.nullable().optional(),
  phase_id: id.optional(),
})

export const PunchCreate = z.object({
  project_id: id,
  tag_id: id,
  subsystem_id: id.optional(),
  category: upper(E.punch_category),
  description: text(4000),
  priority: z.enum(E.punch_priority).optional(),
})

export const PunchTransferToOps = z.object({
  transferred_to: id,
  ops_target_date: date.nullable().optional(),
  notes: optionalText(2000).nullable(),
})

/** = estados que acepta `update_punch_ops_status`. */
export const OPS_STATUSES = ['in_progress_ops', 'deferred', 'resolved_ops', 'verified_ops', 'closed_final', 'cancelled_ops'] as const

export const PunchOpsUpdate = z.object({
  status: z.enum(OPS_STATUSES),
  notes: optionalText(2000).nullable(),
  target_date: date.nullable().optional(),
})

export const MAX_HANDOVER_SYSTEMS = 500
/** = `HandoverFormat` de src/lib/handover/generate.ts. */
export const HANDOVER_FORMATS = ['json', 'pdf', 'zip'] as const

export const HandoverExport = z.object({
  project_id: id,
  system_ids: z.array(id).max(MAX_HANDOVER_SYSTEMS).optional(),
  format: z.array(z.string().max(10).transform(s => s.toLowerCase()).pipe(z.enum(HANDOVER_FORMATS))).min(1).max(3).optional(),
})

export const MAX_SAMPLES_PER_BATCH = 5000
/** La ingesta declara su propio tope de bytes: 5000 muestras con nombre largo caben de sobra. */
export const MAX_SAMPLES_BYTES = 2 * 1024 * 1024

/**
 * Forma de cada muestra. La validez de fecha, valor y calidad la decide `ingest_signal_samples` muestra por muestra
 * (lee texto: rechazos parciales con 207 e `invalid_value` / `invalid_quality` / `invalid_timestamp`); aquí solo se
 * exige que cada muestra sea un objeto con una señal y una fecha, para que un `null` o un número no lleguen como
 * muestra.
 */
const Sample = z.object({
  signal_name: z.string().max(200).optional(),
  signal_id: z.string().max(64).optional(),
  sampled_at: z.json().optional(),
  value: z.json().optional(),
  quality: z.json().optional(),
}).refine(s => (!!s.signal_name || !!s.signal_id) && s.sampled_at != null && s.sampled_at !== '', {
  message: 'Each sample requires signal_name (or signal_id) and sampled_at',
})

export const SignalSamples = z.object({
  source: z.string().max(40).optional(),
  source_system: z.string().max(120).nullable().optional(),
  batch_id: z.string().max(200).nullable().optional(),
  project_code: z.string().max(60).optional(),
  upsert: z.boolean().optional(),
  samples: z.array(Sample).min(1).max(MAX_SAMPLES_PER_BATCH),
})

// ── Consultas (todo llega como texto) ───────────────────────────────

const optionalId = id.optional()
const projectId = { project_id: id }

export const ProjectQuery = z.object(projectId)
export const TagsQuery = z.object({ ...projectId, subsystem_id: optionalId, status: z.enum(E.tag_status).optional() })
export const ItrsQuery = z.object({ ...projectId, tag_id: optionalId })
export const PunchesQuery = z.object({ ...projectId, tag_id: optionalId })
export const CertificatesQuery = z.object({ ...projectId, subsystem_id: optionalId })
export const EventsQuery = z.object({ ...projectId, since: z.iso.datetime({ offset: true }).optional() })
