import { getActiveMembership } from '@/lib/supabase/membership'
import {
  renderCompletionDossierPdf,
  type CompletionDossierData,
  type DossierItr,
  type DossierException,
  type DossierSignature,
} from '@/lib/pdf/completion-dossier'

export const dynamic = 'force-dynamic'

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; certId: string }> }
) {
  const { id: projectId, certId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })
  const { supabase, orgId } = ctx

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, code, client, location')
    .eq('id', projectId)
    .eq('org_id', orgId)
    .single()

  if (!project) return new Response('Project not found', { status: 404 })

  const [
    { data: cert },
    { data: exceptions },
    { data: signatures },
  ] = await Promise.all([
    supabase
      .from('certificates')
      .select(`
        id, certificate_number, title, status, issued_date,
        project_phases(id, code, name, certificate_name),
        subsystems(id, code, name, systems(code, name)),
        issued_by_profile:profiles!issued_by(full_name)
      `)
      .eq('id', certId)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('certificate_punch_exceptions')
      .select(`
        justification,
        punches(punch_number, category, status),
        approved_by_profile:profiles!approved_by(full_name)
      `)
      .eq('certificate_id', certId)
      .order('approved_at'),
    supabase
      .from('certificate_signatures')
      .select(`
        role, signed_at,
        signer_profile:profiles!user_id(full_name)
      `)
      .eq('certificate_id', certId)
      .order('signed_at'),
  ])

  if (!cert) return new Response('Certificate not found', { status: 404 })

  const phase = pickOne(cert.project_phases)
  const subsystem = pickOne(cert.subsystems)
  const system = pickOne(subsystem?.systems)
  const issuedBy = pickOne(cert.issued_by_profile)
  const subsystemId = subsystem?.id
  const phaseId = phase?.id

  const [
    { data: itrs },
    { data: punches },
  ] = await Promise.all([
    subsystemId && phaseId
      ? supabase
          .from('itrs')
          .select(`
            itr_number, status, progress_pct,
            itr_templates(code),
            tags(tag_number)
          `)
          .eq('project_id', projectId)
          .eq('subsystem_id', subsystemId)
          .eq('phase_id', phaseId)
          .order('itr_number')
      : Promise.resolve({ data: [] }),
    subsystemId
      ? supabase
          .from('punches')
          .select('category, status')
          .eq('project_id', projectId)
          .eq('subsystem_id', subsystemId)
      : Promise.resolve({ data: [] }),
  ])

  const itrRows: DossierItr[] = (itrs ?? []).map(i => {
    const tmpl = pickOne(i.itr_templates)
    const tag = pickOne(i.tags)
    return {
      number: i.itr_number,
      templateCode: tmpl?.code ?? null,
      tag: tag?.tag_number ?? null,
      status: i.status as string,
      progressPct: i.progress_pct ?? 0,
    }
  })

  const excRows: DossierException[] = (exceptions ?? []).map(e => {
    const punch = pickOne(e.punches)
    const approver = pickOne(e.approved_by_profile)
    return {
      punchNumber: punch?.punch_number ?? '—',
      category: (punch?.category ?? 'C') as 'A' | 'B' | 'C',
      status: (punch?.status ?? '') as string,
      justification: e.justification,
      approvedBy: approver?.full_name ?? null,
    }
  })

  const sigRows: DossierSignature[] = (signatures ?? []).map(s => {
    const signer = pickOne(s.signer_profile)
    return {
      role: s.role as string,
      name: signer?.full_name ?? null,
      signedAt: s.signed_at ? String(s.signed_at).slice(0, 10) : null,
    }
  })

  let openA = 0, openB = 0, openC = 0
  for (const p of punches ?? []) {
    if (p.status === 'closed' || p.status === 'cancelled') continue
    if (p.category === 'A') openA++
    else if (p.category === 'B') openB++
    else openC++
  }

  const reportData: CompletionDossierData = {
    projectName: project.name,
    projectCode: project.code,
    projectClient: project.client ?? null,
    projectLocation: project.location ?? null,
    certificateNumber: cert.certificate_number,
    certificateTitle: cert.title,
    certificateTypeName: phase?.certificate_name ?? null,
    certificateStatus: cert.status as CompletionDossierData['certificateStatus'],
    issuedDate: cert.issued_date ?? null,
    issuedBy: issuedBy?.full_name ?? null,
    phaseCode: phase?.code ?? null,
    phaseName: phase?.name ?? null,
    systemLabel: system ? `${system.code} — ${system.name}` : null,
    subsystemLabel: subsystem ? `${subsystem.code} — ${subsystem.name}` : null,
    itrs: itrRows,
    exceptions: excRows,
    signatures: sigRows,
    openPunchA: openA,
    openPunchB: openB,
    openPunchC: openC,
  }

  const bytes = await renderCompletionDossierPdf(reportData)
  const safeNum = cert.certificate_number.replace(/[^a-zA-Z0-9-]/g, '_')
  const today = new Date().toISOString().slice(0, 10)
  const filename = `dossier-${safeNum}-${today}.pdf`

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
