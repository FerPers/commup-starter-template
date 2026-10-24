// Diagnóstico local y reproducible. No se conecta a la BD ni modifica plantillas.
// Ejecutar desde la raíz: node docs/diagnostico-itr-2026-10-23-evidencia/analizar.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'

async function moduleFrom(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const { checkTableConfig, evaluateTable, reshapeTable } = await moduleFrom('src/lib/itr/table.ts')
const { validateOptionOutcomes } = await moduleFrom('src/lib/itr/selection-outcome.ts')
const { evaluateContinuity } = await moduleFrom('src/lib/itr/continuity.ts')
const snapshot = JSON.parse(readFileSync('insumos-locales/diagnostico-itr-2026-10-23/plantillas.json', 'utf8'))
const codes = new Set(readFileSync('docs/itr-v2/ITR-CLASIFICACION-ORIGINALES-2026-09-09.csv', 'utf8').trim().split('\n').slice(1).map(line => line.split(',')[0].toUpperCase()))
const items = template => template.itr_template_sections.flatMap(section => section.itr_template_items)
const latestByCode = rows => Object.values(Object.fromEntries([...rows].sort((a, b) => a.version - b.version).map(t => [t.code.toUpperCase(), t])))
const report = { capturedAt: snapshot.capturedAt, originalCodes: codes.size, codeNormalization: 'upper-case (H50b -> H50B)', organizations: [], issues: [], equipmentRegressions: [], comparisons: [] }
for (const org of snapshot.orgs) {
  const all = snapshot.templates.filter(t => t.org_id === org.id)
  const templates = all.filter(t => codes.has(t.code.toUpperCase()))
  const latest = latestByCode(templates)
  const summary = { name: org.name, allRevisions: all.length, originalRevisions: templates.length, missingCodes: [...codes].filter(code => !templates.some(t => t.code.toUpperCase() === code)), groups: {} }
  for (const [label, rows] of [['active', templates.filter(t => t.is_active)], ['latest', latest]]) {
    const ii = rows.flatMap(items)
    const countBy = (arr, key) => arr.reduce((out, value) => { const k = key(value); out[k] = (out[k] ?? 0) + 1; return out }, {})
    summary.groups[label] = { templates: rows.length, versions: countBy(rows, t => t.version), items: ii.length, types: countBy(ii, i => i.item_type), photos: ii.filter(i => i.requires_photo).length, documents: ii.filter(i => i.requires_document).length, equipmentRequired: rows.filter(t => t.requires_test_equipment).length, tableVersions: countBy(ii.filter(i => i.item_type === 'table'), i => i.options?.version), optionalResultTables: ii.filter(i => i.item_type === 'table' && i.options.columns.some(c => c.type === 'result' && c.required === false)).length }
  }
  report.organizations.push(summary)
  for (const template of latest) {
    const ii = items(template)
    const active = templates.find(t => t.code === template.code && t.is_active)
    if (active?.requires_test_equipment && !template.requires_test_equipment) report.equipmentRegressions.push({ org: org.name, code: template.code, from: active.version, to: template.version })
    for (const item of ii) {
      const issue = item.item_type === 'table' ? checkTableConfig(item.options).issue : item.item_type === 'select' && !validateOptionOutcomes(item.options, item.option_outcomes) ? 'invalid outcomes' : null
      if (issue) report.issues.push({ org: org.name, code: template.code, version: template.version, item: item.item_number, issue })
    }
    if (org.slug.startsWith('demo')) report.comparisons.push({ code: template.code, activeVersion: active?.version ?? null, latestVersion: template.version, activeItems: active ? items(active).length : 0, latestItems: ii.length, active: template.is_active, photoItems: ii.filter(i => i.requires_photo).length, documentItems: ii.filter(i => i.requires_document).length, tables: ii.filter(i => i.item_type === 'table').length, equipment: template.requires_test_equipment })
  }
}
const demo = snapshot.orgs.find(o => o.slug.startsWith('demo'))
const template = (code, version) => snapshot.templates.find(t => t.org_id === demo.id && t.code === code && t.version === version)
const i10 = items(template('I10A', 3)).find(i => i.item_number === '4.01')
const cap = reshapeTable(checkTableConfig(i10.options).config, null, 3)
for (const row of cap.rows) Object.assign(row.cells, { direction: 'Ascendente', input: 50, pct_range: 50, expected: 12, observed: 99, error: 0, result: 'pass', remarks: '' })
const r = evaluateTable(i10.options, JSON.stringify(cap))
const e10 = items(template('E10B', 2)).find(i => i.item_number === 'M.1')
const ec = reshapeTable(checkTableConfig(e10.options).config, null, 1)
for (const column of e10.options.columns) ec.rows[0].cells[column.key] = column.required ? column.type === 'number' ? 1 : 'dato' : ''
const er = evaluateTable(e10.options, JSON.stringify(ec))
const i30 = items(template('I30C', 3)).find(i => i.item_number === 'E.1')
const sourceRows = [{ key: 'synthetic-effect', label: 'Efecto de prueba', refs: { effect_description: 'Dato sintético', action: 'trip', link: 'X' } }]
const ce = reshapeTable(checkTableConfig(i30.options).config, null, 1, sourceRows)
Object.assign(ce.rows[0].cells, { executed: 'No', feedback: 'pass', result: 'pass', response_s: null, remarks: '' })
const cer = evaluateTable(i30.options, JSON.stringify(ce), sourceRows)
const continuity = evaluateContinuity(JSON.stringify({ version: 1, grouping: 'conductors', count: 1, shields: [], measurementRequired: false, rows: [{ id: 'C1', from: '1', to: '1', result: 'pass', remarks: '', reading: null, unit: '' }] }))
const probes = {
  inconsistentEffect: { template: 'I30C v3', item: 'E.1', input: ce, sourceRows, isComplete: cer.isComplete, hasFail: cer.hasFail, note: 'Ejecutó la acción=No, feedback=pass, resultado=pass: el select de tabla no tiene significado de rechazo.' },
  calibrationManual: { template: 'I10A v3', item: '4.01', input: cap, isComplete: r.isComplete, hasFail: r.hasFail, note: 'Salida esperada 12, observada 99, error manual 0 y pass: no existe fórmula que detecte la inconsistencia.' },
  optionalResult: { template: 'E10B v2', item: 'M.1', input: ec, isComplete: er.isComplete, hasFail: er.hasFail, note: 'Tabla completa con resultado vacío; no prueba aprobación de un ITR completo.' },
  continuitySelfDeclared: { isComplete: continuity.isComplete, hasFail: continuity.hasFail, note: 'Un conductor sin lectura es válido según la configuración declarada por la captura; no contrasta número contra D.4 o ingeniería.' },
}
const dir = 'docs/diagnostico-itr-2026-10-23-evidencia'
writeFileSync(`${dir}/inventario.json`, JSON.stringify(report, null, 2) + '\n')
writeFileSync(`${dir}/sondas.json`, JSON.stringify(probes, null, 2) + '\n')
const rows = report.comparisons.sort((a, b) => a.code.localeCompare(b.code))
const columns = Object.keys(rows[0])
writeFileSync(`${dir}/comparacion-catalogo.csv`, [columns.join(','), ...rows.map(row => columns.map(key => row[key] ?? '').join(','))].join('\n') + '\n')
console.log(JSON.stringify({ organizations: report.organizations, invalidStructures: report.issues.length, equipmentRegressions: report.equipmentRegressions.length, probes: Object.fromEntries(Object.entries(probes).map(([key, value]) => [key, { isComplete: value.isComplete, hasFail: value.hasFail }])) }, null, 2))
