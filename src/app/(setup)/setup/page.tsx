import SetupWizard from './SetupWizard'
import { getActiveMembership } from '@/lib/supabase/membership'

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const { mode } = await searchParams
  const isNewProject = mode === 'project'
  // R1: al crear otro proyecto se elige su alcance entre las disciplinas de la org (todas marcadas por defecto).
  const ctx = isNewProject ? await getActiveMembership() : null
  const { data: orgDisciplines } = ctx
    ? await ctx.supabase.from('disciplines').select('id, code, name, color').eq('org_id', ctx.orgId).order('code')
    : { data: [] as { id: string; code: string; name: string; color: string | null }[] }
  return <SetupWizard isNewProject={isNewProject} orgDisciplines={orgDisciplines ?? []} />
}
