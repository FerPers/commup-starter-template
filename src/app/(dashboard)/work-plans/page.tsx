import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import ScopeAllRedirect from '@/components/navigation/ScopeAllRedirect'
import { legacyProject, scopeAllHref } from '@/lib/list/scope'

// N2c: la lista global es el alcance «Todos los proyectos» de la lista del proyecto; los enlaces viejos
// (Mi trabajo, avisos, widgets) siguen funcionando con sus filtros.
export default async function LegacyGlobalList({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [ctx, sp] = await Promise.all([getActiveMembership(), searchParams])
  if (!ctx) redirect('/login')
  // bounded: proyectos de la org (decenas)
  const { data: projects } = await ctx.supabase.from('projects').select('id').eq('org_id', ctx.orgId).order('code').limit(500)
  const ids = (projects ?? []).map(p => p.id)
  const params = new URLSearchParams(Object.entries(sp).filter(([, v]) => !!v) as [string, string][])
  const fromParam = legacyProject(ids, sp.project)
  if (fromParam) redirect(scopeAllHref(fromParam, 'work-plans', params))
  const t = await getTranslations('Common')
  return <ScopeAllRedirect list="work-plans" projectIds={ids} query={params.toString()} emptyText={t('noProjects')} />
}
