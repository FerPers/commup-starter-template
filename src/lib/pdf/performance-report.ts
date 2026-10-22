/**
 * Reporte de prueba de desempeño (fase 7 del plan readiness, sesión 2b — guía 18.46): 14 secciones.
 * Se genera siempre desde la evaluación (congelada si el resultado está registrado) y los datos de 1 minuto
 * congelados del intento; no se guarda en storage. Bilingüe.
 */

import { criterionText, type Evaluation } from '@/lib/performance/catalog'
import { A4_W, COLOR, CONTENT_W, FOOTER_H, MARGIN, Renderer, sanitize, wrapText, type Color } from './renderer'
import { dateTimeIn, timeIn, zoneLabel } from '@/lib/time/zone'
import { minMaxDownsample } from '@/lib/performance/series'

type Lang = 'es' | 'en'

export type PerformancePdfInput = {
  lang: Lang
  orgName: string
  projectCode: string
  test: { number: string; title: string }
  run: {
    number: string; status: string; stabilizationAt: string | null; formalAt: string | null; formalNote: string | null
    closedAt: string | null; earlyClose: boolean; earlyReason: string | null; evaluationHash: string | null
    resultBy: string | null; resultAt: string | null
  }
  revision: { rev: number; hash: string | null; stabilizationMin: number; formalMin: number; sampleIntervalS: number; minCoveragePct: number; approvedBy: string | null; approvedAt: string | null }
  sections: Record<string, string>
  primarySystem: string
  systems: string[]
  procedure: string | null
  variables: { key: string; label: string; source: string; ref: string; unit: string | null; every: number | null }[]
  evaluation: Evaluation
  disturbances: { start: string; end: string | null; kind: string; description: string; excluded: boolean; reason: string | null; by: string | null; ackBy?: string | null; ackAt?: string | null }[]
  series: { key: string; unit: string | null; points: { t: number; v: number }[] }[]
  action: string | null
  certificate: { number: string; status: string; hash: string | null; signatures: { capacity: string; name: string | null; at: string | null }[] } | null
  labels: { result: (r: string) => string; outcome: (o: string) => string; reason: (r: string) => string; source: (s: string) => string; distKind: (k: string) => string; certStatus: (s: string) => string; capacity: (c: string) => string }
  /** S10 (E-15c): zona del proyecto para las horas (antes UTC). */
  timezone?: string
}

