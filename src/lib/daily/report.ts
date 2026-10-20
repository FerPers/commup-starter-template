/**
 * Reporte diario (fase 5 del plan readiness, sesión 3 — 2026-10-16).
 *
 * Tipos del JSON que arma la BD (`daily_report_data`, migración 20261017180000) y el texto que se le pasa
 * a Claude. Lógica pura (tests en report.test.ts): la IA solo redacta con estos datos; las cifras del PDF
 * salen siempre de `data`, nunca del texto de la IA.
 *
 * S10 (D-06, D12): las listas vienen recortadas a 30; el total va aparte (`*_count`). Los reportes congelados
 * antes de S10 no traen ni el total (se usa el largo de la lista) ni `timezone` (su día se cortó en UTC).
 */
import { timeIn } from '@/lib/time/zone'

export const REPORT_SECTIONS = ['summary', 'key_events', 'issues', 'constraints', 'next_day_plan'] as const
export type ReportSection = (typeof REPORT_SECTIONS)[number]
export type ReportSections = Record<ReportSection, string>

/** Columna de BD de cada sección (constraints → constraints_text). */
export const SECTION_COLUMN: Record<ReportSection, 'summary' | 'key_events' | 'issues' | 'constraints_text' | 'next_day_plan'> = {
  summary: 'summary', key_events: 'key_events', issues: 'issues', constraints: 'constraints_text', next_day_plan: 'next_day_plan',
}

type Sys = { system: string | null }
export type ReportData = {
  date: string
  /** S10: zona IANA con la que se cortó el día (ausente = reporte anterior a S10, día en UTC). */
  timezone?: string
  /** S10 (D-29): momento en que se calculó el estado actual (avance, regresiones, abiertos). */
  as_of?: string
  project: { code: string; name: string }
  area: { code: string; name: string } | null
  progress: { weighted_pct: number; prev_pct: number | null; prev_date: string | null; gates_approved: number; gates_total: number }
  itrs: { completed_today: number; in_progress: number; approved_today_count?: number; approved_today: ({ number: string; tag: string | null } & Sys)[] }
  punches: {
    raised_today_count?: number
    raised_today: ({ number: string; category: string; description: string; tag: string | null } & Sys)[]
    closed_today: number; open_a: number; open_b: number
  }
  gates: { approved_today: { system: string; gate: string; status: string }[]; regressed: { system: string; gate: string }[] }
  constraints: {
    open_by_level: Record<'1' | '2' | '3' | '4', number>
    overdue: number
    new_today: ({ number: string; title: string; level: number; need_date: string } & Sys)[]
    escalated_today: ({ number: string; title: string; from: string; to: string; reason: string | null } & Sys)[]
    open_high_count?: number
    open_high: ({ number: string; title: string; level: number; need_date: string; impact: string; recovery: string | null } & Sys)[]
  }
  actions: { open: number; verified_today: number; overdue_count?: number; overdue: ({ number: string; title: string; due_date: string; priority: string } & Sys)[] }
  tqs: { issued_today: number; answered_today: number; overdue: number; design_changes_today: number }
  registers_in_field_count?: number
  registers_in_field: ({ number: string; kind: string; status: string; title: string } & Sys)[]
  lookahead_7d: ({ kind: 'gate' | 'constraint' | 'action'; ref: string; title: string; date: string } & Sys)[]
  /** F6-S2: hitos y eventos de arranque del día (ausente en reportes congelados antes de la bitácora). */
  startup_events_today?: ({ number: string; kind: 'milestone' | 'free'; code: string; title: string; occurred_at: string; status: string;
    params: { label: string; value: string | null; unit: string | null }[] } & Sys)[]
  /** F7: intentos de prueba de desempeño cerrados o con resultado hoy y certificados PTC aceptados hoy. */
  performance_today?: ({ kind: 'run' | 'certificate'; number: string; title: string; status: string; result?: string | null; early_close?: boolean; at: string } & Sys)[]
}

/** Total de una lista recortada a 30 (S10, D-06): el `*_count` de la BD, o el largo en reportes anteriores. */
export function listTotal(count: number | null | undefined, rows: unknown[] | null | undefined): number {
  return typeof count === 'number' ? count : (rows?.length ?? 0)
}

/** Totales de las listas del reporte. */
export function reportTotals(d: ReportData) {
  return {
    approvedToday: listTotal(d.itrs.approved_today_count, d.itrs.approved_today),
    raisedToday: listTotal(d.punches.raised_today_count, d.punches.raised_today),
    actionsOverdue: listTotal(d.actions.overdue_count, d.actions.overdue),
    constraintsHigh: listTotal(d.constraints.open_high_count, d.constraints.open_high),
    registersInField: listTotal(d.registers_in_field_count, d.registers_in_field),
  }
}

/** D12: reporte armado antes de la zona horaria del proyecto (su día se cortó en UTC). */
export function cutInUtc(d: ReportData): boolean {
  return !d.timezone
}

/** « (se listan 30)» cuando la lista está recortada. */
const more = (total: number, shown: number) => (total > shown ? ` (se listan ${shown})` : '')

/** Delta de avance ponderado en puntos porcentuales (null si no hay snapshot previo). */
export function progressDelta(p: ReportData['progress']): number | null {
  if (p.prev_pct === null || p.prev_pct === undefined) return null
  return Math.round((Number(p.weighted_pct) - Number(p.prev_pct)) * 1000) / 10
}

