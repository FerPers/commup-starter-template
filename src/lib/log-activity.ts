import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, TablesInsert } from '@/types/supabase.generated'
import { createAdminClient } from '@/lib/supabase/admin'

interface LogInput {
  orgId: string
  userId: string
  entityType: string
  entityId?: string
  action: string
  payload?: { [key: string]: Json | undefined }
}

export type LogResult = { ok: true } | { ok: false; error: string }

/**
 * Registro de auditoría en `activity_log` después de un cambio de negocio que ya se confirmó (no es transaccional:
 * una decisión crítica debe auditarse dentro de su RPC).
 *
 * A09 (revisión 2026-10-23 hallazgo 8): antes un `{ error }` de Supabase se perdía en silencio (el `.then` solo
 * cubría el rechazo de la promesa). Ahora:
 *   1. se revisa el error;
 *   2. un fallo se reintenta una vez con la cuenta de servicio (misma fila y mismo autor: `userId` viene de la
 *      sesión del servidor, nunca del cliente), que cubre un corte de red o una política RLS que no alcanzó;
 *   3. si también falla, se deja el registro completo en el log del Worker (`[activity_log] LOST`) y se devuelve
 *      `{ ok: false }` para quien deba avisar. Nunca lanza: el cambio de negocio ya ocurrió.
 */
export async function logActivity(supabase: SupabaseClient<Database>, input: LogInput): Promise<LogResult> {
  const row: TablesInsert<'activity_log'> = {
    org_id: input.orgId,
    user_id: input.userId,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    action: input.action,
    payload: input.payload ?? null,
  }
  const first = await insert(supabase, row)
  if (!first) return { ok: true }

  let retry: string | null
  try {
    retry = await insert(createAdminClient(), row)
  } catch (err) {
    retry = err instanceof Error ? err.message : String(err)
  }
  if (!retry) {
    console.warn('[activity_log] retried with service role', JSON.stringify({ error: first, action: row.action, entity: row.entity_type, entityId: row.entity_id }))
    return { ok: true }
  }
  console.error('[activity_log] LOST', JSON.stringify({ error: first, retryError: retry, row }))
  return { ok: false, error: retry }
}

/** null = escrito; si no, el mensaje del error (devuelto o lanzado). */
async function insert(db: SupabaseClient<Database>, row: TablesInsert<'activity_log'>): Promise<string | null> {
  try {
    const { error } = await db.from('activity_log').insert(row)
    return error ? error.message : null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