const T = {
  doc: { es: 'Reporte de prueba de desempeño', en: 'Performance test report' },
  s: {
    es: ['Identificación', 'Objetivo', 'Frontera y sistemas', 'Condiciones de proceso', 'Método y procedimiento', 'Instrumentación y variables',
      'Criterios de aceptación', 'Cronología', 'Perturbaciones y exclusiones', 'Validación de datos', 'Reconciliación de medidores',
      'Resultados por criterio', 'Conclusión', 'Aceptación'],
    en: ['Identification', 'Objective', 'Boundary and systems', 'Process conditions', 'Method and procedure', 'Instrumentation and variables',
      'Acceptance criteria', 'Chronology', 'Disturbances and exclusions', 'Data validation', 'Meter reconciliation',
      'Results by criterion', 'Conclusion', 'Acceptance'],
  },
  test: { es: 'Prueba', en: 'Test' }, attempt: { es: 'Intento', en: 'Attempt' }, revision: { es: 'Definición', en: 'Definition' },
  primary: { es: 'Sistema principal', en: 'Primary system' }, project: { es: 'Organización / proyecto', en: 'Organization / project' },
  result: { es: 'Resultado', en: 'Result' }, suggested: { es: 'Sugerido por la evaluación', en: 'Suggested by the evaluation' },
  systems: { es: 'Sistemas incluidos', en: 'Included systems' }, procedure: { es: 'Procedimiento de prueba', en: 'Test procedure' },
  none: { es: '—', en: '—' }, notDefined: { es: '(sin definir)', en: '(not defined)' },
  stab: { es: 'Inicio de estabilización', en: 'Stabilization start' }, formal: { es: 'Inicio del periodo formal', en: 'Formal period start' },
  close: { es: 'Cierre', en: 'Close' }, defined: { es: 'Duraciones definidas', en: 'Defined durations' },
  valid: { es: 'Minutos válidos', en: 'Valid minutes' }, early: { es: 'Cierre anticipado', en: 'Early close' },
  sampling: { es: 'Muestreo / cobertura', en: 'Sampling / coverage' },
  corrections: { es: 'Correcciones', en: 'Corrections' }, uncertainty: { es: 'Incertidumbre', en: 'Uncertainty' },
  references: { es: 'Referencias', en: 'References' }, responsibilities: { es: 'Responsabilidades', en: 'Responsibilities' },
  reasons: { es: 'Motivos de no concluyente', en: 'Inconclusive because of' }, reason: { es: 'Motivo del resultado', en: 'Result reason' },
  action: { es: 'Acción de seguimiento', en: 'Follow-up action' }, recordedBy: { es: 'Registró', en: 'Recorded by' },
  noCert: { es: 'Sin certificado PTC emitido.', en: 'No PTC certificate issued.' }, cert: { es: 'Certificado', en: 'Certificate' },
  hashes: { es: 'Huellas (sha256)', en: 'Fingerprints (sha256)' }, defHash: { es: 'Definición', en: 'Definition' },
  evalHash: { es: 'Evaluación', en: 'Evaluation' }, certHash: { es: 'Certificado', en: 'Certificate' },
  draft: { es: 'BORRADOR — resultado no registrado', en: 'DRAFT — result not recorded' }, page: { es: 'Página', en: 'Page' },
  noDist: { es: 'Sin perturbaciones registradas.', en: 'No disturbances recorded.' }, noPairs: { es: 'Sin pares definidos.', en: 'No pairs defined.' },
  excluded: { es: 'Excluida', en: 'Excluded' }, included: { es: 'Incluida', en: 'Included' }, every: { es: 'cada', en: 'every' },
  ackBy: { es: 'reconoció', en: 'acknowledged by' }, noAck: { es: 'sin reconocer por el cliente', en: 'not acknowledged by the client' },
  withoutExcl: { es: 'Sugerido sin exclusiones', en: 'Suggested without exclusions' }, exclChange: { es: 'las exclusiones cambian el resultado', en: 'exclusions change the result' },
  col: {
    key: { es: 'Clave', en: 'Key' }, desc: { es: 'Descripción', en: 'Description' }, source: { es: 'Origen', en: 'Source' },
    ref: { es: 'Señal / fórmula', en: 'Signal / formula' }, unit: { es: 'Unidad', en: 'Unit' }, criterion: { es: 'Criterio', en: 'Criterion' },
    value: { es: 'Obtenido', en: 'Obtained' }, outcome: { es: 'Resultado', en: 'Outcome' }, window: { es: 'Ventana', en: 'Window' },
    kind: { es: 'Tipo', en: 'Type' }, calc: { es: 'Cálculo', en: 'Calculation' }, coverage: { es: 'Cobertura', en: 'Coverage' },
    bad: { es: 'Calidad mala', en: 'Bad quality' }, spikes: { es: 'Picos', en: 'Spikes' }, state: { es: 'Estado', en: 'State' },
    pair: { es: 'Par', en: 'Pair' }, diff: { es: 'Dif. promedio', en: 'Avg. diff.' }, max: { es: 'Máx.', en: 'Max' },
  },
  yes: { es: 'Evaluable', en: 'Evaluable' }, no: { es: 'No evaluable', en: 'Not evaluable' }, ok: { es: 'Reconciliados', en: 'Reconciled' }, bad: { es: 'Fuera', en: 'Out' },
}

