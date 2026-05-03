import { createClient } from '@/lib/supabase/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import React, { type JSXElementConstructor, type ReactElement } from 'react'
import { CertPdfDocument } from './CertPdfDocument'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; certId: string }> }
) {
  const { id: projectId, certId } = await params

  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Fetch certificate with all related data
  const { data: cert, error } = await supabase
    .from('certificates')
    .select(`
      id,
      certificate_number,
      title,
      status,
      issued_date,
      notes,
      created_at,
      project_phases ( code, name, color, certificate_name ),
      subsystems (
        code,
        name,
        systems ( code, name )
      ),
      issued_by_profile:profiles!certificates_issued_by_fkey ( full_name ),
      punch_exceptions (
        id,
        justification,
        approved_at,
        punches ( punch_number, description, category ),
        approved_by_profile:profiles!punch_exceptions_approved_by_fkey ( full_name )
      )
    `)
    .eq('id', certId)
    .eq('project_id', projectId)
    .single()

  if (error || !cert) {
    return new Response('Certificate not found', { status: 404 })
  }

  // Fetch project info
  const { data: project } = await supabase
    .from('projects')
    .select('code, name, client_name')
    .eq('id', projectId)
    .single()

  // Fetch approved ITRs linked to this certificate's subsystem+phase
  const { data: itrs } = await supabase
    .from('itrs')
    .select(`
      id,
      itr_number,
      status,
      progress_pct,
      itr_templates ( code, title ),
      tags ( tag_number, description )
    `)
    .eq('project_id', projectId)
    .eq('subsystem_id', (cert.subsystems as unknown as { id?: string } | null)?.id ?? '')
    .eq('phase_id', (cert.project_phases as unknown as { id?: string } | null)?.id ?? '')
    .eq('status', 'approved')

  // Fetch digital signatures
  const { data: signatures } = await supabase
    .from('certificate_signatures')
    .select(`
      id, role, signed_at, comments,
      signer_profile:profiles!user_id ( full_name )
    `)
    .eq('certificate_id', certId)
    .order('signed_at')

  const certData = {
    ...cert,
    projectName: project?.name ?? '',
    projectCode: project?.code ?? '',
    projectClient: project?.client_name ?? null,
    exceptions: (cert.punch_exceptions as unknown as typeof cert.punch_exceptions) ?? [],
    itrs: itrs ?? [],
    signatures: signatures ?? [],
  }

  // Generate PDF
  const element = React.createElement(CertPdfDocument, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cert: certData as any,
  }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>
  const buffer = await renderToBuffer(element)

  const filename = `CERT-${cert.certificate_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
