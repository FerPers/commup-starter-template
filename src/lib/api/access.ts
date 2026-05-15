/**
 * CommUp Public API — Foreign-key ownership guards (F2 hardening)
 *
 * The /api/v1 handlers use the service-role admin client and therefore bypass
 * Postgres RLS. Project ownership is verified explicitly via `auth.orgId`, but
 * sub-resources referenced in request bodies (subsystems, disciplines, tags,
 * templates, …) historically were not. That gap let a caller with a valid
 * OrgA API key insert rows pointing at OrgB resources.
 *
 * These helpers re-establish the missing checks. Each returns either
 * `{ ok: true }` or a ready-to-return `NextResponse` (404 / 422) so the
 * handler stays a flat sequence of guards.
 */
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiHeaders } from '@/lib/api/auth'

type Admin = SupabaseClient

export type AccessOk = { ok: true }
export type AccessFail = { ok: false; response: NextResponse }
export type AccessResult = AccessOk | AccessFail

const OK: AccessOk = { ok: true }

function notFound(resource: string): AccessFail {
  return {
    ok: false,
    response: NextResponse.json(
      { error: `${resource} not found or not accessible` },
      { status: 404, headers: apiHeaders() },
    ),
  }
}

function invalid(message: string): AccessFail {
  return {
    ok: false,
    response: NextResponse.json(
      { error: message },
      { status: 422, headers: apiHeaders() },
    ),
  }
}

// ── Project (org-scoped) ─────────────────────────────────────────────────────

export async function requireProjectAccess(
  admin: Admin,
  orgId: string,
  projectId: string,
): Promise<AccessResult> {
  const { data } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data ? OK : notFound('Project')
}

// ── Subsystem (project-scoped) ───────────────────────────────────────────────

export async function requireSubsystemAccess(
  admin: Admin,
  projectId: string,
  subsystemId: string,
): Promise<AccessResult> {
  const { data } = await admin
    .from('subsystems')
    .select('id')
    .eq('id', subsystemId)
    .eq('project_id', projectId)
    .maybeSingle()
  return data ? OK : notFound('Subsystem')
}

// ── System (project-scoped) ──────────────────────────────────────────────────

export async function requireSystemAccess(
  admin: Admin,
  projectId: string,
  systemId: string,
): Promise<AccessResult> {
  const { data } = await admin
    .from('systems')
    .select('id')
    .eq('id', systemId)
    .eq('project_id', projectId)
    .maybeSingle()
  return data ? OK : notFound('System')
}

export async function requireSystemsAccess(
  admin: Admin,
  projectId: string,
  systemIds: string[],
): Promise<AccessResult> {
  if (systemIds.length === 0) return OK
  const unique = Array.from(new Set(systemIds))
  const { data } = await admin
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

export async function requireDisciplineAccess(
  admin: Admin,
  orgId: string,
  disciplineId: string,
): Promise<AccessResult> {
  const { data } = await admin
    .from('disciplines')
    .select('id')
    .eq('id', disciplineId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data ? OK : notFound('Discipline')
}

// ── Tag (project-scoped) ─────────────────────────────────────────────────────

export async function requireTagAccess(
  admin: Admin,
  projectId: string,
  tagId: string,
): Promise<AccessResult> {
  const { data } = await admin
    .from('tags')
    .select('id')
    .eq('id', tagId)
    .eq('project_id', projectId)
    .maybeSingle()
  return data ? OK : notFound('Tag')
}

// ── ITR template (org-scoped; is_global also accepted) ───────────────────────

export async function requireTemplateAccess(
  admin: Admin,
  orgId: string,
  templateId: string,
): Promise<AccessResult> {
  const { data } = await admin
    .from('itr_templates')
    .select('id, org_id, is_global')
    .eq('id', templateId)
    .maybeSingle()
  if (!data) return notFound('ITR template')
  if (data.org_id === orgId || data.is_global === true) return OK
  return notFound('ITR template')
}

// ── Project phase (org-scoped) ───────────────────────────────────────────────

export async function requirePhaseAccess(
  admin: Admin,
  orgId: string,
  phaseId: string,
): Promise<AccessResult> {
  const { data } = await admin
    .from('project_phases')
    .select('id')
    .eq('id', phaseId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data ? OK : notFound('Phase')
}
