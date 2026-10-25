import { getActiveMembership } from '@/lib/supabase/membership'
import { evaluateEligibilityCounts, resolveCatBLimit } from '@/lib/certificates/eligibility'
import { fetchAllRows } from '@/lib/list/fetch-all'
import { fetchSubsystemPhaseItrCounts, fetchSubsystemRollup } from '@/lib/list/kpi-query'
import { redirect, notFound } from 'next/navigation'
import CertificatesView from './CertificatesView'
import AllCertificates from '../../../certificates/AllCertificates'
import ScopeToggle from '@/components/navigation/ScopeToggle'
import { isScopeAll } from '@/lib/list/scope'
import { ROLE_TIERS } from '@/lib/constants/roles'

export default async function CertificatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ scope?: string; phase?: string }>
}) {
  const [{ id: projectId }, sp] = await Promise.all([params, searchParams])

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }
  // N2c: alcance «Todos los proyectos» (antes la página global); el id del proyecto solo da el contexto del menú.
  if (isScopeAll(sp.scope)) {
    const { data: inOrg } = await supabase.from('projects').select('id').eq('id', projectId).eq('org_id', ctx.orgId).maybeSingle()
    if (!inOrg) notFound()
    return <><ScopeToggle projectId={projectId} list="certificates" all /><AllCertificates /></>
  }

  // S09 (B-02): la matriz subsistema × fase sale de conteos SQL (antes: todos los ITR y punches del
  // proyecto, cortados en 1000 filas, y un bucle subsistemas × fases × ITR en el Worker). La lista de
  // Cat B abiertos se carga completa porque el modal de emisión exige justificar cada uno.
  const [
    { data: project },
    { data: phases },
    subsystems,
    itrCounts,
    rollup,
    openCatB,
    certificates,
    { data: org },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code')
      .eq('id', projectId)
      .eq('org_id', membership.org_id)
      .single(),
    supabase
      .from('project_phases')
      .select('id, code, name, color, certificate_name, order_index')
      .eq('org_id', membership.org_id)
      .order('order_index'),
    fetchAllRows(() => supabase
      .from('subsystems')
      .select('id, code, name, system_id, systems(id, code, name)')
      .eq('project_id', projectId)
      .order('code')),
    fetchSubsystemPhaseItrCounts(supabase, projectId),
    fetchSubsystemRollup(supabase, projectId),
    fetchAllRows(() => supabase
      .from('punches')
      .select('id, punch_number, description, subsystem_id')
      .eq('project_id', projectId)
      .eq('category', 'B')
      .in('status', ['open', 'in_progress'])
      .order('punch_number')),
    fetchAllRows(() => supabase
      .from('certificates')
      .select('id, subsystem_id, phase_id, certificate_number, title, status, issued_date, issued_by, is_blocked, certificate_signatures(role)')
      .eq('project_id', projectId)
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })),
    supabase
      .from('organizations')
      .select('settings')
      .eq('id', membership.org_id)
      .single(),
  ])

  if (!project) notFound()
  const catBLimit = resolveCatBLimit(org?.settings)

  // ── Compute eligibility per subsystem × phase server-side ─────────────
  type CertRow = {
    id: string
    certificate_number: string
    title: string
    status: string
    issued_date: string | null
    is_blocked: boolean
    /** A08: firmas hechas (Emitido · firmas n/3). */
    signatures_done: number
  }

  type PhaseEligibility = {
    phaseId: string
    totalItrs: number
    approvedItrs: number
    openCatA: number
    openCatBPunches: { id: string; punch_number: string; description: string }[]
    certificate: CertRow | null
    eligible: 'green' | 'yellow' | 'red'
    catBOverLimit: boolean
    catBLimit: number | null
  }

  type SubsystemRow = {
    id: string
    code: string
    name: string
    system: { id: string; code: string; name: string } | null
    phaseData: PhaseEligibility[]
  }

  const countKey = (ssId: string, phaseId: string) => `${ssId}|${phaseId}`
  const itrByKey = new Map(itrCounts.map(c => [countKey(c.subsystem_id, c.phase_id), c]))
  const catBBySubsystem = new Map<string, { id: string; punch_number: string; description: string }[]>()
  for (const p of openCatB) {
    if (!p.subsystem_id) continue
    const list = catBBySubsystem.get(p.subsystem_id) ?? []
    list.push({ id: p.id, punch_number: p.punch_number, description: p.description })
    catBBySubsystem.set(p.subsystem_id, list)
  }
  // El más reciente no rechazado por (subsistema, fase); vienen ordenados por created_at desc.
  const certByKey = new Map<string, CertRow>()
  for (const c of certificates) {
    if (!c.subsystem_id || !c.phase_id) continue
    const k = countKey(c.subsystem_id, c.phase_id)
    if (!certByKey.has(k)) certByKey.set(k, { ...c, signatures_done: c.certificate_signatures?.length ?? 0 })
  }

  const subsystemRows: SubsystemRow[] = subsystems.map(ss => {
    const phaseData = (phases ?? []).map(phase => {
      const counts = itrByKey.get(countKey(ss.id, phase.id))
      const { totalItrs, approvedItrs, openCatA, openCatBPunches, eligible, catBOverLimit } = evaluateEligibilityCounts({
        totalItrs: counts?.itr_total ?? 0,
        approvedItrs: counts?.itr_approved ?? 0,
        openCatA: rollup.get(ss.id)?.open_punches_a ?? 0,
        openCatBPunches: catBBySubsystem.get(ss.id) ?? [],
      }, catBLimit)
      const certificate = certByKey.get(countKey(ss.id, phase.id)) ?? null

      return { phaseId: phase.id, totalItrs, approvedItrs, openCatA, openCatBPunches, certificate, eligible, catBOverLimit, catBLimit }
    })

    const sysRel = (ss as { systems: unknown }).systems
    const sysItem = Array.isArray(sysRel) ? (sysRel[0] ?? null) : (sysRel ?? null)
    return {
      id: ss.id,
      code: ss.code,
      name: ss.name,
      system: sysItem as { id: string; code: string; name: string } | null,
      phaseData,
    }
  })

  const canEdit = ROLE_TIERS.editor.includes(membership.role)

  return (
    <>
    <ScopeToggle projectId={projectId} list="certificates" all={false} />
    <CertificatesView
      projectId={projectId}
      projectName={project.name}
      phases={phases ?? []}
      subsystemRows={subsystemRows}
      canEdit={canEdit}
      initialPhaseCode={sp.phase}
    />
    </>
  )
}
