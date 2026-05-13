import { createClient } from '@/lib/supabase/server'
import { renderCertificatePdf, type CertPdfData } from '@/lib/pdf/certificate'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; certId: string }> }
) {
  const { id: projectId, certId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const [
    { data: cert, error: certErr },
    { data: project },
    { data: exceptions },
    { data: signatures },
  ] = await Promise.all([
    supabase
      .from('certificates')
      .select(`
        id, certificate_number, title, status,
        issued_date, notes, created_at,
        project_phases(id, code, name, color, certificate_name),
        subsystems(id, code, name, systems(id, code, name)),
        issued_by_profile:profiles!issued_by(full_name)
      `)
      .eq('id', certId)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('projects')
      .select('code, name, client')
      .eq('id', projectId)
      .single(),
    supabase
      .from('certificate_punch_exceptions')
      .select(`
        id, justification, approved_at,
        punches(punch_number, description, category),
        approved_by_profile:profiles!approved_by(full_name)
      `)
      .eq('certificate_id', certId)
      .order('approved_at'),
    supabase
      .from('certificate_signatures')
      .select(`
        id, role, signed_at, comments,
        signer_profile:profiles!user_id(full_name)
      `)
      .eq('certificate_id', certId)
      .order('signed_at'),
  ])

  if (certErr || !cert) {
    return new Response('Certificate not found', { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subsystemId = (cert as any).subsystems?.id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phaseId = (cert as any).project_phases?.id

  const { data: itrs } = subsystemId && phaseId
    ? await supabase
        .from('itrs')
        .select(`
          id, itr_number, status, progress_pct,
          itr_templates(code, title),
          tags(tag_number, description)
        `)
        .eq('project_id', projectId)
        .eq('subsystem_id', subsystemId)
        .eq('phase_id', phaseId)
        .eq('status', 'approved')
    : { data: [] }

  const certData: CertPdfData = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(cert as any),
    projectName: project?.name ?? '',
    projectCode: project?.code ?? '',
    projectClient: project?.client ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exceptions: (exceptions ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    itrs: (itrs ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signatures: (signatures ?? []) as any,
  }

  const bytes = await renderCertificatePdf(certData)
  const filename = `CERT-${cert.certificate_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
