/**
 * Firmas requeridas del ITR (S04, C-01/I-05/A-08 — decisiones D4 y D6, 2026-10-19).
 *
 * Cada plantilla define `required_signatures` (por defecto ejecutor + supervisor; el ejecutor siempre)
 * y la fase puede exigir además la firma del cliente (`project_phases.itr_client_signature`). Al crear
 * el ITR, la BD congela el conjunto en `itrs.required_signatures` (trigger `guard_itr_row`). Se firma en
 * orden ejecutor → supervisor → cliente, saltando los roles que no se piden; el ITR se aprueba cuando
 * están todas. Una persona no firma dos roles del mismo ITR (ni queda asignada a dos).
 *
 * Espejo puro de `sign_itr_atomic`, `itr_signing_roles` y `guard_itr_content`: si cambia una regla,
 * cambian las dos (y `src/lib/itr/signatures.test.ts`).
 */
export const ITR_SIGNING_ORDER = ['executor', 'supervisor', 'client'] as const
export type SigningRole = (typeof ITR_SIGNING_ORDER)[number]

export const DEFAULT_REQUIRED_SIGNATURES: readonly SigningRole[] = ['executor', 'supervisor']

export function isSigningRole(role: string): role is SigningRole {
  return (ITR_SIGNING_ORDER as readonly string[]).includes(role)
}

/** Ordena, deduplica y garantiza el ejecutor. Vacío o inválido → el conjunto por defecto. */
export function normalizeRequired(roles: ReadonlyArray<string> | null | undefined): SigningRole[] {
  if (!roles || roles.length === 0) return [...DEFAULT_REQUIRED_SIGNATURES]
  const set = new Set(roles.filter(isSigningRole))
  set.add('executor')
  return ITR_SIGNING_ORDER.filter(r => set.has(r))
}

/** Lo que congela la BD al crear el ITR: la plantilla, más el cliente si la fase lo exige. */
export function requiredForTemplate(templateRoles: ReadonlyArray<string> | null | undefined, phaseRequiresClient: boolean | null | undefined): SigningRole[] {
  return normalizeRequired(phaseRequiresClient ? [...(templateRoles ?? DEFAULT_REQUIRED_SIGNATURES), 'client'] : templateRoles)
}

/** Siguiente rol que debe firmar (null si ya están todas). */
export function nextSigningRole(required: ReadonlyArray<string>, signedRoles: ReadonlyArray<string>): SigningRole | null {
  return normalizeRequired(required).find(r => !signedRoles.includes(r)) ?? null
}

export function allRequiredSigned(required: ReadonlyArray<string>, signedRoles: ReadonlyArray<string>): boolean {
  return nextSigningRole(required, signedRoles) === null
}

/**
 * Roles que este usuario puede firmar ahora (gate de UI; el servidor verifica asignación, orden,
 * contenido e independencia). Solo el siguiente rol requerido, si está asignado a este usuario y si el
 * usuario no firmó ya otro rol del ITR (D6).
 */
export function availableSigningRoles(
  required: ReadonlyArray<string>,
  assignments: readonly { role: string; user_id: string }[],
  signatures: readonly { role: string; user_id: string }[],
  userId: string,
): SigningRole[] {
  if (signatures.some(s => s.user_id === userId)) return []
  // Igual que el servidor («Existing signature assignment mismatch»): cada firma puesta debe coincidir con
  // la única asignación de su rol; si no, nadie firma hasta corregirlo.
  for (const s of signatures) {
    const assigned = assignments.filter(a => a.role === s.role)
    if (signatures.filter(o => o.role === s.role).length > 1 || assigned.length !== 1 || assigned[0].user_id !== s.user_id) return []
  }
  const next = nextSigningRole(required, signatures.map(s => s.role))
  if (!next) return []
  const assigned = assignments.filter(a => a.role === next)
  return assigned.length === 1 && assigned[0].user_id === userId ? [next] : []
}

/**
 * Valida un juego de asignaciones antes de crear o cambiar: cada rol requerido con persona y nadie en
 * dos roles. Devuelve el mensaje de error o null.
 */
/** V3: problema de la asignación de firmantes; el texto sale de `ActionErrors.itrAssign.<code>` (ICU `role`). */
export type AssignmentIssue = { code: 'missing_role'; role: SigningRole } | { code: 'same_person' }

export function assignmentIssue(
  required: ReadonlyArray<string>,
  people: Partial<Record<SigningRole, string | null | undefined>>,
): AssignmentIssue | null {
  const roles = normalizeRequired(required)
  for (const r of roles) if (!people[r]) return { code: 'missing_role', role: r }
  const ids = roles.map(r => people[r]).filter((v): v is string => !!v)
  if (new Set(ids).size !== ids.length) return { code: 'same_person' }
  return null
}

/** Mensajes de `sign_itr_atomic` / `guard_itr_content` → clave i18n (`ItrExecution.signErrors.*`). */
export function itrSignErrorKey(message: string): 'alreadySigned' | 'previous' | 'notAssigned' | 'notRequired' | 'incomplete' | null {
  if (/already signed this ITR/i.test(message)) return 'alreadySigned'
  if (/Previous signature required/i.test(message)) return 'previous'
  if (/not assigned to signing role/i.test(message)) return 'notAssigned'
  if (/Invalid signing role|not required for this ITR/i.test(message)) return 'notRequired'
  if (/content incomplete or rejected/i.test(message)) return 'incomplete'
  return null
}

/** Errores de asignación de la BD → clave de `ActionErrors.itrAssign` (null = mostrar el mensaje de la BD). */
export function assignmentDbErrorKey(message: string): 'same_person_db' | 'role_not_required' | 'role_signed' | 'not_member' | 'missing_role_db' | 'client_executor_db' | null {
  if (/two signing roles/i.test(message)) return 'same_person_db'
  // A03: validaciones de create_itr (todo o nada).
  if (/Missing signer for required role/i.test(message)) return 'missing_role_db'
  if (/client cannot be the ITR executor/i.test(message)) return 'client_executor_db'
  if (/not required for this ITR/i.test(message)) return 'role_not_required'
  if (/audited reopening/i.test(message)) return 'role_signed'
  if (/not a project organization member/i.test(message)) return 'not_member'
  return null
}
