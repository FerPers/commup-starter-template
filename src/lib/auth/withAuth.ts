/**
 * CommUp — Server Action security wrapper.
 *
 * Wraps a Server Action with:
 *   1. Authentication + active org membership (always)
 *   2. Optional minimum role check (use the *_ROLES tuples from `permissions.ts`)
 *   3. Optional FK ownership guards (declarative — the wrapper validates that the
 *      referenced sub-resource belongs to the caller's org/project chain BEFORE
 *      invoking the handler).
 *
 * Why this exists: Next.js 16 + OpenNext Cloudflare cannot use a middleware /
 * proxy.ts file (see CLAUDE.md). Every Server Action is its own entry point and
 * must validate auth itself. Hand-rolled checks drift — this wrapper centralizes
 * the contract so it's impossible to ship an unprotected action.
 *
 * Usage:
 *   export const createPunch = withAuth(
 *     {
 *       role: EDITOR_ROLES,
 *       guards: [
 *         { resource: 'project', field: 'projectId' },
 *         { resource: 'tag', field: 'tagId', scopeField: 'projectId', optional: true },
 *       ],
 *     },
 *     async (ctx, input: CreatePunchInput) => {
 *       // ctx.supabase, ctx.orgId, ctx.userId, ctx.role are guaranteed valid here
 *       // input.projectId and (if provided) input.tagId have been ownership-checked
 *       …
 *     },
 *   )
 *
 * The wrapper returns `{ error: string }` on auth / role / FK failure; otherwise
 * it forwards whatever the handler returns. Existing handlers that already
 * include `error?: string` in their return shape are compatible — the union just
 * adds the wrapper's failure case.
 */
import {
  requireAuth,
  requireRole,
  isAuthError,
  type ActiveContext,
} from '@/lib/auth/permissions'
import {
  checkProjectAccess,
  checkSubsystemAccess,
  checkSystemAccess,
  checkSystemsAccess,
  checkTagAccess,
  checkTemplateAccess,
  checkDisciplineAccess,
  checkPhaseAccess,
  type AccessResult,
} from '@/lib/auth/access'

/**
 * Supported FK resource types. Each maps to a `check*Access` helper in
 * `src/lib/auth/access.ts`.
 *
 *   project        → org-scoped       (uses ctx.orgId)
 *   subsystem      → project-scoped   (requires scopeField pointing to a project id)
 *   system         → project-scoped   (requires scopeField; supports string OR string[])
 *   tag            → project-scoped   (requires scopeField)
 *   template       → org-scoped (or is_global=true)
 *   discipline     → org-scoped
 *   phase          → org-scoped
 */
export type FKResource =
  | 'project'
  | 'subsystem'
  | 'system'
  | 'tag'
  | 'template'
  | 'discipline'
  | 'phase'

export type FKGuard = {
  /** Resource type — determines which `check*Access` helper runs. */
  resource: FKResource
  /** Name of the field on the input object that holds the resource id (or string[]). */
  field: string
  /**
   * For project-scoped resources (subsystem/system/tag), name of the input field
   * holding the project id used as scope. Ignored for org-scoped resources.
   */
  scopeField?: string
  /**
   * If true and the field is `null` / `undefined` / missing, skip the guard
   * silently. If false (default), missing values produce an error.
   */
  optional?: boolean
}

export type WithAuthOptions = {
  /**
   * If set, caller's role must be in this list (use ADMIN_ROLES / EDITOR_ROLES /
   * etc. from `permissions.ts`). If omitted, any authenticated member is accepted.
   */
  role?: readonly string[]
  /** Declarative FK ownership checks executed before the handler. */
  guards?: readonly FKGuard[]
}

/**
 * Every Server Action in CommUp returns a result shape that includes
 * `error?: string`. The wrapper requires this so failure cases (auth, role, FK)
 * can be merged into the existing shape — callers see one consistent return
 * type, not a discriminated union.
 */
export type ActionResult = { error?: string } & Record<string, unknown>

/**
 * Wrap a Server Action with auth + role + FK ownership checks.
 *
 * The returned function has signature `(input: I) => Promise<O>`. On failure
 * the wrapper returns `{ error: string }` cast to `O` (safe because `O` already
 * includes `error?: string`).
 *
 * For actions that take no arguments, set `I = void` and call the wrapped fn
 * with no args.
 */
