/**
 * Prueba de desempeño (fase 7 del plan readiness, sesión 1 — 2026-10-17, decisiones doc §14).
 *
 * Catálogo fijo y lógica pura. La BD (migración 20261019120000) aplica las mismas reglas en las RPC:
 * mantener `PERFORMANCE_SECTIONS` en sincronía con `performance_section_keys()` y `checkVariables` con
 * `performance_write_content` (clave, operandos existentes, sin ciclos). Tests en catalog.test.ts.
 */

import { can, type MyCapacities } from '@/lib/constants/capacities'
import { ROLE_TIERS } from '@/lib/constants/roles'

/** Secciones de la definición (7.22, 18.6), en orden. */
export const PERFORMANCE_SECTIONS = [
  'purpose', 'boundary', 'conditions', 'method', 'corrections', 'uncertainty', 'references', 'responsibilities',
] as const
export type PerformanceSection = (typeof PERFORMANCE_SECTIONS)[number]

export const VARIABLE_SOURCES = ['signal', 'manual', 'derived'] as const
export type VariableSource = (typeof VARIABLE_SOURCES)[number]
export const DERIVED_OPS = ['+', '-', '*', '/'] as const
export type DerivedOp = (typeof DERIVED_OPS)[number]

export const STATISTICS = ['avg', 'min', 'max', 'pct_in_band', 'total'] as const
export type Statistic = (typeof STATISTICS)[number]
export const OPERATORS = ['gte', 'lte', 'between'] as const
export type Operator = (typeof OPERATORS)[number]
export const TOTAL_BASES = ['min', 'h', 'd'] as const
export type TotalBasis = (typeof TOTAL_BASES)[number]
export const UNCERTAINTY_MODES = ['abs', 'pct'] as const
export type UncertaintyMode = (typeof UNCERTAINTY_MODES)[number]

export const DISTURBANCE_KINDS = ['trip', 'load_change', 'instrument_fault', 'process_upset', 'other'] as const
export type DisturbanceKind = (typeof DISTURBANCE_KINDS)[number]

export type RevisionStatus = 'draft' | 'in_review' | 'approved' | 'superseded'
export type PerfRunStatus = 'planned' | 'stabilizing' | 'formal' | 'closed' | 'evaluated' | 'aborted'

/** Resultado (18.35). «repeat» solo lo registra una persona; la BD sugiere los otros cuatro. */
export const PERF_RESULTS = ['accepted', 'accepted_with_deviation', 'repeat', 'failed', 'inconclusive'] as const
export type PerfResult = (typeof PERF_RESULTS)[number]
export type CriterionOutcome = 'pass' | 'within_uncertainty' | 'fail' | 'not_evaluable'
/** S12 (E-18): data_quality = calidad mala o picos por encima del umbral de la revisión. */
export type InconclusiveReason = 'coverage' | 'unit' | 'pair' | 'early_close' | 'no_valid_data' | 'not_evaluable' | 'data_quality'

