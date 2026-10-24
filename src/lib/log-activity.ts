import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/supabase.generated'

interface LogInput {
  orgId: string
  userId: string
  entityType: string
  entityId?: string
  action: string
  payload?: { [key: string]: Json | undefined }
}

export async function logActivity(supabase: SupabaseClient<Database>, input: LogInput) {
  // Fire-and-forget — don't throw if it fails
  await supabase
    .from('activity_log')
    .insert({
      org_id: input.orgId,
      user_id: input.userId,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      payload: input.payload ?? null,
    })
    .then(
      () => {},
      (err) => console.error('[activity_log]', err),
    )
}