export function withAuth<I, O extends ActionResult>(
  options: WithAuthOptions,
  handler: (ctx: ActiveContext, input: I) => Promise<O>,
): (input: I) => Promise<O> {
  return async (input: I): Promise<O> => {
    const ctx = options.role ? await requireRole(options.role) : await requireAuth()
    if (isAuthError(ctx)) return ctx as O

    if (options.guards && options.guards.length > 0) {
      const guardError = await runGuards(ctx, options.guards, input)
      if (guardError) return guardError as O
    }

    return handler(ctx, input)
  }
}

/**
 * Variant for Server Actions with positional arguments (e.g. `deleteTag(projectId, tagId)`).
 * Provides auth + role centralization but does NOT run declarative FK guards —
 * call the helpers from `src/lib/auth/access.ts` manually inside the handler.
 *
 * Use `withAuth` instead when the action takes a single object input — it gives
 * you declarative FK guards.
 */
export function withAuthOnly<Args extends readonly unknown[], O extends ActionResult>(
  options: { role?: readonly string[] },
  handler: (ctx: ActiveContext, ...args: Args) => Promise<O>,
): (...args: Args) => Promise<O> {
  return async (...args: Args): Promise<O> => {
    const ctx = options.role ? await requireRole(options.role) : await requireAuth()
    if (isAuthError(ctx)) return ctx as O
    return handler(ctx, ...args)
  }
}

async function runGuards<I>(
  ctx: ActiveContext,
  guards: readonly FKGuard[],
  input: I,
): Promise<{ error: string } | null> {
  // Guards require a non-null object input. Reject silently otherwise.
  if (input == null || typeof input !== 'object') {
    return { error: 'Input no válido para validación de permisos' }
  }
  const obj = input as Record<string, unknown>

  for (const g of guards) {
    const raw = obj[g.field]

    if (raw == null || raw === '') {
      if (g.optional) continue
      return { error: `Falta el campo requerido: ${g.field}` }
    }

    // system supports string[] (bulk import path); everything else is a single id
    if (g.resource === 'system' && Array.isArray(raw)) {
      const ids = raw.filter((v): v is string => typeof v === 'string')
      if (ids.length !== raw.length) {
        return { error: `Field ${g.field} debe ser string[] de ids` }
      }
      const scope = readScope(obj, g)
      if (scope.error) return scope.error
      const result = await checkSystemsAccess(ctx.supabase, scope.value, ids)
      if (!result.ok) return { error: result.error }
      continue
    }

    if (typeof raw !== 'string') {
      return { error: `Field ${g.field} debe ser un string id` }
    }

    const result = await runSingleGuard(ctx, g, raw, obj)
    if (!result.ok) return { error: result.error }
  }

  return null
}

async function runSingleGuard(
  ctx: ActiveContext,
  g: FKGuard,
  id: string,
  obj: Record<string, unknown>,
): Promise<AccessResult> {
  switch (g.resource) {
    case 'project':
      return checkProjectAccess(ctx.supabase, ctx.orgId, id)
    case 'subsystem': {
      const scope = readScope(obj, g)
      if (scope.error) return { ok: false, error: scope.error.error, reason: 'invalid' }
      return checkSubsystemAccess(ctx.supabase, scope.value, id)
    }
    case 'system': {
      const scope = readScope(obj, g)
      if (scope.error) return { ok: false, error: scope.error.error, reason: 'invalid' }
      return checkSystemAccess(ctx.supabase, scope.value, id)
    }
    case 'tag': {
      const scope = readScope(obj, g)
      if (scope.error) return { ok: false, error: scope.error.error, reason: 'invalid' }
      return checkTagAccess(ctx.supabase, scope.value, id)
    }
    case 'template':
      return checkTemplateAccess(ctx.supabase, ctx.orgId, id)
    case 'discipline':
      return checkDisciplineAccess(ctx.supabase, ctx.orgId, id)
    case 'phase':
      return checkPhaseAccess(ctx.supabase, ctx.orgId, id)
  }
}

function readScope(
  obj: Record<string, unknown>,
  g: FKGuard,
): { value: string; error: null } | { value: ''; error: { error: string } } {
  if (!g.scopeField) {
    return { value: '', error: { error: `Guard de ${g.resource} requiere scopeField` } }
  }
  const v = obj[g.scopeField]
  if (typeof v !== 'string' || v === '') {
    return { value: '', error: { error: `Falta scopeField ${g.scopeField} para ${g.resource}` } }
  }
  return { value: v, error: null }
}