/** Salida de `evaluate_performance_run` (congelada en el intento al registrar el resultado). */
export type Evaluation = {
  run: string; revision: number; revision_hash: string | null; computed_at: string
  window: { from: string; to: string; total_min: number; excluded_min: number; valid_min: number; formal_min: number; min_coverage_pct: number; early_close: boolean }
  variables: {
    key: string; label: string; unit: string | null; source: VariableSource; signal?: string | null; formula?: string
    expected?: number; present: number; coverage_pct: number; coverage_ok?: boolean; bad_pct?: number; spikes?: number; out_of_range?: number
    unit_ok?: boolean; evaluable: boolean
    /** S12 (E-18) */ quality_ok?: boolean; out_of_range_excluded?: boolean
  }[]
  criteria: {
    ord: number; variable_key: string; label: string | null; statistic: Statistic; band_lo: number | null; band_hi: number | null
    total_basis: TotalBasis | null; operator: Operator; target: number; target_hi: number | null; uncertainty: number
    uncertainty_mode: UncertaintyMode; value: number | null; outcome: CriterionOutcome
    /** S12 (E-28): solo «total»: promedio × minutos del periodo formal (el valor suma solo minutos con dato). */
    value_extrapolated?: number | null
  }[]
  pairs: { variable_a: string; variable_b: string; max_diff_pct: number; diff_pct: number | null; minutes: number; ok: boolean }[]
  reasons: InconclusiveReason[]
  suggested: Exclude<PerfResult, 'repeat'>
  result?: PerfResult; result_reason?: string | null; result_by?: string; result_at?: string
  /** S25 (E-19): exclusiones vigentes, el resultado sin ellas y si cambian el sugerido (solo con exclusiones). */
  exclusions?: { id: string; kind: string; started_at: string; ended_at: string | null; reason: string | null; excluded_by: string | null; client_ack_by: string | null; client_ack_at: string | null }[]
  without_exclusions?: { suggested: Exclude<PerfResult, 'repeat'>; valid_min: number; reasons: InconclusiveReason[]; criteria: { ord: number; value: number | null; outcome: CriterionOutcome }[] }
  exclusions_change_result?: boolean
}

/** S25 (E-19): el resultado no se registra hasta que el cliente reconozca exclusiones que cambian el sugerido. */
export function exclusionsPendingAck(e: Pick<Evaluation, 'exclusions' | 'exclusions_change_result'>): boolean {
  return !!e.exclusions_change_result && (e.exclusions ?? []).some(x => !x.client_ack_by)
}

export const RESULT_TONE: Record<PerfResult, 'green' | 'amber' | 'red' | 'muted' | 'violet'> = {
  accepted: 'green', accepted_with_deviation: 'amber', repeat: 'violet', failed: 'red', inconclusive: 'muted',
}
export const OUTCOME_TONE: Record<CriterionOutcome, 'green' | 'amber' | 'red' | 'muted'> = {
  pass: 'green', within_uncertainty: 'amber', fail: 'red', not_evaluable: 'muted',
}
/** Registrar un resultado distinto del sugerido exige motivo (igual que la RPC). */
export const needsResultReason = (result: PerfResult, suggested: string) => result !== suggested
export const LIVE_RUN_STATUSES: readonly PerfRunStatus[] = ['planned', 'stabilizing', 'formal']

/** Quien dirige la prueba (crear, aprobar, arrancar, cerrar, excluir perturbaciones) = `performance_is_lead()`. */
export const PERFORMANCE_LEAD_ROLES: readonly string[] = ROLE_TIERS.editor
export const isPerformanceLead = (role: string) => PERFORMANCE_LEAD_ROLES.includes(role)

export const KEY_RE = /^[A-Z][A-Z0-9_]{0,9}$/

export type VariableDraft = {
  key: string
  label: string
  unit: string
  source: VariableSource
  signal_id: string | null
  op: DerivedOp
  operand_a: string
  operand_b: string
  max_step: string
  manual_every_min: string
}
export type CriterionDraft = {
  variable_key: string
  label: string
  statistic: Statistic
  band_lo: string
  band_hi: string
  total_basis: TotalBasis
  operator: Operator
  target: string
  target_hi: string
  uncertainty: string
  uncertainty_mode: UncertaintyMode
}
export type PairDraft = { variable_a: string; variable_b: string; max_diff_pct: string }
export type Settings = { stabilization_min: string; formal_min: string; sample_interval_s: string; min_coverage_pct: string; procedure_id: string }

export type ContentDraft = {
  sections: Partial<Record<PerformanceSection, string>>
  settings: Settings
  system_ids: string[]
  variables: VariableDraft[]
  criteria: CriterionDraft[]
  pairs: PairDraft[]
}

