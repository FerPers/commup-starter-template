'use server'

import { revalidatePath } from 'next/cache'
import { ADMIN_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'

// Planificación por readiness (fase 5 plan readiness, sesión 2). Escritura por RPC SECURITY DEFINER
// (migración 20261017150000): forecast (cualquier no-client), compromiso (líderes+, motivo al cambiar)
// y pesos de gate (owner/admin). Aquí: guards del wrapper, validación de fechas y revalidación.

const systemGuards = [
  { resource: 'project' as const, field: 'projectId' },
  { resource: 'system' as const, field: 'systemId', scopeField: 'projectId' },
]
const ISO = /^\d{4}-\d{2}-\d{2}$/

function revalidate(projectId: string, systemId?: string) {
  revalidatePath(`/projects/${projectId}/daily`)
  revalidatePath('/control-tower')
  if (systemId) revalidatePath(`/control-tower/${systemId}`)
}

type DateInput = { projectId: string; systemId: string; gateId: string; date: string | null; reason?: string }

function badDate(date: string | null): string | null {
  return date !== null && !ISO.test(date) ? 'Fecha no válida' : null
}

// Los tipos generados no admiten null en p_date, aunque SQL sí (null = quitar la fecha).
const nullableDate = (v: string | null) => v as unknown as string

export const setGateForecast = withAuth(
  { guards: systemGuards },
  async (ctx, input: DateInput): Promise<{ error?: string }> => {
    const bad = badDate(input.date)
    if (bad) return { error: bad }
    const { error } = await ctx.supabase.rpc('set_gate_forecast', {
      p_system_id: input.systemId, p_gate_id: input.gateId, p_date: nullableDate(input.date),
      p_note: input.reason?.trim() ? input.reason.trim().slice(0, 2000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.systemId)
    return {}
  },
)

export const setGateCommitment = withAuth(
  { guards: systemGuards },
  async (ctx, input: DateInput): Promise<{ error?: string }> => {
    const bad = badDate(input.date)
    if (bad) return { error: bad }
    const { error } = await ctx.supabase.rpc('set_gate_commitment', {
      p_system_id: input.systemId, p_gate_id: input.gateId, p_date: nullableDate(input.date),
      p_reason: input.reason?.trim() ? input.reason.trim().slice(0, 2000) : undefined,
    })
    if (error) return { error: error.message }
    revalidate(input.projectId, input.systemId)
    return {}
  },
)

/**
 * Guarda en bloque lo que cambió en la grilla del look-ahead. Cada cambio pasa por su RPC (mismas reglas);
 * se detiene en el primer error y devuelve cuántos se guardaron.
 */
export const saveGatePlanBatch = withAuth(
  { guards: [{ resource: 'project' as const, field: 'projectId' }] },
  async (
    ctx,
    input: {
      projectId: string
      changes: { systemId: string; gateId: string; field: 'forecast' | 'commitment'; date: string | null; reason?: string }[]
    },
  ): Promise<{ saved: number; error?: string }> => {
    const changes = (input.changes ?? []).slice(0, 500)
    const systemIds = [...new Set(changes.map(c => c.systemId))]
    if (systemIds.length > 0) {
      const { data } = await ctx.supabase.from('systems').select('id').eq('project_id', input.projectId).in('id', systemIds)
      if ((data ?? []).length !== systemIds.length) return { saved: 0, error: 'Hay sistemas que no pertenecen al proyecto' }
    }
    let saved = 0
    for (const c of changes) {
      const bad = badDate(c.date)
      if (bad) return { saved, error: bad }
      const reason = c.reason?.trim() ? c.reason.trim().slice(0, 2000) : undefined
      const { error } = c.field === 'forecast'
        ? await ctx.supabase.rpc('set_gate_forecast', { p_system_id: c.systemId, p_gate_id: c.gateId, p_date: nullableDate(c.date), p_note: reason })
        : await ctx.supabase.rpc('set_gate_commitment', { p_system_id: c.systemId, p_gate_id: c.gateId, p_date: nullableDate(c.date), p_reason: reason })
      if (error) { revalidate(input.projectId); return { saved, error: error.message } }
      saved++
    }
    revalidate(input.projectId)
    return { saved }
  },
)

/** Pesos de los gates de la org (null = partes iguales). */
export const setGateWeights = withAuthOnly(
  { role: ADMIN_ROLES },
  async (ctx, input: { weights: { gateId: string; weight: number | null }[] }): Promise<{ error?: string }> => {
    const weights = (input.weights ?? []).slice(0, 100)
    if (weights.some(w => w.weight !== null && (!Number.isFinite(w.weight) || w.weight < 0 || w.weight > 1000))) {
      return { error: 'Peso fuera de rango (0–1000)' }
    }
    const { error } = await ctx.supabase.rpc('set_gate_weights', {
      p_org_id: ctx.orgId,
      p_weights: weights.map(w => ({ gate_id: w.gateId, weight: w.weight })),
    })
    if (error) return { error: error.message }
    revalidatePath('/admin/gates')
    revalidatePath('/control-tower', 'layout')
    return {}
  },
)
