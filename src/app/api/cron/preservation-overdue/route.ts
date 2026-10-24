import { hasBearerSecret } from '@/lib/security/secret-compare'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withCronHeartbeat } from '@/lib/cron/heartbeat'

/**
 * POST /api/cron/preservation-overdue
 *
 * Planes de preservación activos con `next_due_date` anterior a hoy del proyecto (projects.timezone): un aviso
 * `preservation_overdue` al responsable, a lo sumo uno por plan y día del proyecto.
 *
 * S20 (B-21): todo en una función SQL (`notify_preservation_overdue`, solo service_role): filtra, deduplica,
 * inserta los avisos y devuelve { scanned, inserted, skipped }.
 * Antes eran 2 peticiones por fila desde el Worker (límite de subrequests) y lotes de ids en la URL.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
async function handler(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (!hasBearerSecret(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await createAdminClient().rpc('notify_preservation_overdue')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// A15: cada corrida deja su latido (página de salud y alertas).
export const POST = withCronHeartbeat('preservation-overdue', handler)