export function emptyVariable(source: VariableSource = 'signal'): VariableDraft {
  return { key: '', label: '', unit: '', source, signal_id: null, op: '/', operand_a: '', operand_b: '', max_step: '', manual_every_min: '60' }
}
export function emptyCriterion(variableKey = ''): CriterionDraft {
  return {
    variable_key: variableKey, label: '', statistic: 'avg', band_lo: '', band_hi: '', total_basis: 'h',
    operator: 'gte', target: '', target_hi: '', uncertainty: '0', uncertainty_mode: 'abs',
  }
}
export function emptyPair(): PairDraft {
  return { variable_a: '', variable_b: '', max_diff_pct: '' }
}

export const normKey = (k: string) => k.trim().toUpperCase()

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
const isNum = (s: string) => s.trim() !== '' && Number.isFinite(Number(s.replace(',', '.')))

/** Primer problema de las variables (mismas reglas que la BD), o null. */
export function checkVariables(vars: (Pick<VariableDraft, 'key' | 'source' | 'signal_id' | 'operand_a' | 'operand_b'> & { manual_every_min?: string })[]): string | null {
  const keys = vars.map(v => normKey(v.key))
  for (const k of keys) if (!KEY_RE.test(k)) return `Clave no válida: «${k || '(vacía)'}» (letra inicial, mayúsculas, dígitos o _, máx. 10)`
  const dup = keys.find((k, i) => keys.indexOf(k) !== i)
  if (dup) return `Clave repetida: ${dup}`
  const set = new Set(keys)
  for (const v of vars) {
    if (v.source === 'signal' && !v.signal_id) return `La variable ${normKey(v.key)} necesita una señal`
    if (v.source === 'manual' && v.manual_every_min !== undefined) {
      const n = Number(v.manual_every_min)
      if (!Number.isInteger(n) || n < 1 || n > 1440) return `La variable ${normKey(v.key)}: «lectura cada» va de 1 a 1440 min`
    }
    if (v.source === 'derived') {
      const a = normKey(v.operand_a), b = normKey(v.operand_b)
      if (!set.has(a) || !set.has(b)) return `La variable derivada ${normKey(v.key)} usa un operando que no existe`
    }
  }
  const cycle = findCycle(vars)
  return cycle ? `La variable derivada ${cycle} depende de sí misma` : null
}

/** Clave de una variable derivada que depende de sí misma (directa o indirectamente), o null. */
export function findCycle(vars: Pick<VariableDraft, 'key' | 'source' | 'operand_a' | 'operand_b'>[]): string | null {
  const edges = new Map<string, string[]>()
  for (const v of vars) if (v.source === 'derived') edges.set(normKey(v.key), [normKey(v.operand_a), normKey(v.operand_b)])
  for (const start of edges.keys()) {
    const seen = new Set<string>()
    const stack = [...(edges.get(start) ?? [])]
    while (stack.length) {
      const cur = stack.pop()!
      if (cur === start) return start
      if (seen.has(cur)) continue
      seen.add(cur)
      stack.push(...(edges.get(cur) ?? []))
    }
  }
  return null
}

/** Primer problema de un criterio (espejo de los CHECK de performance_criteria), o null. */
export function checkCriterion(c: CriterionDraft, keys: Set<string>): string | null {
  if (!keys.has(normKey(c.variable_key))) return 'Elige la variable del criterio'
  if (!isNum(c.target)) return 'El objetivo debe ser un número'
  if (c.operator === 'between' && (!isNum(c.target_hi) || num(c.target_hi)! < num(c.target)!)) return 'El rango del objetivo no es válido'
  if (c.statistic === 'pct_in_band') {
    if (!isNum(c.band_lo) && !isNum(c.band_hi)) return 'Define al menos un límite de la banda'
    if (isNum(c.band_lo) && isNum(c.band_hi) && num(c.band_hi)! <= num(c.band_lo)!) return 'La banda no es válida'
    if (num(c.target)! < 0 || num(c.target)! > 100 || (c.operator === 'between' && num(c.target_hi)! > 100)) return 'El % de tiempo va de 0 a 100'
  }
  if (c.uncertainty.trim() !== '' && (!isNum(c.uncertainty) || num(c.uncertainty)! < 0)) return 'La incertidumbre no es válida'
  return null
}

