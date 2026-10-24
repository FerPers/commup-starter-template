import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'
import { fromJson } from '@/lib/supabase/casts'
import { assignmentDbError } from '@/lib/i18n/action-errors'
import type { SigningRole } from './signatures'

/**
 * A03: alta de un ITR con sus firmantes en una sola transacción (RPC `create_itr`). El `id` es la clave idempotente:
 * repetir la solicitud devuelve el ITR original con `created: false` (no se notifica otra vez). Solo servidor.
 */
export type CreateItrArgs = {
  id: string
  projectId: string
  tagId: string
  subsystemId: string
  templateId: string
  baseNumber: string
  signers: Partial<Record<SigningRole, string>>
  scheduledDate?: string | null
  loopId?: string | null
  ceCauseId?: string | null
}

export type CreatedItr = { id: string; itr_number: string; created: boolean }

export async function createItrRecord(supabase: SupabaseClient<Database>, a: CreateItrArgs): Promise<CreatedItr | { error: string }> {
  const { data, error } = await supabase.rpc('create_itr', {
    p_id: a.id, p_project_id: a.projectId, p_tag_id: a.tagId, p_subsystem_id: a.subsystemId, p_template_id: a.templateId,
    p_itr_number: a.baseNumber, p_assignments: a.signers,
    p_scheduled_date: a.scheduledDate ?? undefined, p_loop_id: a.loopId ?? undefined, p_ce_cause_id: a.ceCauseId ?? undefined,
  })
  if (error) return { error: await assignmentDbError(error.message) }
  return fromJson<CreatedItr>(data)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * Id estable de cada ITR de un lote (lazos, causas C&E): la misma solicitud (`requestId`) y la misma fuente dan el
 * mismo id, así reintentar el lote no crea revisiones nuevas.
 */
export function batchItrId(requestId: string, sourceKey: string): string {
  const h = createHash('sha256').update(`${requestId.toLowerCase()}:${sourceKey}`).digest('hex')
  // Formato UUID (versión 8 = id propio, variante RFC 4122).
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`
}
