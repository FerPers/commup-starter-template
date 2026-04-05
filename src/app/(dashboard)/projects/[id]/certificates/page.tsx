import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import CertificatesView from './CertificatesView'

export default async function CertificatesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')

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
      const totalItrs = ssItrs.length
      const approvedItrs = ssItrs.filter(i => i.status === 'approved').length
      const ssPunches = (openPunches ?? []).filter(p => p.subsystem_id === ss.id)
      const openCatA = ssPunches.filter(p => p.category === 'A').length
      const openCatBPunches = ssPunches
        .filter(p => p.category === 'B')
        .map(p => ({ id: p.id, punch_number: p.punch_number, description: p.description }))

      let eligible: 'green' | 'yellow' | 'red'
      if (openCatA > 0 || totalItrs === 0 || approvedItrs < totalItrs) {
        eligible = 'red'
      } else if (openCatBPunches.length > 0) {
        eligible = 'yellow'
      } else {
        eligible = 'green'
      }

      const certificate = (certificates ?? []).find(
        c => c.subsystem_id === ss.id && c.phase_id === phase.id && c.status !== 'rejected'
      ) ?? null

      return { phaseId: phase.id, totalItrs, approvedItrs, openCatA, openCatBPunches, certificate, eligible }
    })

    return {
      id: ss.id,
      code: ss.code,
      name: ss.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      system: (ss as any).systems ?? null,
      phaseData,
    }
  })

  const canEdit = ['owner', 'admin', 'architect', 'leader'].includes(membership.role)

  return (
    <CertificatesView
      projectId={projectId}
      projectName={project.name}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      phases={(phases ?? []) as any}
      subsystemRows={subsystemRows as any}
      canEdit={canEdit}
    />
  )
}
