import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'

export const metadata = { title: 'Tag 360° — CommUp' }

// Resolver universal: acepta tag_number o id y redirige al detalle del tag
// dentro del proyecto correcto. Permite que /scan no necesite saber project_id.
export default async function Tag360Resolver({
  params,
}: {
  params: Promise<{ tagId: string }>
}) {
  const { tagId } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }

  const decoded = decodeURIComponent(tagId)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)

  // Tags están scoped por project_id, no por org_id directamente — joineamos.
  const query = supabase
    .from('tags')
    .select('id, project_id, projects!inner(id, org_id)')
    .eq('projects.org_id', membership.org_id)
    .limit(1)

  const { data: tag } = isUuid
    ? await query.eq('id', decoded).maybeSingle()
    : await query.eq('tag_number', decoded).maybeSingle()

  if (!tag) notFound()

  redirect(`/projects/${tag.project_id}/tags/${tag.id}`)
}
