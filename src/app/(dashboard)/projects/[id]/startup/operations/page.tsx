import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { currentLevel, transferNonDispensable, type OwnershipStage, type SpareStatus } from '@/lib/startup/catalog'
import { todayIso } from '@/lib/daily/catalog'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'
import OperationsView, { type CompetencyRecordRow } from './OperationsView'
import { getTranslations } from 'next-intl/server'
import PartialNote from '@/components/ui/PartialNote'
import { ROLE_TIERS } from '@/lib/constants/roles'

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

  // S09 (E-20): PostgREST corta en 1000 filas. competency_records con .limit(10000) y sin orden devolvía un
  // subconjunto arbitrario y el «nivel vigente = última evaluación» podía salir de una evaluación vieja; se lee
  // completo (y el historial de traspasos también).
  const [{ data: systems }, { data: ownership }, transfersRes, { data: people }, recordsRes, { data: targets }, { data: spares }, { data: members }, { data: companies }, { data: org }] = await Promise.all([
    supabase.from('systems').select('id, code, name').eq('project_id', id).order('code'),
    supabase.from('system_ownership').select('system_id, stage, since').eq('project_id', id),
    fetchAllRowsFlagged(() => supabase.from('ownership_transfers').select('id, number, system_id, from_stage, to_stage, is_reversal, status, requested_at, completed_at')
      .eq('project_id', id).order('seq', { ascending: false })),
    supabase.from('ops_personnel').select('id, full_name, company, position, shift, user_id, active').eq('project_id', id).order('full_name'),
    fetchAllRowsFlagged(() => supabase.from('competency_records').select('id, person_id, system_id, level, assessed_at, created_at, expires_at, assessed_by, voided_at, void_reason')
      .eq('project_id', id), { maxRows: 200_000 }),
    supabase.from('system_competency_targets').select('system_id, required').eq('project_id', id),
    supabase.from('critical_spares').select('id, system_id, kind, item, part_number, is_critical, qty_required, qty_available, status, eta, notes')
      .eq('project_id', id).order('item'),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
    supabase.from('companies').select('name').eq('org_id', ctx.orgId).eq('is_active', true).order('name'),
    supabase.from('organizations').select('settings').eq('id', ctx.orgId).single(),
  ])

  const transfers = transfersRes.rows
  const records = recordsRes.rows
  const today = todayIso()
  type Rec = (typeof records)[number]
  const byCell = new Map<string, Rec[]>()
  for (const r of records) {
    const k = `${r.person_id}:${r.system_id}`
    const list = byCell.get(k)
    if (list) list.push(r)
    else byCell.set(k, [r])
  }
  // Celda: nivel vigente + último nivel registrado (para pintar en gris una evaluación vencida).
  const levels: Record<string, { level: number; last: number; expired: boolean; expiresAt: string | null }> = {}
  // S25 (E-12): historial por celda (con anuladas) para anular un registro erróneo.
  const history: Record<string, CompetencyRecordRow[]> = {}
  for (const [k, rs] of byCell) {
    const sorted = [...rs].sort((a, b) => b.assessed_at.localeCompare(a.assessed_at) || b.created_at.localeCompare(a.created_at))
    history[k] = sorted.map(r => ({ id: r.id, level: r.level, assessed_at: r.assessed_at, expires_at: r.expires_at, assessed_by: r.assessed_by, voided: !!r.voided_at, void_reason: r.void_reason }))
    const last = sorted.find(r => !r.voided_at)
    if (!last) continue
    const lvl = currentLevel(rs, today)
    levels[k] = { level: lvl, last: last.level, expired: !!last.expires_at && last.expires_at < today, expiresAt: last.expires_at }
  }
  // S25 (E-12): la BD deja evaluar también a quien tiene nivel 4 en el sistema (ficha vinculada a su usuario).
  const myPeople = (people ?? []).filter(p => p.user_id === ctx.userId && p.active).map(p => p.id)
  const trainerSystems = (systems ?? []).filter(s => myPeople.some(pid => levels[`${pid}:${s.id}`]?.level === 4 && !levels[`${pid}:${s.id}`]?.expired)).map(s => s.id)

  const tl = await getTranslations('Common')
  return (
    <>
    {recordsRes.truncated && (
      <PartialNote>{tl('listPartial')}</PartialNote>
    )}
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
      transfers={transfers.map(x => ({ ...x, from_stage: x.from_stage as OwnershipStage, to_stage: x.to_stage as OwnershipStage }))}
      people={people ?? []}
      companies={(companies ?? []).map(c => c.name)}
      levels={levels}
      spares={(spares ?? []).map(s => ({ ...s, kind: s.kind as 'spare' | 'special_tool', status: s.status as SpareStatus, qty_required: Number(s.qty_required), qty_available: Number(s.qty_available) }))}
      members={(members ?? []).map(m => ({ id: m.user_id, name: (m.profiles as unknown as { full_name: string | null } | null)?.full_name ?? '—' }))}
      canEdit={ctx.role !== 'client'}
      canAssess={ROLE_TIERS.editor.includes(ctx.role)}
      canRequest={ROLE_TIERS.editor.includes(ctx.role)}
      trainerSystems={trainerSystems}
      nonDispensable={transferNonDispensable(org?.settings)}
      history={history}
      userId={ctx.userId}
    />
    </>
  )
}
