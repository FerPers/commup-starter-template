/**
 * Prueba de desempeño (fase 7 del plan readiness, sesión 1 — 2026-10-17, decisiones doc §14).
 *
 * Catálogo fijo y lógica pura. La BD (migración 20261019120000) aplica las mismas reglas en las RPC:
 * mantener `PERFORMANCE_SECTIONS` en sincronía con `performance_section_keys()` y `checkVariables` con
 * `performance_write_content` (clave, operandos existentes, sin ciclos). Tests en catalog.test.ts.
 */

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
export type PerfRunStatus = 'planned' | 'stabilizing' | 'formal' | 'closed' | 'aborted'
export const LIVE_RUN_STATUSES: readonly PerfRunStatus[] = ['planned', 'stabilizing', 'formal']

/** Quien dirige la prueba (crear, aprobar, arrancar, cerrar, excluir perturbaciones) = `performance_is_lead()`. */
export const PERFORMANCE_LEAD_ROLES: readonly string[] = ['owner', 'admin', 'architect', 'leader']
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
  return { key: '', label: '', unit: '', source, signal_id: null, op: '/', operand_a: '', operand_b: '', max_step: '' }
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
export function checkVariables(vars: Pick<VariableDraft, 'key' | 'source' | 'signal_id' | 'operand_a' | 'operand_b'>[]): string | null {
  const keys = vars.map(v => normKey(v.key))
  for (const k of keys) if (!KEY_RE.test(k)) return `Clave no válida: «${k || '(vacía)'}» (letra inicial, mayúsculas, dígitos o _, máx. 10)`
  const dup = keys.find((k, i) => keys.indexOf(k) !== i)
  if (dup) return `Clave repetida: ${dup}`
  const set = new Set(keys)
  for (const v of vars) {
    if (v.source === 'signal' && !v.signal_id) return `La variable ${normKey(v.key)} necesita una señal`
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
  if (run.status === 'closed' && run.formal_started_at && run.closed_at) {
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
