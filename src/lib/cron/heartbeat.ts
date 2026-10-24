import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Nombres de los crons HTTP (= `http_jobs` de platform_health_checks y los pasos de .github/workflows/cron.yml). */
export const HTTP_CRON_JOBS = ['push-dispatch', 'snapshot', 'preservation-overdue', 'pssr-review-overdue', 'constraints-overdue'] as const
export type HttpCronJob = typeof HTTP_CRON_JOBS[number]

/**
 * A15: envuelve una ruta /api/cron/* para dejar su latido en `cron_heartbeats` (record_cron_run). Un 401 no cuenta
 * (no es una corrida); un 5xx o una excepción quedan como corrida fallida. Si el registro falla, el cron sigue: la
 * página de salud lo verá como atrasado.
 */
export function withCronHeartbeat(job: HttpCronJob, handler: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest): Promise<Response> => {
    let res: Response
    try {
      res = await handler(req)
    } catch (e) {
      await record(job, false, e instanceof Error ? e.message : String(e))
      throw e
    }
    if (res.status === 401) return res
    if (res.status >= 500) await record(job, false, await res.clone().text().catch(() => `HTTP ${res.status}`))
    else await record(job, true, null)
    return res
  }
}

async function record(job: HttpCronJob, ok: boolean, error: string | null) {
  try {
    const { error: rpcError } = await createAdminClient().rpc('record_cron_run', { p_job: job, p_ok: ok, ...(error ? { p_error: error.slice(0, 500) } : {}) })
    if (rpcError) console.error(`[cron-heartbeat] ${job}: ${rpcError.message}`)
  } catch (e) {
    console.error(`[cron-heartbeat] ${job}:`, e)
  }
}
