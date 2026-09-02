'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { DEFAULT_PSSR_ITEMS } from '@/lib/constants/pssr'

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
  userFullName: string
  org: { name: string; slug: string }
  project: { name: string; code: string; location: string; client: string; country: string; region: string; start_date: string; end_date: string }
  phases: PhaseInput[]
  disciplines: DisciplineInput[]
}

export async function completeSetup(input: SetupInput): Promise<{ error?: string; org_id?: string; project_id?: string }> {
  // Verify authentication with the user-scoped client
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const fullName = input.userFullName.trim()
  if (fullName.length < 2) return { error: 'Ingresa tu nombre completo' }
  // Evita que el nombre quede como el email (problema heredado: PDFs mostraban email como firmante)
  if (fullName.toLowerCase() === (user.email ?? '').toLowerCase()) {
    return { error: 'El nombre no puede ser tu correo electrónico' }
  }

  // Use admin client for all DB writes (bypasses RLS — safe because we verified auth above)
  const admin = createAdminClient()

  const { error: profileError } = await admin.from('profiles').upsert({
    id: user.id,
    full_name: fullName,
  })
  if (profileError) return { error: `Error creando perfil: ${profileError.message}` }

  // 1. Create organization — make slug unique if it already exists
  let slug = input.org.slug
  const { data: existingSlug } = await admin.from('organizations').select('id').eq('slug', slug).maybeSingle()
  if (existingSlug) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: input.org.name, slug, plan: 'starter', settings: {} })
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
      country: input.project.country.trim() || null,
      region: input.project.region.trim() || null,
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

  // 6. Seed default PSSR template
  const { data: pssrTemplate } = await admin
    .from('pssr_templates')
    .insert({ org_id: org.id, name: 'PSSR Estándar O&G', description: 'Plantilla de Pre-Startup Safety Review con 22 ítems estándar de la industria', created_by: user.id, is_active: true })
    .select('id')
    .single()

  if (pssrTemplate) {
    await admin.from('pssr_template_items').insert(
      DEFAULT_PSSR_ITEMS.map((item, i) => ({ template_id: pssrTemplate.id, item_order: i + 1, ...item }))
    )
  }

  return { org_id: org.id, project_id: project.id }
}

// ── Create project within existing org (owner / admin / architect only) ──────

interface ProjectInput {
  name: string; code: string; location: string; client: string
  country: string; region: string
  start_date: string; end_date: string
}

// Nota: antes usaba la PRIMERA membership del usuario; con el wrapper usa la
// org ACTIVA (cookie-aware via getActiveMembership) — comportamiento más correcto
// para usuarios multi-org.
export const createProject = withAuth(
  { role: PRIVILEGED_ROLES },
  async (ctx, input: ProjectInput): Promise<{ error?: string; project_id?: string }> => {
    const admin = createAdminClient()

    const { data: project, error: projectError } = await admin
      .from('projects')
      .insert({
        org_id: ctx.orgId,
        name: input.name,
        code: input.code.toUpperCase(),
        location: input.location || null,
        client: input.client || null,
        country: input.country.trim() || null,
        region: input.region.trim() || null,
        start_date: input.start_date || null,
        end_date: input.end_date || null,
        status: 'active',
      })
      .select()
      .single()

    if (projectError) return { error: projectError.message }
    return { project_id: project.id }
  },
)

// Manual a propósito: devuelve string|null (no satisface ActionResult) y se usa
// en el flujo de setup donde puede no haber membership aún.
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
