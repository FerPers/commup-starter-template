import { type NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { sanitizeRow } from '@/lib/excel/sanitize'
import { getActiveMembership } from '@/lib/supabase/membership'
import { fetchAllRows, TruncatedError } from '@/lib/list/fetch-all'

export async function GET(req: NextRequest) {
  // I-22 (S02): la org ACTIVA (cookie), no la primera membresía; y lectura completa por lotes.
  const ctx = await getActiveMembership()
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }
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

  // Fetch all data in parallel (por lotes: PostgREST corta en 1000 filas)
  // S09 (B-08): fetchAllRows ordena por id y falla (en vez de cortar) si se supera el tope.
  let data
  try {
    data = await Promise.all([
    fetchAllRows(() => supabase
      .from('tags')
      .select('tag_number, description, status, subsystems(code), disciplines(code), equipment_types(name)')
      .eq('project_id', projectId)),
    fetchAllRows(() => supabase
      .from('itrs')
      .select('itr_number, status, progress_pct, scheduled_date, itr_templates(code, title), tags(tag_number)')
      .eq('project_id', projectId)),
    fetchAllRows(() => supabase
      .from('punches')
      .select('punch_number, category, description, status, priority, created_at, closed_date, tags(tag_number)')
      .eq('project_id', projectId)),
    fetchAllRows(() => supabase
      .from('preservation_plans')
      .select('tags(tag_number), preservation_procedures(title, frequency), status, next_due_date')
      .eq('project_id', projectId)),
    fetchAllRows(() => supabase
      .from('certificates')
      .select('certificate_number, title, status, issued_date, subsystems(code)')
      .eq('project_id', projectId)),
    ])
  } catch (err) {
    if (err instanceof TruncatedError) return NextResponse.json({ error: err.message }, { status: 413 })
    throw err
  }
  const [tags, itrs, punches, preservation, certificates] = data

  const wb = XLSX.utils.book_new()

        
  // ── Tags sheet ──────────────────────────────────────────────
  const tagsRows = (tags ?? []).map(t => ({
    'Tag Number': t.tag_number,
    Description: t.description ?? '',
    Status: t.status,
    Subsystem: t.subsystems?.code ?? '',
    Discipline: t.disciplines?.code ?? '',
    'Equipment Type': t.equipment_types?.name ?? '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tagsRows.map(sanitizeRow)), 'Tags')

  // ── ITRs sheet ──────────────────────────────────────────────
  const itrsRows = (itrs ?? []).map(i => ({
    'ITR Number': i.itr_number,
    Template: i.itr_templates?.code ?? '',
    'Template Title': i.itr_templates?.title ?? '',
    Tag: i.tags?.tag_number ?? '',
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
    Tag: p.tags?.tag_number ?? '',
    'Raised At': p.created_at ? new Date(p.created_at).toLocaleDateString() : '',
    'Closed Date': p.closed_date ?? '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(punchRows.map(sanitizeRow)), 'Punches')

  // ── Preservation sheet ──────────────────────────────────────
  const preservRows = (preservation ?? []).map(p => ({
    Tag: p.tags?.tag_number ?? '',
    Procedure: p.preservation_procedures?.title ?? '',
    Status: p.status,
    Frequency: p.preservation_procedures?.frequency ?? '',
    'Next Due Date': p.next_due_date ?? '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(preservRows.map(sanitizeRow)), 'Preservation')

  // ── Certificates sheet ──────────────────────────────────────
  const certRows = (certificates ?? []).map(c => ({
    'Certificate Number': c.certificate_number,
    Title: c.title,
    Status: c.status,
    'Issued Date': c.issued_date ?? '',
    Subsystem: c.subsystems?.code ?? '',
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
