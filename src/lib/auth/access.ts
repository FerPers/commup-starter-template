/**
 * CommUp — Foreign-key ownership guards (provider-neutral).
 *
 * Verifies that a referenced sub-resource (subsystem, tag, template, …) belongs
 * to the caller's org/project chain before insert/update. Used by:
 *   - Server actions: import from here, check `ok` and surface `error` to the UI.
 *   - /api/v1 route handlers: use the NextResponse-flavored wrappers in
 *     `src/lib/api/access.ts`, which delegate here.
 *
 * Originally introduced in F2 (commit bdd5275) for /api/v1 only. I1 generalizes
 * the helpers so server actions get the same protection.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase.generated'

type Db = SupabaseClient<Database>

export type AccessOk = { ok: true }
/** V3: recurso que falló; las acciones lo traducen con `accessError` (`src/lib/i18n/action-errors.ts`), la API usa `error`. */
export type AccessResource = 'project' | 'subsystem' | 'system' | 'systems' | 'discipline' | 'equipment_type' | 'tag' | 'template' | 'phase'
export type AccessFail = { ok: false; error: string; reason: 'not_found' | 'invalid'; resource: AccessResource }
export type AccessResult = AccessOk | AccessFail

const OK: AccessOk = { ok: true }

const LABEL: Record<AccessResource, string> = {
  project: 'Project', subsystem: 'Subsystem', system: 'System', systems: 'Systems', discipline: 'Discipline',
  equipment_type: 'Equipment type', tag: 'Tag', template: 'ITR template', phase: 'Phase',
}

export function notFound(resource: AccessResource): AccessFail {
  return {
    ok: false,
    error: `${LABEL[resource]} not found or not accessible`,
    reason: 'not_found',
    resource,
  }
}

function invalid(resource: AccessResource, message: string): AccessFail {
  return { ok: false, error: message, reason: 'invalid', resource }
}

// ── Project (org-scoped) ─────────────────────────────────────────────────────

export async function checkProjectAccess(
  db: Db,
  orgId: string,
  projectId: string,
): Promise<AccessResult> {
  const { data } = await db
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data ? OK : notFound('project')
}

// ── Subsystem (project-scoped) ───────────────────────────────────────────────

export async function checkSubsystemAccess(
  db: Db,
  projectId: string,
  subsystemId: string,
): Promise<AccessResult> {
  const { data } = await db
    .from('subsystems')
    .select('id')
    .eq('id', subsystemId)
    .eq('project_id', projectId)
    .maybeSingle()
  return data ? OK : notFound('subsystem')
}

// ── System (project-scoped) ──────────────────────────────────────────────────

export async function checkSystemAccess(
  db: Db,
  projectId: string,
  systemId: string,
): Promise<AccessResult> {
  const { data } = await db
    .from('systems')
    .select('id')
    .eq('id', systemId)
    .eq('project_id', projectId)
    .maybeSingle()
  return data ? OK : notFound('system')
}

export async function checkSystemsAccess(
  db: Db,
  projectId: string,
  systemIds: string[],
): Promise<AccessResult> {
  if (systemIds.length === 0) return OK
  const unique = Array.from(new Set(systemIds))
  const { data } = await db
    .from('systems')
    .select('id')
    .in('id', unique)
    .eq('project_id', projectId)
  const found = new Set((data ?? []).map(r => r.id as string))
  const missing = unique.filter(id => !found.has(id))
  if (missing.length > 0) {
    return invalid('systems', `Systems not found in project: ${missing.join(', ')}`)
  }
  return OK
}

// ── Discipline (org-scoped) ──────────────────────────────────────────────────

export async function checkDisciplineAccess(
  db: Db,
  orgId: string,
  disciplineId: string,
): Promise<AccessResult> {
  const { data } = await db
    .from('disciplines')
    .select('id')
    .eq('id', disciplineId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data ? OK : notFound('discipline')
}

// ── Equipment type (org-scoped) ──────────────────────────────────────────────
// R3: el catálogo de CommUp es legible por todas las orgs, pero un tag solo usa tipos de su propia org.

export async function checkEquipmentTypeAccess(
  db: Db,
  orgId: string,
  equipmentTypeId: string,
): Promise<AccessResult> {
  const { data } = await db
    .from('equipment_types')
    .select('id')
    .eq('id', equipmentTypeId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data ? OK : notFound('equipment_type')
}

// ── Tag (project-scoped) ─────────────────────────────────────────────────────

export async function checkTagAccess(
  db: Db,
  projectId: string,
  tagId: string,
): Promise<AccessResult> {
  const { data } = await db
    .from('tags')
    .select('id')
    .eq('id', tagId)
    .eq('project_id', projectId)
    .maybeSingle()
  return data ? OK : notFound('tag')
}

// ── ITR template (org-scoped; is_global also accepted) ───────────────────────

export async function checkTemplateAccess(
  db: Db,
  orgId: string,
  templateId: string,
): Promise<AccessResult> {
  const { data } = await db
    .from('itr_templates')
    .select('id, org_id, is_global')
    .eq('id', templateId)
    .maybeSingle()
  if (!data) return notFound('template')
  if (data.org_id === orgId || data.is_global === true) return OK
  return notFound('template')
}

// ── Project phase (org-scoped) ───────────────────────────────────────────────

export async function checkPhaseAccess(
  db: Db,
  orgId: string,
  phaseId: string,
): Promise<AccessResult> {
  const { data } = await db
    .from('project_phases')
    .select('id')
    .eq('id', phaseId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data ? OK : notFound('phase')
}
