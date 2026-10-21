import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'

// Service role client — bypasses RLS entirely.
// ONLY use server-side in trusted server actions. Never expose to the client.
//
// S21 (B-03): `bulk` marca las peticiones de una importación masiva (cabecera x-commup-bulk). Con service role,
// `emit_domain_event` no emite un evento por fila; quien importa registra el resumen con `emitImportSummary`.
export function createAdminClient(opts?: { bulk?: string }) {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      ...(opts?.bulk ? { global: { headers: { 'x-commup-bulk': opts.bulk } } } : {}),
    }
  )
}

/** S21 (B-03): un evento `import.completed` por importación masiva (en vez de uno por fila). */
export async function emitImportSummary(
  admin: ReturnType<typeof createAdminClient>,
  args: { orgId: string; projectId: string; actorId: string; kind: string; counts: Record<string, number> },
): Promise<void> {
  const { error } = await admin.from('domain_events').insert({
    org_id: args.orgId,
    project_id: args.projectId,
    aggregate_type: 'import',
    aggregate_id: args.projectId,
    event_type: 'import.completed',
    actor_id: args.actorId,
    payload: { kind: args.kind, ...args.counts },
  })
  if (error) console.error('[emitImportSummary]', error)
}
