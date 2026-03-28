'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface PhaseInput {
  code: string
  name: string
  order_index: number
  color: string
  certificate_name: string
}

interface DisciplineInput {
  code: string
  name: string
  color: string
}

interface SetupInput {
  org: { name: string; slug: string }
  project: { name: string; code: string; location: string; client: string; start_date: string; end_date: string }
  phases: PhaseInput[]
  disciplines: DisciplineInput[]
}

export async function completeSetup(input: SetupInput): Promise<{ error?: string; org_id?: string; project_id?: string }> {
  // Verify authentication with the user-scoped client
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // Use admin client for all DB writes (bypasses RLS — safe because we verified auth above)
  const admin = createAdminClient()

  // Upsert profile
  await admin.from('profiles').upsert({
    id: user.id,
    email: user.email ?? '',
    full_name: (user.user_metadata?.full_name as string) || user.email || 'Usuario',
  })

  // 1. Create organization
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: input.org.name, slug: input.org.slug, plan: 'starter', settings: {} })
    .select()
    .single()

  if (orgError) return { error: orgError.message }

  // 2. Add user as owner
  const { error: memberError } = await admin
    .from('org_members')
    .insert({ org_id: org.id, user_id: user.id, role: 'owner' })

  if (memberError) return { error: memberError.message }

  // 3. Create project
  const { data: project, error: projectError } = await admin
    .from('projects')
    .insert({
      org_id: org.id,
      name: input.project.name,
      code: input.project.code.toUpperCase(),
      location: input.project.location || null,
      client: input.project.client || null,
      start_date: input.project.start_date || null,
      end_date: input.project.end_date || null,
      status: 'active',
    })
    .select()
    .single()

  if (projectError) return { error: projectError.message }

  // 4. Create phases
  const { error: phasesError } = await admin
    .from('project_phases')
    .insert(input.phases.map(p => ({ ...p, org_id: org.id })))

  if (phasesError) return { error: phasesError.message }

  // 5. Create disciplines
  const { error: disciplinesError } = await admin
    .from('disciplines')
    .insert(input.disciplines.map(d => ({ ...d, org_id: org.id })))

  if (disciplinesError) return { error: disciplinesError.message }

  return { org_id: org.id, project_id: project.id }
}

export async function getUserOrg(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  return data?.org_id ?? null
}
