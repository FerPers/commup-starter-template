import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'
import { isAiConfigured } from '@/lib/ai/claude'
import type { ReportData } from '@/lib/daily/report'
import ReportEditor from './ReportEditor'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { fromJson } from '@/lib/supabase/casts'

// Editor de un reporte diario (fase 5, sesión 3): 5 secciones editables a la izquierda, datos congelados
// del día a la derecha; emitir lo congela con hash y el PDF se regenera desde estos datos.
export default async function DailyReportPage({ params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, name, timezone').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()
  const { data: r } = await supabase.from('daily_reports').select('*').eq('id', reportId).eq('project_id', id).maybeSingle()
  if (!r) notFound()
  const [{ data: later }, { data: members }] = await Promise.all([
    supabase.from('daily_reports').select('id, number').eq('project_id', id).eq('report_date', r.report_date).gt('revision', r.revision).order('revision').limit(1),
    supabase.from('org_members').select('user_id, profiles(full_name)').eq('org_id', ctx.orgId),
  ])
  const names: Record<string, string> = {}
  for (const m of members ?? []) {
    const p = m.profiles
    if (p?.full_name) names[m.user_id] = p.full_name
  }

  return (
    <ReportEditor
      project={project}
      report={{
        id: r.id, number: r.number, date: r.report_date, revision: r.revision, status: r.status as 'draft' | 'issued' | 'superseded',
        data: fromJson<ReportData>(r.data), dataAt: r.data_at, revisionReason: r.revision_reason,
        sections: { summary: r.summary ?? '', key_events: r.key_events ?? '', issues: r.issues ?? '', constraints: r.constraints_text ?? '', next_day_plan: r.next_day_plan ?? '' },
        aiGeneratedAt: r.ai_generated_at, aiModel: r.ai_model,
        issuedBy: r.issued_by ? names[r.issued_by] ?? null : null, issuedAt: r.issued_at, hash: r.content_hash,
        laterRevision: later?.[0] ?? null,
      }}
      canEdit={ctx.role !== 'client'}
      canIssue={ROLE_TIERS.editor.includes(ctx.role)}
      canDelete={r.created_by === ctx.userId || ROLE_TIERS.admin.includes(ctx.role)}
      aiConfigured={isAiConfigured()}
    />
  )
}
