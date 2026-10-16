import { getLocale, getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { renderProcedurePdf } from '@/lib/pdf/procedure'
import { PROCEDURE_SECTIONS, type ProcedureSection } from '@/lib/startup/catalog'

export const dynamic = 'force-dynamic'

/** PDF de una revisión del procedimiento (?rev=<id>; por defecto la vigente). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; procedureId: string }> }) {
  const { id, procedureId } = await params
  const revId = new URL(req.url).searchParams.get('rev')
  const ctx = await getActiveMembership()
  if (!ctx) return new Response('Unauthorized', { status: 401 })

  const [{ data: project }, { data: org }, locale, t] = await Promise.all([
    ctx.supabase.from('projects').select('id, code').eq('id', id).eq('org_id', ctx.orgId).maybeSingle(),
    ctx.supabase.from('organizations').select('name').eq('id', ctx.orgId).single(),
    getLocale(),
    getTranslations('Startup'),
  ])
  if (!project) return new Response('Not found', { status: 404 })
  const { data: proc } = await ctx.supabase.from('procedures').select('id, number, title, kind, current_revision_id, systems(code, name)').eq('id', procedureId).eq('project_id', id).maybeSingle()
  if (!proc) return new Response('Not found', { status: 404 })
  const targetRev = revId ?? proc.current_revision_id
  const { data: rev } = targetRev
    ? await ctx.supabase.from('procedure_revisions').select('*').eq('id', targetRev).eq('procedure_id', procedureId).maybeSingle()
    : await ctx.supabase.from('procedure_revisions').select('*').eq('procedure_id', procedureId).order('rev', { ascending: false }).limit(1).maybeSingle()
  if (!rev) return new Response('Not found', { status: 404 })
  const { data: steps } = await ctx.supabase.from('procedure_steps')
    .select('ord, action, responsible, expected_value, is_hold_point, hold_capacity, stop_criteria, tags(tag_number)').eq('revision_id', rev.id).order('ord')
  const people = [rev.created_by, rev.approved_by, rev.field_verified_by].filter((x): x is string => !!x)
  const { data: profiles } = people.length ? await ctx.supabase.from('profiles').select('id, full_name').in('id', people) : { data: [] }
  const name = (u: string | null) => (u ? profiles?.find(p => p.id === u)?.full_name ?? null : null)
  const sys = proc.systems as unknown as { code: string; name: string } | null

  const bytes = await renderProcedurePdf({
    lang: locale === 'en' ? 'en' : 'es',
    orgName: org?.name ?? 'CommUp',
    projectCode: project.code,
    number: proc.number,
    title: proc.title,
    kindLabel: t(`kind.${proc.kind}`),
    system: sys ? `${sys.code} — ${sys.name}` : null,
    rev: rev.rev,
    statusLabel: t(`revStatus.${rev.status}`),
    approved: rev.status === 'approved',
    sectionLabels: Object.fromEntries(PROCEDURE_SECTIONS.map(k => [k, t(`section.${k}`)])) as Record<ProcedureSection, string>,
    sections: (rev.sections ?? {}) as Record<string, string>,
    steps: (steps ?? []).map(s => ({
      ord: s.ord, action: s.action, responsible: s.responsible, expected: s.expected_value, tag: (s.tags as unknown as { tag_number: string } | null)?.tag_number ?? null,
      hold: s.is_hold_point, capacityLabel: s.hold_capacity ? t(`capacity.${s.hold_capacity}`) : null, stop: s.stop_criteria,
    })),
    author: name(rev.created_by),
    approvedBy: name(rev.approved_by),
    approvedAt: rev.approved_at,
    fieldVerifiedBy: name(rev.field_verified_by),
    fieldVerifiedAt: rev.field_verified_at,
    walkdownNote: rev.walkdown_note,
    hash: rev.content_hash,
  })
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${project.code}-${proc.number}-R${rev.rev}.pdf"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
