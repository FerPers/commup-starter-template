import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  getDataQualitySummary,
  listDataQualityIssues,
  listBottlenecks,
  type DQSeverity,
} from '@/app/actions/data-quality'
import DataQualityView from './DataQualityView'

export default async function DataQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; category?: string; project?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')
  if (!['owner', 'admin', 'architect'].includes(membership.role)) redirect('/dashboard')

  const params = await searchParams
  const severity = (params.severity as DQSeverity | undefined) ?? undefined
  const category = params.category ?? undefined
  const projectId = params.project ?? undefined

  const [summaryRes, issuesRes, bottlenecksRes, { data: projects }] = await Promise.all([
    getDataQualitySummary(),
    listDataQualityIssues({ severity, category, projectId, limit: 300 }),
    listBottlenecks({ projectId, minScore: 20, limit: 20 }),
    supabase
      .from('projects')
      .select('id, name')
      .eq('org_id', membership.org_id)
      .order('name'),
  ])

  return (
    <DataQualityView
      summary={summaryRes.summary ?? []}
      issues={issuesRes.issues ?? []}
      bottlenecks={bottlenecksRes.bottlenecks ?? []}
      projects={projects ?? []}
      activeFilters={{ severity, category, projectId }}
      error={summaryRes.error ?? issuesRes.error ?? bottlenecksRes.error}
    />
  )
}
