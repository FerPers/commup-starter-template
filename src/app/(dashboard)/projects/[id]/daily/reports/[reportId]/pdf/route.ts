import { getLocale } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { renderDailyReportPdf } from '@/lib/pdf/daily-report'
import type { ReportData } from '@/lib/daily/report'

export const dynamic = 'force-dynamic'

/** PDF del reporte diario, regenerado desde los datos congelados y las secciones (fase 5, §11.22). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })

  const [{ data: project }, { data: org }, locale] = await Promise.all([
    ctx.supabase.from('projects').select('id').eq('id', id).eq('org_id', ctx.orgId).maybeSingle(),
    ctx.supabase.from('organizations').select('name').eq('id', ctx.orgId).single(),
    getLocale(),
  ])
  if (!project) return new Response('Not found', { status: 404 })
  const { data: r } = await ctx.supabase.from('daily_reports').select('*').eq('id', reportId).eq('project_id', id).maybeSingle()
  if (!r) return new Response('Not found', { status: 404 })
  const { data: issuer } = r.issued_by
    ? await ctx.supabase.from('profiles').select('full_name').eq('id', r.issued_by).maybeSingle()
    : { data: null }

  const bytes = await renderDailyReportPdf({
    lang: locale === 'en' ? 'en' : 'es',
    orgName: org?.name ?? 'CommUp',
    number: r.number,
    revision: r.revision,
    revisionReason: r.revision_reason,
    status: r.status as 'draft' | 'issued' | 'superseded',
    data: r.data as unknown as ReportData,
    dataAt: r.data_at,
    sections: { summary: r.summary, key_events: r.key_events, issues: r.issues, constraints: r.constraints_text, next_day_plan: r.next_day_plan },
    issuedBy: issuer?.full_name ?? null,
    issuedAt: r.issued_at,
    hash: r.content_hash,
  })
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${r.number.replace(/[^\w.-]+/g, '_')}.pdf"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