/** Primer problema del contenido completo, o null. */
export function checkContent(c: ContentDraft): string | null {
  const v = checkVariables(c.variables)
  if (v) return v
  const keys = new Set(c.variables.map(x => normKey(x.key)))
  for (const [i, cr] of c.criteria.entries()) {
    const e = checkCriterion(cr, keys)
    if (e) return `Criterio ${i + 1}: ${e}`
  }
  for (const [i, p] of c.pairs.entries()) {
    if (!keys.has(normKey(p.variable_a)) || !keys.has(normKey(p.variable_b)) || normKey(p.variable_a) === normKey(p.variable_b)) return `Par ${i + 1}: elige dos variables distintas`
    if (!isNum(p.max_diff_pct) || num(p.max_diff_pct)! <= 0 || num(p.max_diff_pct)! > 100) return `Par ${i + 1}: la diferencia máxima va de 0 a 100 %`
  }
  return null
}

/** Contenido listo para `save_performance_revision` (números como números, claves normalizadas). */
export function toPayload(c: ContentDraft) {
  return {
    sections: Object.fromEntries(PERFORMANCE_SECTIONS.map(k => [k, (c.sections[k] ?? '').trim()]).filter(([, v]) => v)),
    settings: {
      stabilization_min: num(c.settings.stabilization_min), formal_min: num(c.settings.formal_min),
      sample_interval_s: num(c.settings.sample_interval_s), min_coverage_pct: num(c.settings.min_coverage_pct),
      procedure_id: c.settings.procedure_id || null,
    },
    system_ids: c.system_ids,
    variables: c.variables.map(v => ({
      key: normKey(v.key), label: v.label.trim() || normKey(v.key), unit: v.unit.trim() || null, source: v.source,
      signal_id: v.source === 'signal' ? v.signal_id : null,
      op: v.source === 'derived' ? v.op : null,
      operand_a: v.source === 'derived' ? normKey(v.operand_a) : null,
      operand_b: v.source === 'derived' ? normKey(v.operand_b) : null,
      max_step: num(v.max_step),
      manual_every_min: v.source === 'manual' ? num(v.manual_every_min) ?? 60 : 60,
    })),
    criteria: c.criteria.map(cr => ({
      variable_key: normKey(cr.variable_key), label: cr.label.trim() || null, statistic: cr.statistic,
      band_lo: cr.statistic === 'pct_in_band' ? num(cr.band_lo) : null,
      band_hi: cr.statistic === 'pct_in_band' ? num(cr.band_hi) : null,
      total_basis: cr.statistic === 'total' ? cr.total_basis : null,
      operator: cr.operator, target: num(cr.target), target_hi: cr.operator === 'between' ? num(cr.target_hi) : null,
      uncertainty: num(cr.uncertainty) ?? 0, uncertainty_mode: cr.uncertainty_mode,
    })),
    pairs: c.pairs.map(p => ({ variable_a: normKey(p.variable_a), variable_b: normKey(p.variable_b), max_diff_pct: num(p.max_diff_pct) })),
  }
}