const pct = (x: number) => `${(Number(x) * 100).toFixed(1)} %`
const list = <T>(rows: T[], fmt: (r: T) => string, empty = '—') => (rows.length ? rows.map(r => `- ${fmt(r)}`).join('\n') : empty)
const sys = (r: Sys) => (r.system ? ` [${r.system}]` : '')

/** Texto compacto (sin JSON) que recibe la IA. Solo hechos del día; nada que no esté en `data`. */
export function reportFacts(d: ReportData): string {
  const delta = progressDelta(d.progress)
  const lv = d.constraints.open_by_level
  const n = reportTotals(d)
  const tz = d.timezone ?? 'UTC'
  return [
    `Proyecto: ${d.project.code} — ${d.project.name}${d.area ? ` · Área ${d.area.code} — ${d.area.name}` : ''}`,
    `Fecha del reporte: ${d.date} (día local, zona ${tz})`,
    '',
    `AVANCE: ponderado ${pct(d.progress.weighted_pct)}${delta === null ? ' (sin snapshot previo)' : ` (${delta >= 0 ? '+' : ''}${delta} pp desde ${d.progress.prev_date})`}; gates aprobados ${d.progress.gates_approved}/${d.progress.gates_total}.`,
    `ITR: ${n.approvedToday} aprobados hoy${more(n.approvedToday, d.itrs.approved_today.length)}, ${d.itrs.completed_today} completados hoy, ${d.itrs.in_progress} en curso.`,
    list(d.itrs.approved_today, r => `${r.number}${r.tag ? ` (${r.tag})` : ''}${sys(r)}`, '(ninguno aprobado hoy)'),
    `PUNCH: ${n.raisedToday} levantados hoy${more(n.raisedToday, d.punches.raised_today.length)}, ${d.punches.closed_today} cerrados hoy; abiertos Cat A ${d.punches.open_a}, Cat B ${d.punches.open_b}.`,
    list(d.punches.raised_today, r => `${r.number} Cat ${r.category}: ${r.description}${r.tag ? ` (${r.tag})` : ''}${sys(r)}`, '(ninguno levantado hoy)'),
    `GATES aprobados hoy: ${d.gates.approved_today.map(g => `${g.system} ${g.gate}`).join(', ') || 'ninguno'}. En regresión: ${d.gates.regressed.map(g => `${g.system} ${g.gate}`).join(', ') || 'ninguno'}.`,
    `RESTRICCIONES abiertas por nivel: N1 ${lv['1']}, N2 ${lv['2']}, N3 ${lv['3']}, N4 ${lv['4']}; vencidas ${d.constraints.overdue}.`,
    'Nuevas hoy:', list(d.constraints.new_today, r => `${r.number} N${r.level}: ${r.title}${sys(r)} (requerida ${r.need_date})`),
    'Escaladas hoy:', list(d.constraints.escalated_today, r => `${r.number}: N${r.from} → N${r.to}${r.reason ? ` — ${r.reason}` : ''}${sys(r)}`),
    `Críticas (N≥3 o vencidas): ${n.constraintsHigh}${more(n.constraintsHigh, d.constraints.open_high.length)}`, list(d.constraints.open_high, r => `${r.number} N${r.level}: ${r.title}${sys(r)} · requerida ${r.need_date} · impacto ${r.impact}${r.recovery ? ` · recuperación: ${r.recovery}` : ''}`),
    `ACCIONES: ${d.actions.open} abiertas, ${d.actions.verified_today} verificadas hoy, ${n.actionsOverdue} vencidas${more(n.actionsOverdue, d.actions.overdue.length)}.`,
    list(d.actions.overdue, r => `${r.number} (${r.priority}): ${r.title}${sys(r)} · vencía ${r.due_date}`, '(ninguna vencida)'),
    `TQ: ${d.tqs.issued_today} emitidos hoy, ${d.tqs.answered_today} respondidos hoy, ${d.tqs.overdue} vencidos, ${d.tqs.design_changes_today} con cambio de diseño hoy.`,
    `ESTADO TEMPORAL EN CAMPO (registros activos o por verificar): ${n.registersInField}${more(n.registersInField, d.registers_in_field.length)}.`,
    list(d.registers_in_field, r => `${r.number} (${r.kind}, ${r.status}): ${r.title}${sys(r)}`),
    'EVENTOS DE ARRANQUE HOY (bitácora):',
    list(d.startup_events_today ?? [], r => `${timeIn(r.occurred_at, tz)} ${r.number} ${r.kind === 'milestone' ? 'HITO' : 'evento'} ${r.code}: ${r.title}${sys(r)} (${r.status})`
      + (r.params.length ? ` · ${r.params.map(p => `${p.label}=${p.value ?? '—'}${p.unit ? ` ${p.unit}` : ''}`).join(', ')}` : ''), '(ninguno)'),
    'PRUEBAS DE DESEMPEÑO HOY:',
    list(d.performance_today ?? [], r => r.kind === 'run'
      ? `${r.number}: ${r.title}${sys(r)} — ${r.result ? `resultado ${r.result}` : 'cerrado, sin resultado'}${r.early_close ? ' (cierre anticipado)' : ''}`
      : `${r.number}: certificado PTC aceptado (${r.title})${sys(r)}`, '(ninguna)'),
    'PRÓXIMOS 7 DÍAS:',
    list(d.lookahead_7d, r => `${r.date} · ${r.kind} ${r.ref}: ${r.title}${sys(r)}`, '(nada comprometido)'),
  ].join('\n')
}

export function emptySections(): ReportSections {
  return { summary: '', key_events: '', issues: '', constraints: '', next_day_plan: '' }
}
