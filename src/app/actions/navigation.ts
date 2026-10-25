'use server'

import { withAuth } from '@/lib/auth/withAuth'
import { pickOpenPhase, type MenuPhase } from '@/lib/navigation/menu'
import { isDone, nextGate } from '@/lib/readiness/matrix'
import type { MatrixGate } from '@/lib/readiness/gates'
import { fromJson } from '@/lib/supabase/casts'

/**
 * A19 · C (D1/D2, Luis 2026-10-25): fases de la org para el menú del proyecto. Una por gate activo con fase, con
 * cuántos sistemas lo tienen liberado y vigente, y la que se abre por defecto (la liberación siguiente de más
 * sistemas). Lee la matriz guardada (`system_gate_status`, una fila por sistema; RLS de miembros), sin recalcular.
 */
export const getMenuPhases = withAuth(
  { guards: [{ resource: 'project', field: 'projectId' }] },
  async (ctx, input: { projectId: string }): Promise<{ phases: MenuPhase[]; openGateId: string | null }> => {
    const db = ctx.supabase
    const [{ data: gates }, { data: status }] = await Promise.all([
      db.from('readiness_gates').select('id, code, name, order_index, project_phases(code)')
        .eq('org_id', ctx.orgId).eq('is_active', true).not('phase_id', 'is', null).order('order_index').limit(100),
      // bounded: una fila por sistema del proyecto
      db.from('system_gate_status').select('gates').eq('project_id', input.projectId).limit(5000),
    ])
    const rows = (status ?? []).map(r => fromJson<MatrixGate[]>(r.gates ?? []))
    const phases: MenuPhase[] = (gates ?? []).flatMap(g => {
      const phaseCode = (g.project_phases as { code: string } | null)?.code
      if (!phaseCode) return []
      const approved = rows.filter(gs => gs.some(x => x.gate_id === g.id && isDone(x.status))).length
      return [{ gateId: g.id, gateCode: g.code, gateName: g.name, phaseCode, approved, total: rows.length }]
    })
    return { phases, openGateId: pickOpenPhase(phases, rows.map(gs => nextGate(gs)?.gate_id ?? null)) }
  },
)