/** Texto corto de un criterio: «prom(F1) ≥ 17,5 ± 1 %». */
export function criterionText(c: Pick<CriterionDraft, 'variable_key' | 'statistic' | 'band_lo' | 'band_hi' | 'total_basis' | 'operator' | 'target' | 'target_hi' | 'uncertainty' | 'uncertainty_mode'>, unit?: string | null): string {
  const k = normKey(c.variable_key)
  const stat = c.statistic === 'pct_in_band'
    ? `%t(${c.band_lo || '−∞'} ≤ ${k} ≤ ${c.band_hi || '∞'})`
    : c.statistic === 'total' ? `Σ${k}/${c.total_basis}` : `${c.statistic === 'avg' ? 'prom' : c.statistic}(${k})`
  const u = c.statistic === 'pct_in_band' ? '%' : unit ?? ''
  const tgt = c.operator === 'between' ? `∈ [${c.target}, ${c.target_hi}]` : `${c.operator === 'gte' ? '≥' : '≤'} ${c.target}`
  const unc = Number(c.uncertainty) > 0 ? ` ± ${c.uncertainty}${c.uncertainty_mode === 'pct' ? ' %' : ''}` : ''
  return `${stat} ${tgt}${u ? ` ${u}` : ''}${unc}`
}

/** Reloj del intento: fase, minutos transcurridos y restantes del mínimo de la fase (estabilización o formal). */
export function runClock(
  run: { status: PerfRunStatus; stabilization_started_at: string | null; formal_started_at: string | null; closed_at: string | null },
  rev: { stabilization_min: number; formal_min: number },
  nowMs: number,
): { phase: PerfRunStatus; elapsedMin: number; targetMin: number | null; remainingMin: number | null; done: boolean } {
  const mins = (from: string | null, to: number) => (from ? Math.max(0, Math.floor((to - Date.parse(from)) / 60000)) : 0)
  if (run.status === 'stabilizing') {
    const e = mins(run.stabilization_started_at, nowMs)
    return { phase: 'stabilizing', elapsedMin: e, targetMin: rev.stabilization_min, remainingMin: Math.max(0, rev.stabilization_min - e), done: e >= rev.stabilization_min }
  }
  if (run.status === 'formal') {
    const e = mins(run.formal_started_at, nowMs)
    return { phase: 'formal', elapsedMin: e, targetMin: rev.formal_min, remainingMin: Math.max(0, rev.formal_min - e), done: e >= rev.formal_min }
  }
  if ((run.status === 'closed' || run.status === 'evaluated') && run.formal_started_at && run.closed_at) {
    const e = mins(run.formal_started_at, Date.parse(run.closed_at))
    return { phase: 'closed', elapsedMin: e, targetMin: rev.formal_min, remainingMin: 0, done: true }
  }
  return { phase: run.status, elapsedMin: 0, targetMin: null, remainingMin: null, done: false }
}

/** «2 h 05 min» */
export function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60), r = m % 60
  return h > 0 ? `${h} h ${String(r).padStart(2, '0')} min` : `${r} min`
}

/** Valor ISO (UTC) → valor para <input type="datetime-local"> en hora local. */
export function toLocalInput(iso: string | number): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// ── Certificado PTC (sesión 2b) ───────────────────────────────────────────
export type CertificateStatus = 'pending_signatures' | 'accepted' | 'revoked' | 'superseded'
export type CertCapacity = 'commissioning' | 'operations' | 'client'
export const CERT_TONE: Record<CertificateStatus, 'amber' | 'green' | 'red' | 'struck'> = {
  pending_signatures: 'amber', accepted: 'green', revoked: 'red', superseded: 'struck',
}

export type CertSigners = { status: CertificateStatus; commissioning_signed_by: string | null; operations_signed_by: string | null; client_signed_by: string | null }

/** ¿Puede esta persona firmar el certificado en esa capacidad? (mismas reglas que sign_performance_certificate). */
// S14 (D14/I-25): Operaciones = capacidad operations; Cliente = client_rep (empresa operadora o, sin designados, rol client).
export function canSignCertificate(c: CertSigners, capacity: Exclude<CertCapacity, 'commissioning'>, caps: MyCapacities, userId: string): boolean {
  if (c.status !== 'pending_signatures') return false
  if ([c.commissioning_signed_by, c.operations_signed_by, c.client_signed_by].includes(userId)) return false
  if (capacity === 'operations') return c.operations_signed_by === null && can(caps, 'operations')
  return c.client_signed_by === null && can(caps, 'client_rep')
}