// S10 (E-15c): hora del proyecto con su zona (antes «… UTC»).
const fmtDt = (iso: string | null, tz: string) => (iso ? `${dateTimeIn(iso, tz)} ${zoneLabel(tz, new Date(iso))}` : '—')
const num = (n: number | null | undefined, d = 3) => (n === null || n === undefined ? '—' : String(Math.round(Number(n) * 10 ** d) / 10 ** d))
const RESULT_COLOR: Record<string, [Color, Color]> = {
  accepted: [COLOR.green, COLOR.greenBg], accepted_with_deviation: [COLOR.amber, COLOR.amberBg], failed: [COLOR.red, COLOR.redBg],
  repeat: [COLOR.purple, COLOR.purpleBg], inconclusive: [COLOR.muted, COLOR.borderXlight],
}


export async function renderPerformancePdf(x: PerformancePdfInput): Promise<Uint8Array> {
  const tz = x.timezone ?? 'UTC'
  const dt = (iso: string | null) => fmtDt(iso, tz)
  const L = x.lang
  const e = x.evaluation
  const result = e.result ?? null
  const r = await Renderer.create()
  r.doc.setTitle(sanitize(`${x.run.number} · ${x.test.title}`))
  r.doc.setAuthor('CommUp')
  r.setFooter(({ page, pageNum }) => {
    page.drawLine({ start: { x: MARGIN, y: MARGIN + FOOTER_H - 4 }, end: { x: A4_W - MARGIN, y: MARGIN + FOOTER_H - 4 }, thickness: 0.5, color: COLOR.borderLight })
    page.drawText(sanitize(`${x.run.number} · R${x.revision.rev}${x.run.evaluationHash ? ` · sha256 ${x.run.evaluationHash.slice(0, 16)}` : ` · ${T.draft[L]}`}`), { x: MARGIN, y: MARGIN + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    const s = `${T.page[L]} ${pageNum} / `
    const totalX = A4_W - MARGIN - 12
    page.drawText(s, { x: totalX - r.fontRegular.widthOfTextAtSize(s, 7), y: MARGIN + 6, size: 7, font: r.fontRegular, color: COLOR.empty })
    r.registerTotalPagesPlaceholder(page, totalX, MARGIN + 6, 7, COLOR.empty)
  })

  const para = (text: string, size = 9, color = COLOR.text) => {
    for (const raw of text.split('\n')) {
      const lines = wrapText(raw, r.fontRegular, size, CONTENT_W - 4)
      if (!lines.length) { r.moveY(4); continue }
      for (const l of lines) { r.ensureSpace(size + 3); r.drawText(l, { x: MARGIN, y: r.y - size, size, color }); r.moveY(size + 3) }
    }
  }
  const text = (k: string) => x.sections[k]?.trim() || ''
  const section = (i: number) => r.accentSection(`${i + 1}. ${T.s[L][i]}`)
  const table = (cols: { label: string; frac: number; align?: 'left' | 'right' | 'center' }[], rows: string[][], colors?: (Color | null)[][]) => {
    const c = cols.map(col => ({ label: col.label, w: CONTENT_W * col.frac, align: col.align }))
    r.tableHeader(c)
    rows.forEach((row, i) => {
      if (r.y - 13 < MARGIN + FOOTER_H) { r.newPage(); r.tableHeader(c) }
      r.tableRow(c, row, { alternate: i % 2 === 1, valueColors: colors?.[i] })
    })
    r.moveY(4)
  }

  // Encabezado
  r.newPage()
  r.topBar(COLOR.purple, 6)
  r.moveY(8)
  r.drawText('CommUp', { x: MARGIN, y: r.y - 14, size: 14, bold: true, color: COLOR.purple })
  const [fg, bg] = RESULT_COLOR[result ?? ''] ?? [COLOR.amber, COLOR.amberBg]
  r.badge(result ? x.labels.result(result) : T.draft[L], { x: A4_W - MARGIN - 190, y: r.y - 14, fg, bg, size: 9 })
  r.moveY(20)
  r.drawText(`${T.doc[L]} — ${x.test.title}`, { x: MARGIN, y: r.y - 13, size: 13, bold: true, maxWidth: CONTENT_W })
  r.moveY(16)
  r.drawText(`${x.orgName} · ${x.projectCode} · ${x.run.number}`, { x: MARGIN, y: r.y - 10, size: 9.5, color: COLOR.muted, maxWidth: CONTENT_W })
  r.moveY(14)
  r.drawHLine(MARGIN, A4_W - MARGIN, r.y, 1, COLOR.text)
  r.moveY(4)

  // 1. Identificación
  section(0)
  r.kv(T.test[L], `${x.test.number} — ${x.test.title}`)
  r.kv(T.attempt[L], x.run.number)
  r.kv(T.revision[L], `R${x.revision.rev}${x.revision.approvedBy ? ` · ${x.revision.approvedBy} ${dt(x.revision.approvedAt)}` : ''}`)
  r.kv(T.primary[L], x.primarySystem)
  r.kv(T.project[L], `${x.orgName} / ${x.projectCode}`)
  r.kv(T.suggested[L], x.labels.result(e.suggested))
  // S25 (E-19): con exclusiones, también el resultado sin ellas.
  if (e.without_exclusions) r.kv(T.withoutExcl[L], `${x.labels.result(e.without_exclusions.suggested)}${e.exclusions_change_result ? ` (${T.exclChange[L]})` : ''}`)
  r.kv(T.result[L], result ? x.labels.result(result) : T.draft[L])

  // 2–4. Objetivo, frontera, condiciones
  section(1); para(text('purpose') || T.notDefined[L])
  section(2); if (text('boundary')) para(text('boundary')); r.kv(T.systems[L], x.systems.join(', ') || x.primarySystem)
  section(3); para(text('conditions') || T.notDefined[L])

  // 5. Método y procedimiento
  section(4)
  para(text('method') || T.notDefined[L])
  r.kv(T.procedure[L], x.procedure ?? T.none[L])
  for (const k of ['responsibilities', 'references'] as const) if (text(k)) { r.kv(T[k][L], ''); para(text(k)) }

  // 6. Instrumentación y variables
  section(5)
  table([{ label: T.col.key[L], frac: 0.1 }, { label: T.col.desc[L], frac: 0.34 }, { label: T.col.source[L], frac: 0.14 }, { label: T.col.ref[L], frac: 0.27 }, { label: T.col.unit[L], frac: 0.15 }],
    x.variables.map(v => [v.key, v.label, x.labels.source(v.source), v.source === 'manual' && v.every ? `${T.every[L]} ${v.every} min` : v.ref, v.unit ?? '']))
  r.kv(T.sampling[L], `${x.revision.sampleIntervalS} s / ${x.revision.minCoveragePct} %`)
  for (const k of ['corrections', 'uncertainty'] as const) if (text(k)) { r.kv(T[k][L], ''); para(text(k)) }

  // 7. Criterios
  const unitOf = (k: string) => e.variables.find(v => v.key === k)?.unit ?? null
  const critText = (c: Evaluation['criteria'][number]) => criterionText({
    variable_key: c.variable_key, statistic: c.statistic, band_lo: c.band_lo === null ? '' : String(c.band_lo), band_hi: c.band_hi === null ? '' : String(c.band_hi),
    total_basis: c.total_basis ?? 'h', operator: c.operator, target: String(c.target), target_hi: c.target_hi === null ? '' : String(c.target_hi),
    uncertainty: String(c.uncertainty), uncertainty_mode: c.uncertainty_mode,
  }, unitOf(c.variable_key))
  section(6)
  table([{ label: '#', frac: 0.06, align: 'center' }, { label: T.col.criterion[L], frac: 0.62 }, { label: T.col.desc[L], frac: 0.32 }],
    e.criteria.map(c => [String(c.ord), critText(c), c.label ?? '']))

  // 8. Cronología
  section(7)
  r.kv(T.defined[L], `${x.revision.stabilizationMin} + ${x.revision.formalMin} min`)
  r.kv(T.stab[L], dt(x.run.stabilizationAt))
  r.kv(T.formal[L], `${dt(x.run.formalAt)}${x.run.formalNote ? ` · ${x.run.formalNote}` : ''}`)
  r.kv(T.close[L], `${dt(x.run.closedAt)}${x.run.earlyClose ? ` · ${T.early[L]}${x.run.earlyReason ? `: ${x.run.earlyReason}` : ''}` : ''}`)
  r.kv(T.valid[L], `${e.window.valid_min} / ${e.window.total_min} (${e.window.excluded_min} ${L === 'es' ? 'excluidos' : 'excluded'})`)

  // 9. Perturbaciones
  section(8)
  if (!x.disturbances.length) para(T.noDist[L], 9, COLOR.muted)
  else table([{ label: T.col.window[L], frac: 0.28 }, { label: T.col.kind[L], frac: 0.16 }, { label: T.col.desc[L], frac: 0.36 }, { label: T.col.calc[L], frac: 0.2 }],
    x.disturbances.map(d => [`${dt(d.start)} -> ${d.end ? timeIn(d.end, tz) : '...'}`, x.labels.distKind(d.kind), `${d.description}${d.reason ? ` (${d.reason})` : ''}`, d.excluded ? `${T.excluded[L]} · ${d.ackBy ? `${T.ackBy[L]} ${d.ackBy}` : T.noAck[L]}` : T.included[L]]))

  // 10. Validación de datos + gráficos
  r.ensureSpace(90)
  section(9)
  table([{ label: T.col.key[L], frac: 0.12 }, { label: T.col.ref[L], frac: 0.2 }, { label: T.col.coverage[L], frac: 0.2, align: 'right' }, { label: T.col.bad[L], frac: 0.14, align: 'right' }, { label: T.col.spikes[L], frac: 0.12, align: 'right' }, { label: T.col.state[L], frac: 0.22 }],
    e.variables.map(v => [v.key, v.signal ?? v.formula ?? x.labels.source(v.source), `${num(v.coverage_pct, 1)} %${v.expected !== undefined ? ` (${v.present}/${num(v.expected, 1)})` : ''}`,
      v.bad_pct === undefined ? '—' : `${num(v.bad_pct, 1)} %`, v.spikes === undefined ? '—' : String(v.spikes + (v.out_of_range ?? 0)), v.evaluable ? T.yes[L] : T.no[L]]),
    e.variables.map(v => [null, null, v.coverage_ok === false ? COLOR.red : null, null, null, v.evaluable ? COLOR.green : COLOR.red]))
  for (const s of x.series) chart(r, s, x.run.formalAt ? Date.parse(x.run.formalAt) : null)

  // 11. Reconciliación
  section(10)
  if (!e.pairs.length) para(T.noPairs[L], 9, COLOR.muted)
  else table([{ label: T.col.pair[L], frac: 0.3 }, { label: T.col.diff[L], frac: 0.25, align: 'right' }, { label: T.col.max[L], frac: 0.2, align: 'right' }, { label: T.col.state[L], frac: 0.25 }],
    e.pairs.map(p => [`${p.variable_a} <-> ${p.variable_b}`, p.diff_pct === null ? '—' : `${num(p.diff_pct, 2)} %`, `${p.max_diff_pct} %`, p.ok ? T.ok[L] : T.bad[L]]),
    e.pairs.map(p => [null, null, null, p.ok ? COLOR.green : COLOR.red]))

  // 12. Resultados por criterio
  section(11)
  const OUT: Record<string, Color> = { pass: COLOR.green, within_uncertainty: COLOR.amber, fail: COLOR.red, not_evaluable: COLOR.muted }
  table([{ label: T.col.criterion[L], frac: 0.55 }, { label: T.col.value[L], frac: 0.2, align: 'right' }, { label: T.col.outcome[L], frac: 0.25 }],
    e.criteria.map(c => [critText(c), c.value === null ? '—' : `${num(c.value)}${c.statistic === 'pct_in_band' ? ' %' : ''}`, x.labels.outcome(c.outcome)]),
    e.criteria.map(c => [null, null, OUT[c.outcome] ?? null]))

  // 13. Conclusión
  section(12)
  r.kv(T.suggested[L], x.labels.result(e.suggested))
  if (e.reasons.length) r.kv(T.reasons[L], e.reasons.map(x.labels.reason).join(' · '))
  r.kv(T.result[L], result ? x.labels.result(result) : T.draft[L])
  if (e.result_reason) { r.kv(T.reason[L], ''); para(e.result_reason) }
  if (x.run.resultBy) r.kv(T.recordedBy[L], `${x.run.resultBy} ${dt(x.run.resultAt)}`)
  if (x.action) r.kv(T.action[L], x.action)

  // 14. Aceptación
  section(13)
  if (!x.certificate) para(T.noCert[L], 9, COLOR.muted)
  else {
    r.kv(T.cert[L], `${x.certificate.number} · ${x.labels.certStatus(x.certificate.status)}`)
    r.moveY(6)
    r.signatureGrid(x.certificate.signatures.map(s => ({ role: x.labels.capacity(s.capacity), name: s.name ?? undefined, date: s.at ? dt(s.at) : undefined })), { placeholder: L === 'es' ? 'Nombre / fecha' : 'Name / date' })
  }
  r.moveY(6)
  r.kv(T.hashes[L], '')
  r.kv(`  ${T.defHash[L]}`, x.revision.hash ?? '—', { size: 7.5 })
  r.kv(`  ${T.evalHash[L]}`, x.run.evaluationHash ?? '—', { size: 7.5 })
  if (x.certificate) r.kv(`  ${T.certHash[L]}`, x.certificate.hash ?? '—', { size: 7.5 })

  r.finalizePagePlaceholders()
  return await r.doc.save()
}

/** Gráfico simple (polilínea) de una variable; línea vertical en el inicio del periodo formal. */
function chart(r: Renderer, s: { key: string; unit: string | null; points: { t: number; v: number }[] }, formalAt: number | null) {
  const pts = minMaxDownsample(s.points, 300)  // S12 (E-33): conserva picos
  if (pts.length < 2) return
  const h = 70
  r.ensureSpace(h + 22)
  r.drawText(`${s.key}${s.unit ? ` (${s.unit})` : ''}`, { x: MARGIN, y: r.y - 9, size: 8, bold: true, color: COLOR.muted })
  r.moveY(12)
  const top = r.y, bottom = r.y - h, left = MARGIN + 34, right = A4_W - MARGIN
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t
  let lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v))
  if (hi === lo) { hi += 1; lo -= 1 }
  const X = (t: number) => left + ((t - t0) / Math.max(1, t1 - t0)) * (right - left)
  const Y = (v: number) => bottom + ((v - lo) / (hi - lo)) * (top - bottom)
  r.drawRect({ x: left, y: bottom, width: right - left, height: h, borderColor: COLOR.borderLight, borderWidth: 0.5 })
  r.page.drawText(sanitize(String(Math.round(hi * 100) / 100)), { x: MARGIN, y: top - 7, size: 6.5, font: r.fontRegular, color: COLOR.muted })
  r.page.drawText(sanitize(String(Math.round(lo * 100) / 100)), { x: MARGIN, y: bottom, size: 6.5, font: r.fontRegular, color: COLOR.muted })
  if (formalAt && formalAt > t0 && formalAt < t1) r.drawVLine(X(formalAt), bottom, top, 0.6, COLOR.blue)
  for (let i = 1; i < pts.length; i++) {
    r.page.drawLine({ start: { x: X(pts[i - 1].t), y: Y(pts[i - 1].v) }, end: { x: X(pts[i].t), y: Y(pts[i].v) }, thickness: 0.8, color: COLOR.purple })
  }
  r.moveY(h + 8)
}
