#!/usr/bin/env node
// Fase 2 (diseño manual) — crea borradores v2 inactivos a partir de especificaciones
// escritas a mano en scripts/itr-v2/manual/<CODIGO>.json, para los formatos que el
// generador automático (generar-v2-listas.mjs) no puede representar (tablas de
// operación, matrices irregulares, datos mezclados con la lista).
//
// La especificación describe secciones e ítems con el mismo estándar v2:
//   R.n referencias · D.n datos del elemento · numeración original en Inspección ·
//   M.n registros de ensayo (mediciones, selecciones informativas o tablas) ·
//   T.1–T.5 equipo de prueba · O.1 observaciones.
// Atajos: "R.1", "T" y "O.1" como cadenas expanden los bloques estándar; type "check"
// = selección Conforme/No conforme/No aplica con resultado.
//
// Uso (desde la raíz del repo, con .env.local):
//   node scripts/itr-v2/generar-v2-manual.mjs                         # vista previa de todas las specs
//   node scripts/itr-v2/generar-v2-manual.mjs --codes I02A,I16A       # solo esos códigos
//   node scripts/itr-v2/generar-v2-manual.mjs --codes I02A --apply    # escribe el borrador
// Salvaguarda: si ya existe una revisión posterior a la activa (borrador) no se crea otra
// salvo con --force (regla: no duplicar borradores).
// Salida: docs/ITR-FASE2-MANUAL-<fecha>.csv (--csv <ruta> para otro destino).

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..')
const SPECS = path.join(ROOT, 'scripts/itr-v2/manual')
const ORG = 'e12c53b2-85fd-462f-86f3-bba318aa77ee' // DEMO Refinería Los Andes (AUTOTEST)
const ACTOR = 'fc1593b4-5fc1-4eae-9fb0-b213ecae7366' // Luis (owner) — queda en activity_log
const TODAY = new Date().toISOString().slice(0, 10)

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const FORCE = args.includes('--force')
const codesArg = args.includes('--codes') ? args[args.indexOf('--codes') + 1] : null

