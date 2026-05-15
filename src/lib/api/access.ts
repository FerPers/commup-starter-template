/**
 * CommUp Public API — Foreign-key ownership guards (F2 hardening).
 *
 * Thin NextResponse-flavored wrappers over the provider-neutral checks in
 * `src/lib/auth/access.ts`. Server actions should import from there directly;
 * /api/v1 route handlers use these so the failure path is a ready-to-return
 * Response that preserves the public API's headers/status conventions.
 */
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiHeaders } from '@/lib/api/auth'
import {
  checkDisciplineAccess,
  checkPhaseAccess,
  checkProjectAccess,
  checkSubsystemAccess,
  checkSystemAccess,
  checkSystemsAccess,
  checkTagAccess,
  checkTemplateAccess,
  type AccessResult as RawAccessResult,
} from '@/lib/auth/access'

type Admin = SupabaseClient

export type AccessOk = { ok: true }
export type AccessFail = { ok: false; response: NextResponse }
export type AccessResult = AccessOk | AccessFail

const OK: AccessOk = { ok: true }

function toResponse(result: RawAccessResult): AccessResult {
  if (result.ok) return OK
  const status = result.reason === 'not_found' ? 404 : 422
  return {
    ok: false,
    response: NextResponse.json({ error: result.error }, { status, headers: apiHeaders() }),
  }
}

export async function requireProjectAccess(admin: Admin, orgId: string, projectId: string) {
  return toResponse(await checkProjectAccess(admin, orgId, projectId))
}

export async function requireSubsystemAccess(admin: Admin, projectId: string, subsystemId: string) {
  return toResponse(await checkSubsystemAccess(admin, projectId, subsystemId))
}

export async function requireSystemAccess(admin: Admin, projectId: string, systemId: string) {
  return toResponse(await checkSystemAccess(admin, projectId, systemId))
}

export async function requireSystemsAccess(admin: Admin, projectId: string, systemIds: string[]) {
  return toResponse(await checkSystemsAccess(admin, projectId, systemIds))
}

export async function requireDisciplineAccess(admin: Admin, orgId: string, disciplineId: string) {
  return toResponse(await checkDisciplineAccess(admin, orgId, disciplineId))
}

export async function requireTagAccess(admin: Admin, projectId: string, tagId: string) {
  return toResponse(await checkTagAccess(admin, projectId, tagId))
}

export async function requireTemplateAccess(admin: Admin, orgId: string, templateId: string) {
  return toResponse(await checkTemplateAccess(admin, orgId, templateId))
}

export async function requirePhaseAccess(admin: Admin, orgId: string, phaseId: string) {
  return toResponse(await checkPhaseAccess(admin, orgId, phaseId))
}
