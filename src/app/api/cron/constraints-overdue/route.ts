import { hasBearerSecret } from '@/lib/security/secret-compare'
import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/cron/constraints-overdue
 *
 * Gestión diaria (fase 5, decisión §11.7): restricciones abiertas con fecha requerida vencida (día del proyecto).
 * Avisa al responsable y a quien la registró sugiriendo escalar; el escalamiento sigue siendo manual y con motivo.
 * Vuelve a avisar solo si last_overdue_notif_at es null o tiene más de 3 días (update_constraint lo reinicia).
 *
 * S20 (B-21): todo en una función SQL (`notify_constraints_overdue`, solo service_role): filtra, deduplica,
 * inserta los avisos y marca last_overdue_notif_at; devuelve { scanned, fired, inserted }.
 * Antes eran 2 peticiones por fila desde el Worker (límite de subrequests) y lotes de ids en la URL.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (!hasBearerSecret(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await createAdminClient().rpc('notify_constraints_overdue')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
