import { denyAccess } from '@/lib/auth/denied'
import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import InstrumentationHub from '../signals/InstrumentationHub'
import ImportSignalsWizard from './ImportSignalsWizard'
import { ROLE_TIERS } from '@/lib/constants/roles'

export default async function ImportSignalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase
  const membership = { org_id: ctx.orgId, role: ctx.role }
  if (!ROLE_TIERS.privileged.includes(membership.role)) denyAccess('privileged')

  const [{ data: project }, { data: disciplines }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', id).eq('org_id', membership.org_id).single(),
    supabase.from('disciplines').select('id, code, name, color').eq('org_id', membership.org_id),
  ])

  if (!project) notFound()

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)' }}>
      <InstrumentationHub projectId={project.id} current="import" canImport />
      <ImportSignalsWizard
        projectId={project.id}
        disciplines={disciplines ?? []}
      />
    </div>
  )
}
