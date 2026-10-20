'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { DEFAULT_PSSR_ITEMS } from '@/lib/constants/pssr'
import { EQUIPMENT_TYPE_DEFAULTS } from '@/lib/equipment-types'
import { setupInputSchema, type SetupInput } from '@/lib/setup/schema'

export async function completeSetup(raw: SetupInput): Promise<{ error?: string; org_id?: string; project_id?: string }> {
  // Verify authentication with the user-scoped client
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // A-20 (S02): escribe con service role → entrada validada campo a campo y una sola org por usuario
  // (el layout (setup) ya lo impide en la UI, pero la action se puede invocar directo).
  const parsed = setupInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fullNameIssue = parsed.error.issues.some(i => i.path[0] === 'userFullName')
    return { error: fullNameIssue ? 'Ingresa tu nombre completo' : 'Datos de configuración no válidos' }
  }
  const input = parsed.data
  const { count: memberships } = await supabase
    .from('org_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
  if ((memberships ?? 0) > 0) return { error: 'Ya perteneces a una organización: crea el proyecto desde ella' }

  const fullName = input.userFullName
  // Evita que el nombre quede como el email (problema heredado: PDFs mostraban email como firmante)
  if (fullName.toLowerCase() === (user.email ?? '').toLowerCase()) {
    return { error: 'El nombre no puede ser tu correo electrónico' }
  }

  // S07 (C-28): todo en una transacción (RPC bootstrap_org, solo service role). Antes eran 8 inserciones
  // sueltas: un fallo a mitad dejaba una org sin proyecto o sin fases y el usuario ya era miembro.
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('bootstrap_org', {
    p_user_id: user.id,
    p_input: {
      userFullName: fullName,
      org: input.org,
      project: input.project,
      phases: input.phases,
      disciplines: input.disciplines,
      equipmentTypes: EQUIPMENT_TYPE_DEFAULTS.map(t => ({ code: t.code, name: t.name, category: t.category })),
      pssrItems: DEFAULT_PSSR_ITEMS,
    },
  })
  if (error) return { error: error.message }
  const ids = data as { org_id: string; project_id: string }
  return { org_id: ids.org_id, project_id: ids.project_id }
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
