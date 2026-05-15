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

type Db = SupabaseClient

export type AccessOk = { ok: true }
export type AccessFail = { ok: false; error: string; reason: 'not_found' | 'invalid' }
export type AccessResult = AccessOk | AccessFail

const OK: AccessOk = { ok: true }

function notFound(resource: string): AccessFail {
  return {
    ok: false,
    error: `${resource} not found or not accessible`,
    reason: 'not_found',
  }
}

function invalid(message: string): AccessFail {
  return { ok: false, error: message, reason: 'invalid' }
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
  return data ? OK : notFound('Project')
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
  return data ? OK : notFound('Subsystem')
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
  return data ? OK : notFound('System')
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
    return invalid(`Systems not found in project: ${missing.join(', ')}`)
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
  return data ? OK : notFound('Discipline')
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
  return data ? OK : notFound('Tag')
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
  if (!data) return notFound('ITR template')
  if (data.org_id === orgId || data.is_global === true) return OK
  return notFound('ITR template')
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
  return data ? OK : notFound('Phase')
}
