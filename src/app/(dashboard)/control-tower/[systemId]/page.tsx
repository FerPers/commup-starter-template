import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'

// N2a: la ficha de sistema es una sola (/projects/[id]/systems/[systemId], pestaña Gates). Esta ruta queda para
// los avisos y enlaces viejos (`gate_cosign`, gates listos o en regresión) y redirige conservando `?gate=`.
export default async function LegacySystemGatesPage({ params, searchParams }: {
  params: Promise<{ systemId: string }>
  searchParams: Promise<{ gate?: string }>
}) {
  const [{ systemId }, { gate }] = await Promise.all([params, searchParams])
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const { data: system } = await ctx.supabase.from('systems').select('id, project_id').eq('id', systemId).maybeSingle()
  if (!system) notFound()
  redirect(`/projects/${system.project_id}/systems/${system.id}${gate ? `?gate=${encodeURIComponent(gate)}` : ''}`)
}
