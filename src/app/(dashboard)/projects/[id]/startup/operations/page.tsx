import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { currentLevel, type OwnershipStage, type SpareStatus } from '@/lib/startup/catalog'
import { todayIso } from '@/lib/daily/catalog'
import OperationsView from './OperationsView'

// Readiness de operaciones (fase 6 plan readiness, sesión 3): etapa de propiedad por sistema y traspasos,
// matriz de competencias, personal de operaciones y repuestos críticos.
export default async function StartupOperationsPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { id } = await params
  const { view } = await searchParams
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [{ data: systems }, { data: ownership }, { data: transfers }, { data: people }, { data: records }, { data: targets }, { data: spares }, { data: members }] = await Promise.all([
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('system_ownership').select('system_id, stage, since').eq('project_id', id),
    supabase.from('ownership_transfers').select('id, number, system_id, from_stage, to_stage, is_reversal, status, requested_at, completed_at')
      .eq('project_id', id).order('seq', { ascending: false }).limit(1000),
    supabase.from('ops_personnel').select('id, full_name, company, position, shift, user_id, active').eq('project_id', id).order('full_name'),
    supabase.from('competency_records').select('person_id, system_id, level, assessed_at, created_at, expires_at').eq('project_id', id).limit(10000),
    supabase.from('system_competency_targets').select('system_id, required').eq('project_id', id),
    supabase.from('critical_spares').select('id, system_id, kind, item, part_number, is_critical, qty_required, qty_available, status, eta, notes')
      .eq('project_id', id).order('item'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])

  const today = todayIso()
  type Rec = NonNullable<typeof records>[number]
  const byCell = new Map<string, Rec[]>()
  for (const r of records ?? []) {
    const k = `${r.person_id}:${r.system_id}`
    byCell.set(k, [...(byCell.get(k) ?? []), r])
  }
  // Celda: nivel vigente + último nivel registrado (para pintar en gris una evaluación vencida).
  const levels: Record<string, { level: number; last: number; expired: boolean; expiresAt: string | null }> = {}
  for (const [k, rs] of byCell) {
    const last = [...rs].sort((a, b) => b.assessed_at.localeCompare(a.assessed_at) || b.created_at.localeCompare(a.created_at))[0]
    const lvl = currentLevel(rs, today)
    levels[k] = { level: lvl, last: last.level, expired: !!last.expires_at && last.expires_at < today, expiresAt: last.expires_at }
  }

  return (
    <OperationsView
      project={project}
      initialView={view === 'competency' || view === 'personnel' || view === 'spares' ? view : 'systems'}
      systems={(systems ?? []).map(s => {
        const own = (ownership ?? []).find(o => o.system_id === s.id)
        return {
          ...s, stage: (own?.stage ?? 'commissioning') as OwnershipStage, since: own?.since ?? null,
          required: (targets ?? []).find(x => x.system_id === s.id)?.required ?? 2,
        }
      })}
      transfers={(transfers ?? []).map(x => ({ ...x, from_stage: x.from_stage as OwnershipStage, to_stage: x.to_stage as OwnershipStage }))}
      people={people ?? []}
      levels={levels}
      spares={(spares ?? []).map(s => ({ ...s, kind: s.kind as 'spare' | 'special_tool', status: s.status as SpareStatus, qty_required: Number(s.qty_required), qty_available: Number(s.qty_available) }))}
      members={(members ?? []).map(m => ({ id: m.user_id, name: (m.profiles as unknown as { full_name: string | null } | null)?.full_name ?? '—' }))}
      canEdit={ctx.role !== 'client'}
      canAssess={['owner', 'admin', 'architect', 'leader'].includes(ctx.role)}
    />
  )
}
