import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { sanitizeRow } from '@/lib/excel/sanitize'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Sin membresía' }, { status: 403 })
  if (!['owner', 'admin'].includes(membership.role))
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId requerido' }, { status: 400 })

  // Verify project belongs to org
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, org_id')
    .eq('id', projectId)
    .single()

  if (!project || project.org_id !== membership.org_id)
    return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  // Fetch all data in parallel
  const [
    { data: tags },
    { data: itrs },
    { data: punches },
    { data: preservation },
    { data: certificates },
  ] = await Promise.all([
    supabase
      .from('tags')
      .select('tag_number, description, status, subsystems(code), disciplines(code), equipment_types(name)')
      .eq('project_id', projectId),
    supabase
      .from('itrs')
      .select('itr_number, status, progress_pct, scheduled_date, itr_templates(code, title), tags(tag_number)')
      .eq('project_id', projectId),
    supabase
      .from('punches')
      .select('punch_number, category, description, status, priority, raised_at, closed_date, tags(tag_number)')
      .eq('project_id', projectId),
    supabase
      .from('preservation_plans')
      .select('tags(tag_number), procedures(name), status, next_due_date, frequency')
      .eq('project_id', projectId),
    supabase
      .from('certificates')
      .select('certificate_number, title, status, issued_date, subsystems(code)')
      .eq('project_id', projectId),
  ])

  const wb = XLSX.utils.book_new()

  type WithCode = { code: string } | null
  type WithName = { name: string } | null
  type WithTagNumber = { tag_number: string } | null
  type WithCodeTitle = { code: string; title: string } | null

  // ── Tags sheet ──────────────────────────────────────────────
  const tagsRows = (tags ?? []).map(t => ({
    'Tag Number': t.tag_number,
    Description: t.description ?? '',
    Status: t.status,
    Subsystem: (t.subsystems as unknown as WithCode)?.code ?? '',
    Discipline: (t.disciplines as unknown as WithCode)?.code ?? '',
    'Equipment Type': (t.equipment_types as unknown as WithName)?.name ?? '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tagsRows.map(sanitizeRow)), 'Tags')

  // ── ITRs sheet ──────────────────────────────────────────────
  const itrsRows = (itrs ?? []).map(i => ({
    'ITR Number': i.itr_number,
    Template: (i.itr_templates as unknown as WithCodeTitle)?.code ?? '',
    'Template Title': (i.itr_templates as unknown as WithCodeTitle)?.title ?? '',
    Tag: (i.tags as unknown as WithTagNumber)?.tag_number ?? '',
    Status: i.status,
    'Progress %': i.progress_pct,
    'Scheduled Date': i.scheduled_date ?? '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itrsRows.map(sanitizeRow)), 'ITRs')

  // ── Punches sheet ───────────────────────────────────────────
  const punchRows = (punches ?? []).map(p => ({
    'Punch Number': p.punch_number,
    Category: p.category,
    Description: p.description,
    Status: p.status,
    Priority: p.priority ?? '',
    Tag: (p.tags as unknown as WithTagNumber)?.tag_number ?? '',
    'Raised At': p.raised_at ? new Date(p.raised_at).toLocaleDateString() : '',
    'Closed Date': p.closed_date ?? '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(punchRows.map(sanitizeRow)), 'Punches')

  // ── Preservation sheet ──────────────────────────────────────
  const preservRows = (preservation ?? []).map(p => ({
    Tag: (p.tags as unknown as WithTagNumber)?.tag_number ?? '',
    Procedure: (p.procedures as unknown as WithName)?.name ?? '',
    Status: p.status,
    Frequency: p.frequency,
    'Next Due Date': p.next_due_date ?? '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(preservRows.map(sanitizeRow)), 'Preservation')

  // ── Certificates sheet ──────────────────────────────────────
  const certRows = (certificates ?? []).map(c => ({
    'Certificate Number': c.certificate_number,
    Title: c.title,
    Status: c.status,
    'Issued Date': c.issued_date ?? '',
    Subsystem: (c.subsystems as unknown as WithCode)?.code ?? '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(certRows.map(sanitizeRow)), 'Certificates')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_export.xlsx`

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
