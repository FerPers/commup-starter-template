import { getActiveMembership } from '@/lib/supabase/membership'
import { evaluateEligibility } from '@/lib/certificates/eligibility'
import { redirect, notFound } from 'next/navigation'
import CertificatesView from './CertificatesView'

export default async function CertificatesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const [
    { data: project },
    { data: phases },
    { data: subsystems },
    { data: itrs },
    { data: openPunches },
    { data: certificates },
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
    supabase
      .from('subsystems')
      .select('id, code, name, system_id, systems(id, code, name)')
      .eq('project_id', projectId)
      .order('code'),
    supabase
      .from('itrs')
      .select('id, status, subsystem_id, phase_id')
      .eq('project_id', projectId),
    supabase
      .from('punches')
      .select('id, punch_number, description, subsystem_id, category, status')
      .eq('project_id', projectId)
      .not('status', 'in', '(closed,cancelled)'),
    supabase
      .from('certificates')
      .select('id, subsystem_id, phase_id, certificate_number, title, status, issued_date, issued_by')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
  ])

  if (!project) notFound()

  // ── Compute eligibility per subsystem × phase server-side ─────────────
  type CertRow = {
    id: string
    certificate_number: string
    title: string
    status: string
    issued_date: string | null
  }

  type PhaseEligibility = {
    phaseId: string
    totalItrs: number
    approvedItrs: number
    openCatA: number
    openCatBPunches: { id: string; punch_number: string; description: string }[]
    certificate: CertRow | null
    eligible: 'green' | 'yellow' | 'red'
  }

  type SubsystemRow = {
    id: string
    code: string
    name: string
    system: { id: string; code: string; name: string } | null
    phaseData: PhaseEligibility[]
  }

  const subsystemRows: SubsystemRow[] = (subsystems ?? []).map(ss => {
    const phaseData = (phases ?? []).map(phase => {
      const ssItrs = (itrs ?? []).filter(i => i.subsystem_id === ss.id && i.phase_id === phase.id)
      const ssPunches = (openPunches ?? []).filter(p => p.subsystem_id === ss.id)
      const { totalItrs, approvedItrs, openCatA, openCatBPunches, eligible } = evaluateEligibility(ssItrs, ssPunches)

      const certificate = (certificates ?? []).find(
        c => c.subsystem_id === ss.id && c.phase_id === phase.id && c.status !== 'rejected'
      ) ?? null

      return { phaseId: phase.id, totalItrs, approvedItrs, openCatA, openCatBPunches, certificate, eligible }
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

  const canEdit = ['owner', 'admin', 'architect', 'leader'].includes(membership.role)

  return (
    <CertificatesView
      projectId={projectId}
      projectName={project.name}
      phases={phases ?? []}
      subsystemRows={subsystemRows}
      canEdit={canEdit}
    />
  )
}
