/**
 * A08 · E4: casos de `gate_work_state` compartidos por la prueba unitaria (work-state.test.ts) y la de paridad
 * TS = SQL (tests/db/gate-work-state-parity.test.ts). Cada caso dice qué DEBE salir.
 */
type Criterion = { kind: string; result: 'pass' | 'warn' | 'fail'; blocking?: boolean; detail?: Record<string, unknown> }
export type WorkStateCase = { name: string; status: string; criteria: Criterion[]; expected: 'nodata' | 'work' | 'blocked' | null }

const itr = (detail: Record<string, unknown>, result: Criterion['result'] = 'fail'): Criterion => ({ kind: 'itr_phase_approved', result, detail })

export const WORK_STATE_CASES: WorkStateCase[] = [
  { name: 'aprobado: sin causa', status: 'approved', criteria: [itr({ itr_total: 10, itr_approved: 10 }, 'pass')], expected: null },
  { name: 'en regresión no es «no listo»', status: 'regressed', criteria: [itr({ itr_total: 10, itr_approved: 9, open_cat_a: 1 })], expected: null },
  { name: 'ITR por aprobar = trabajo', status: 'not_ready', criteria: [itr({ itr_total: 86, itr_approved: 55, open_cat_a: 0, itr_rejected: 0, red_subsystems: [{ reason: 'itrs_pending' }] })], expected: 'work' },
  { name: 'Cat A abierto = bloqueado', status: 'not_ready', criteria: [itr({ itr_total: 10, itr_approved: 10, open_cat_a: 2, red_subsystems: [{ reason: 'cat_a' }] })], expected: 'blocked' },
  { name: 'Cat A visto solo por subsistema (motor anterior)', status: 'not_ready', criteria: [itr({ itr_total: 10, itr_approved: 8, red_subsystems: [{ reason: 'cat_a' }] })], expected: 'blocked' },
  { name: 'ITR no conforme = bloqueado', status: 'not_ready', criteria: [itr({ itr_total: 10, itr_approved: 9, itr_rejected: 1, red_subsystems: [{ reason: 'itrs_pending' }] })], expected: 'blocked' },
  { name: 'Cat B sobre el tope = bloqueado', status: 'not_ready', criteria: [itr({ itr_total: 4, itr_approved: 4, red_subsystems: [{ reason: 'cat_b_over_limit' }] })], expected: 'blocked' },
  { name: 'sin ITR en el alcance = sin información', status: 'not_ready', criteria: [itr({ itr_total: 0, itr_approved: 0, subsystems_total: 0, red_subsystems: [] })], expected: 'nodata' },
  { name: 'gate sin fase = sin información', status: 'not_ready', criteria: [itr({ error: 'no_phase' })], expected: 'nodata' },
  { name: 'anterior sin aprobar = trabajo (secuencia normal)', status: 'not_ready', criteria: [{ kind: 'previous_gate', result: 'fail', blocking: true, detail: { regressed: false } }, itr({ itr_total: 5, itr_approved: 5 }, 'pass')], expected: 'work' },
  { name: 'anterior en regresión = bloqueado', status: 'not_ready', criteria: [{ kind: 'previous_gate', result: 'fail', blocking: true, detail: { regressed: true } }], expected: 'blocked' },
  { name: 'anterior en regresión como condición no bloquea', status: 'not_ready', criteria: [{ kind: 'previous_gate', result: 'warn', detail: { regressed: true } }, { kind: 'pssr_approved', result: 'fail', detail: {} }], expected: 'work' },
  { name: 'restricción en nivel 4 = bloqueado', status: 'not_ready', criteria: [{ kind: 'constraints_clear', result: 'fail', blocking: true, detail: { open_count: 1, blocking_count: 1 } }], expected: 'blocked' },
  { name: 'restricción abierta sin nivel 4 = condición, no cuenta', status: 'not_ready', criteria: [{ kind: 'constraints_clear', result: 'warn', detail: { open_count: 1, blocking_count: 0 } }, { kind: 'lineup_verified', result: 'fail', detail: { missing: true } }], expected: 'work' },
  { name: 'proveedor sin liberar = trabajo (secuencia normal)', status: 'not_ready', criteria: [{ kind: 'dependencies_ready', result: 'fail', detail: { missing_count: 1, dependencies: [{ system_code: 'S-100', provider_status: null, ok: false }] } }], expected: 'work' },
  { name: 'proveedor pendiente de firmas = trabajo', status: 'not_ready', criteria: [{ kind: 'dependencies_ready', result: 'fail', detail: { missing_count: 1, dependencies: [{ system_code: 'S-100', provider_status: 'pending_signatures', ok: false }] } }], expected: 'work' },
  { name: 'proveedor en regresión (política bloquear) = bloqueado', status: 'not_ready', criteria: [{ kind: 'dependencies_ready', result: 'fail', detail: { missing_count: 1, dependencies: [{ system_code: 'S-100', provider_status: 'regressed', ok: false }] } }], expected: 'blocked' },
  { name: 'proveedor en regresión como condición no bloquea', status: 'not_ready', criteria: [{ kind: 'dependencies_ready', result: 'warn', detail: { regressed_count: 1, dependencies: [{ system_code: 'S-100', provider_status: 'regressed', ok: false }] } }, { kind: 'pssr_approved', result: 'fail', detail: {} }], expected: 'work' },
  { name: 'registro controlado abierto = bloqueado', status: 'not_ready', criteria: [{ kind: 'registers_clear', result: 'fail', detail: { open_count: 2 } }], expected: 'blocked' },
  { name: 'line-up, PSSR o certificados = trabajo', status: 'not_ready', criteria: [{ kind: 'lineup_verified', result: 'fail', detail: {} }, { kind: 'certificates_issued', result: 'fail', detail: { missing_count: 2 } }], expected: 'work' },
  { name: 'bloqueo gana a sin información', status: 'not_ready', criteria: [itr({ itr_total: 0 }), { kind: 'registers_clear', result: 'fail', detail: { open_count: 1 } }], expected: 'blocked' },
  { name: 'sin criterios', status: 'not_ready', criteria: [], expected: 'work' },
]
