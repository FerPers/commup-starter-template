/**
 * Reporte diario (fase 5 del plan readiness, sesión 3 — 2026-10-16).
 *
 * Tipos del JSON que arma la BD (`daily_report_data`, migración 20261017180000) y el texto que se le pasa
 * a Claude. Lógica pura (tests en report.test.ts): la IA solo redacta con estos datos; las cifras del PDF
 * salen siempre de `data`, nunca del texto de la IA.
 */

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
  project: { code: string; name: string }
  area: { code: string; name: string } | null
  progress: { weighted_pct: number; prev_pct: number | null; prev_date: string | null; gates_approved: number; gates_total: number }
  itrs: { completed_today: number; in_progress: number; approved_today: ({ number: string; tag: string | null } & Sys)[] }
  punches: {
    raised_today: ({ number: string; category: string; description: string; tag: string | null } & Sys)[]
    closed_today: number; open_a: number; open_b: number
  }
  gates: { approved_today: { system: string; gate: string; status: string }[]; regressed: { system: string; gate: string }[] }
  constraints: {
    open_by_level: Record<'1' | '2' | '3' | '4', number>
    overdue: number
    new_today: ({ number: string; title: string; level: number; need_date: string } & Sys)[]
    escalated_today: ({ number: string; title: string; from: string; to: string; reason: string | null } & Sys)[]
    open_high: ({ number: string; title: string; level: number; need_date: string; impact: string; recovery: string | null } & Sys)[]
  }
  actions: { open: number; verified_today: number; overdue: ({ number: string; title: string; due_date: string; priority: string } & Sys)[] }
  tqs: { issued_today: number; answered_today: number; overdue: number; design_changes_today: number }
  registers_in_field: ({ number: string; kind: string; status: string; title: string } & Sys)[]
  lookahead_7d: ({ kind: 'gate' | 'constraint' | 'action'; ref: string; title: string; date: string } & Sys)[]
}

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
  return [
    `Proyecto: ${d.project.code} — ${d.project.name}${d.area ? ` · Área ${d.area.code} — ${d.area.name}` : ''}`,
    `Fecha del reporte: ${d.date}`,
    '',
    `AVANCE: ponderado ${pct(d.progress.weighted_pct)}${delta === null ? ' (sin snapshot previo)' : ` (${delta >= 0 ? '+' : ''}${delta} pp desde ${d.progress.prev_date})`}; gates aprobados ${d.progress.gates_approved}/${d.progress.gates_total}.`,
    `ITR: ${d.itrs.approved_today.length} aprobados hoy, ${d.itrs.completed_today} completados hoy, ${d.itrs.in_progress} en curso.`,
    list(d.itrs.approved_today, r => `${r.number}${r.tag ? ` (${r.tag})` : ''}${sys(r)}`, '(ninguno aprobado hoy)'),
    `PUNCH: ${d.punches.raised_today.length} levantados hoy, ${d.punches.closed_today} cerrados hoy; abiertos Cat A ${d.punches.open_a}, Cat B ${d.punches.open_b}.`,
    list(d.punches.raised_today, r => `${r.number} Cat ${r.category}: ${r.description}${r.tag ? ` (${r.tag})` : ''}${sys(r)}`, '(ninguno levantado hoy)'),
    `GATES aprobados hoy: ${d.gates.approved_today.map(g => `${g.system} ${g.gate}`).join(', ') || 'ninguno'}. En regresión: ${d.gates.regressed.map(g => `${g.system} ${g.gate}`).join(', ') || 'ninguno'}.`,
    `RESTRICCIONES abiertas por nivel: N1 ${lv['1']}, N2 ${lv['2']}, N3 ${lv['3']}, N4 ${lv['4']}; vencidas ${d.constraints.overdue}.`,
    'Nuevas hoy:', list(d.constraints.new_today, r => `${r.number} N${r.level}: ${r.title}${sys(r)} (requerida ${r.need_date})`),
    'Escaladas hoy:', list(d.constraints.escalated_today, r => `${r.number}: N${r.from} → N${r.to}${r.reason ? ` — ${r.reason}` : ''}${sys(r)}`),
    'Críticas (N≥3 o vencidas):', list(d.constraints.open_high, r => `${r.number} N${r.level}: ${r.title}${sys(r)} · requerida ${r.need_date} · impacto ${r.impact}${r.recovery ? ` · recuperación: ${r.recovery}` : ''}`),
    `ACCIONES: ${d.actions.open} abiertas, ${d.actions.verified_today} verificadas hoy, ${d.actions.overdue.length} vencidas.`,
    list(d.actions.overdue, r => `${r.number} (${r.priority}): ${r.title}${sys(r)} · vencía ${r.due_date}`, '(ninguna vencida)'),
    `TQ: ${d.tqs.issued_today} emitidos hoy, ${d.tqs.answered_today} respondidos hoy, ${d.tqs.overdue} vencidos, ${d.tqs.design_changes_today} con cambio de diseño hoy.`,
    `ESTADO TEMPORAL EN CAMPO (registros activos o por verificar): ${d.registers_in_field.length}.`,
    list(d.registers_in_field, r => `${r.number} (${r.kind}, ${r.status}): ${r.title}${sys(r)}`),
    'PRÓXIMOS 7 DÍAS:',
    list(d.lookahead_7d, r => `${r.date} · ${r.kind} ${r.ref}: ${r.title}${sys(r)}`, '(nada comprometido)'),
  ].join('\n')
}

export function emptySections(): ReportSections {
  return { summary: '', key_events: '', issues: '', constraints: '', next_day_plan: '' }
}