const env = Object.fromEntries(readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const OPTIONS = ['Conforme', 'No conforme', 'No aplica']
const OUTCOMES = { Conforme: 'pass', 'No conforme': 'fail', 'No aplica': 'not_applicable' }
const ITEM_TYPES = new Set(['text', 'number', 'measurement', 'select', 'date', 'table', 'yes_no', 'continuity'])
const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/

const STD = {
  'R.1': { n: 'R.1', type: 'text', en: 'Identification and revision of the drawings, specifications or procedure used for this inspection.', es: 'Identificación y revisión de los planos, especificaciones o procedimiento utilizados para esta inspección.' },
  'O.1': { n: 'O.1', type: 'text', required: false, en: 'Inspection remarks and references to findings recorded in the Punch List, where applicable.', es: 'Observaciones de la inspección y referencias a hallazgos registrados en Punch List, cuando correspondan.' },
  T: [
    { n: 'T.1', type: 'text', en: 'Test equipment make.', es: 'Fabricante del equipo de prueba.' },
    { n: 'T.2', type: 'text', en: 'Test equipment model.', es: 'Modelo del equipo de prueba.' },
    { n: 'T.3', type: 'text', en: 'Test equipment serial number.', es: 'Número de serie del equipo de prueba.' },
    { n: 'T.4', type: 'date', en: 'Calibration expiry date of the test equipment.', es: 'Fecha de vencimiento de la calibración del equipo de prueba.' },
    { n: 'T.5', type: 'text', document: true, en: 'Calibration certificate of the test equipment (attach the certificate).', es: 'Certificado de calibración del equipo de prueba (adjuntar el certificado).' },
  ],
}

function col(c) {
  return { key: c.key, label: c.label, type: c.type, unit: c.unit ?? null, options: c.options ?? null, min: c.min ?? null, max: c.max ?? null, required: c.required ?? true }
}

function validateTable(t, where) {
  if (!t || !Array.isArray(t.columns) || !t.rows) throw new Error(`${where}: tabla sin columnas o filas`)
  if (t.columns.length < 1 || t.columns.length > 16) throw new Error(`${where}: ${t.columns.length} columnas (máx. 16)`)
  const keys = new Set()
  for (const c of t.columns) {
    if (!KEY_RE.test(c.key) || keys.has(c.key)) throw new Error(`${where}: clave de columna inválida o repetida «${c.key}»`)
    keys.add(c.key)
    if (!['text', 'number', 'select', 'result'].includes(c.type)) throw new Error(`${where}: tipo de columna «${c.type}»`)
    if (c.type === 'select' && (!Array.isArray(c.options) || !c.options.length)) throw new Error(`${where}: select sin opciones (${c.key})`)
    if (!c.label) throw new Error(`${where}: columna sin etiqueta (${c.key})`)
  }
  if (t.rows.mode === 'fixed') { if (!Array.isArray(t.rows.labels) || !t.rows.labels.length || t.rows.labels.length > 200) throw new Error(`${where}: filas fijas inválidas`) }
  else if (t.rows.mode === 'variable') { if (!Number.isInteger(t.rows.min) || !Number.isInteger(t.rows.max) || t.rows.min < 1 || t.rows.max > 500 || t.rows.min > t.rows.max || !t.rows.label) throw new Error(`${where}: filas variables inválidas`) }
  else throw new Error(`${where}: rows.mode debe ser fixed o variable`)
  return { version: 1, columns: t.columns.map(col), rows: t.rows }
}

/** Expande la especificación a filas de itr_template_items (sin section_id/template_id). */
function expand(spec) {
  const sections = []
  const stats = { items: 0, photos: 0, docs: 0, tables: 0, checks: 0 }
  for (const sec of spec.sections) {
    const items = []
    for (const raw of sec.items) {
      const list = typeof raw === 'string' ? (raw === 'T' ? STD.T : [STD[raw]]) : [raw]
      if (list.some(x => !x)) throw new Error(`${spec.code}: atajo desconocido «${raw}»`)
      for (const it of list) {
        const where = `${spec.code} ${it.n}`
        if (!it.n || !it.en || !it.es) throw new Error(`${where}: faltan n/en/es`)
        const type = it.type === 'check' ? 'select' : it.type
        if (!ITEM_TYPES.has(type)) throw new Error(`${where}: tipo «${it.type}»`)
        let options = null, outcomes = {}
        if (it.type === 'check') { options = OPTIONS; outcomes = OUTCOMES; stats.checks++ }
        else if (type === 'select') { if (!Array.isArray(it.options) || !it.options.length) throw new Error(`${where}: select sin opciones`); options = it.options; outcomes = it.outcomes ?? {} }
        else if (type === 'table') { options = validateTable(it.table, where); stats.tables++ }
        if (type === 'measurement' && !it.unit) throw new Error(`${where}: medición sin unidad`)
        const row = {
          item_number: it.n, description: it.en.trim(), description_es: it.es.trim(), item_type: type,
          is_required: it.required ?? true, requires_photo: !!it.photo, requires_document: !!it.document,
          requires_measurement: false, is_critical: false, unit: it.unit ?? null,
          acceptance_min: null, acceptance_max: null, acceptance_text: it.acceptance ?? null,
          condition_item_id: null, condition_value: null, options, option_outcomes: outcomes, order_index: items.length,
        }
        if (row.requires_photo) stats.photos++
        if (row.requires_document) stats.docs++
        stats.items++
        items.push(row)
      }
    }
    sections.push({ title: sec.title, items })
  }
  const numbers = sections.flatMap(s => s.items.map(i => i.item_number))
  const dup = numbers.filter((n, i) => numbers.indexOf(n) !== i)
  if (dup.length) throw new Error(`${spec.code}: numeración repetida ${[...new Set(dup)].join(', ')}`)
  return { sections, stats }
}

async function loadVersions(code) {
  const { data, error } = await db.from('itr_templates')
    .select('id, code, title, title_es, discipline_id, phase_id, equipment_type_id, version, is_active, is_global')
    .eq('org_id', ORG).eq('code', code).order('version')
  if (error) throw error
  return data ?? []
}

async function apply(spec, active, versions, sections) {
  const next = Math.max(0, ...versions.map(v => v.version)) + 1
  const { data: tpl, error: tErr } = await db.from('itr_templates').insert({
    org_id: ORG, code: spec.code, title: spec.title ?? active.title, title_es: spec.title_es ?? active.title_es,
    description: `Revisión ${next} (borrador Fase 2, diseño manual, ${TODAY}): ${spec.note} Fuente: estructura del Word original.`,
    discipline_id: active.discipline_id, phase_id: active.phase_id, equipment_type_id: active.equipment_type_id,
    version: next, is_active: false, is_global: active.is_global,
  }).select('id').single()
  if (tErr) throw tErr
  for (const [si, section] of sections.entries()) {
    const { data: sec, error: sErr } = await db.from('itr_template_sections').insert({ template_id: tpl.id, title: section.title, order_index: si }).select('id').single()
    if (sErr) throw sErr
    const { error: iErr } = await db.from('itr_template_items').insert(section.items.map(it => ({ section_id: sec.id, template_id: tpl.id, ...it })))
    if (iErr) throw iErr
  }
  await db.from('activity_log').insert({ org_id: ORG, user_id: ACTOR, entity_type: 'itr_template', entity_id: tpl.id, action: 'revision_created', payload: { code: spec.code, version: next, source: 'fase2-manual', source_template_id: active.id } })
  return { id: tpl.id, version: next }
}

async function main() {
  const available = readdirSync(SPECS).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
  const codes = codesArg ? codesArg.split(',').map(s => s.trim()).filter(Boolean) : available
  const out = [['codigo', 'v_activa', 'v2_id', 'v2_version', 'items', 'selecciones', 'fotos', 'documentos', 'tablas', 'nota']]
  for (const code of codes) {
    try {
      if (!available.includes(code)) throw new Error('sin especificación en scripts/itr-v2/manual')
      const spec = JSON.parse(readFileSync(path.join(SPECS, `${code}.json`), 'utf8'))
      if (spec.code !== code) throw new Error(`la especificación declara ${spec.code}`)
      const { sections, stats } = expand(spec)
      const versions = await loadVersions(code)
      const active = versions.find(v => v.is_active)
      if (!active) throw new Error('sin plantilla activa')
      const newer = versions.filter(v => v.version > active.version)
      let created = { id: '', version: '' }
      let note = spec.note
      if (APPLY) {
        if (newer.length && !FORCE) note = `NO GENERADO: ya existe borrador v${newer.map(v => v.version).join('/')} (usa --force o bórralo antes)`
        else created = await apply(spec, active, versions, sections)
      }
      out.push([code, active.version, created.id, created.version, stats.items, stats.checks, stats.photos, stats.docs, stats.tables, note])
      console.log(`${code}: ${sections.length} secciones, ${stats.items} ítems (${stats.checks} selecciones, ${stats.photos} fotos, ${stats.docs} documentos, ${stats.tables} tablas)${created.id ? ` → v${created.version} ${created.id}` : ''}${note.startsWith('NO') ? ' — ' + note : ''}`)
      if (args.includes('--verbose')) for (const s of sections) { console.log(`  [${s.title}]`); for (const it of s.items) console.log(`    ${it.item_number.padEnd(6)} ${it.item_type.padEnd(11)}${it.is_required ? '*' : ' '}${it.requires_photo ? '📷' : '  '}${it.requires_document ? '📄' : '  '} ${it.description_es.slice(0, 96)}${it.unit ? ' [' + it.unit + ']' : ''}${it.item_type === 'table' ? ' → ' + it.options.columns.map(c => c.label + ':' + c.type[0]).join(', ') + ' | ' + (it.options.rows.mode === 'fixed' ? it.options.rows.labels.join(', ') : `${it.options.rows.label} ${it.options.rows.min}–${it.options.rows.max}`) : ''}`) }
    } catch (e) {
      out.push([code, '', '', '', '', '', '', '', '', `ERROR ${e.message}`])
      console.error(code, 'ERROR', e.message)
    }
  }
  const csvArg = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : null
  const file = csvArg ? path.resolve(ROOT, csvArg) : path.join(ROOT, `docs/ITR-FASE2-MANUAL-${TODAY}.csv`)
  writeFileSync(file, '﻿' + out.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n')
  console.log(`\n${APPLY ? 'aplicado' : 'vista previa'} → ${file}`)
}

main().catch(e => { console.error(e); process.exit(1) })
