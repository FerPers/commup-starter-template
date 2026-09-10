#!/usr/bin/env node
// Fase 2 — genera borradores v2 (inactivos) para las listas de chequeo puras.
//
// Fuente de verdad: la tabla de chequeo del .docx original
// (insumos-locales/revision-itr/lote-completo/estructuras/<codigo>.json).
// La plantilla activa en CommUp solo aporta cabecera (org, disciplina, fase,
// tipo de equipo, títulos) y las traducciones ES ya revisadas cuando el texto
// coincide con el original. Nunca modifica la revisión activa: crea una
// revisión nueva inactiva (version = max+1) con el estándar v2:
//   Referencias de ejecución (R.1) · Inspección (numeración original, selección
//   Conforme/No conforme/No aplica con resultado, fotos según regla §7.1) ·
//   [Equipo de prueba (T.1–T.5) si el original lo trae] · Observaciones (O.1)
//
// Uso (desde la raíz del repo, con .env.local):
//   node scripts/itr-v2/generar-v2-listas.mjs --codes M01A,H01A           # vista previa
//   node scripts/itr-v2/generar-v2-listas.mjs --codes M01A,H01A --apply   # escribe
//   node scripts/itr-v2/generar-v2-listas.mjs --pure --apply              # las «C» del CSV
//   node scripts/itr-v2/generar-v2-listas.mjs --family C+V --apply        # listas con ítems de valor:
//     el ítem queda como selección y recibe un campo de registro (N-R): medición si el
//     texto nombra la unidad, texto «valor y unidad» si no; los ítems que son un dato
//     («Input Range:») o texto libre («Record any additional checks») van como texto.
// Salida: docs/ITR-FASE2-LOTE-<fecha>.csv (una fila por formato, con avisos); --csv <ruta> para otro destino.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..')
const EST = path.join(ROOT, 'insumos-locales/revision-itr/lote-completo/estructuras')
const ORG = 'e12c53b2-85fd-462f-86f3-bba318aa77ee' // DEMO Refinería Los Andes (AUTOTEST)
const ACTOR = 'fc1593b4-5fc1-4eae-9fb0-b213ecae7366' // Luis (owner) — queda en activity_log
const TODAY = new Date().toISOString().slice(0, 10)

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const codesArg = args[args.indexOf('--codes') + 1]
const PURE = args.includes('--pure')
const FAMILY = args.includes('--family') ? args[args.indexOf('--family') + 1] : (PURE ? 'C' : null)

const env = Object.fromEntries(readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const OPTIONS = ['Conforme', 'No conforme', 'No aplica']
const OUTCOMES = { Conforme: 'pass', 'No conforme': 'fail', 'No aplica': 'not_applicable' }
// Regla de fotos §7.1: identificación, daños, tierra, obturación/sellos, estado instalado.
const PHOTO_RE = /name ?plate|label|i\.?d\.? tag|identif|marker|marcad|placa|etiquet|r[oó]tulo|damage|dañ|earth|ground|tierra|bond|plug|obturad|seal|sello|gland|prensa|support|soporte|mount|montaj|level|nivel|clearance|espacio libre|secured|asegurad|fixed|fijad/i
const EQUIP_RE = /test equipment|equipo de prueba|calibration equipment/i
// Ítems que exigen registrar un valor (mismo criterio que el clasificador)
const VALUE_RE = /\brecord(?:ed|ing)?\b(?! ?(?:and|&) ?check)|\bregistr(?:ar|e|ando)\b|\bmeasure(?:d|s)?\b(?!\s+(?:have|has|are|implemented|removed))|\bmedi(?:r|ción|cion|das?)\b(?!\s+(?:de|del)\s+(?:preserv|protecci))|\breading|\blectura|\bvalue of|\bvalor de|insulation resistance|resistencia de aislamiento|continuity (?:test|check)|prueba de continuidad|\d\s*(?:kv|v\b|ma\b|mω|ohm|psi|bar\b|°c|deg ?c|mm\b|rpm|amps?|hz)|[\[(]\s*(?:mω|ohm|kv|psi|bar|°c|mm|amps?|volts?)\s*[\])]/i
const PRESERV_RE = /preservation measures|medidas de (?:mantenci[oó]n|mantenimiento|preservaci[oó]n|conservaci[oó]n)/gi
const FREE_TEXT_RE = /record any additional|record (?:relevant|the following|if)|registr\w* (?:cualquier|toda|todas|las|los|lo) [^.]*(?:adicional|siguiente|relevante)|comments|comentarios|in remarks|en observaciones/i
const UNITS = [[/mω|mohm|meg ?ohm|megaohm/i, 'MΩ'], [/\bkv\b/i, 'kV'], [/\bvac\b|\bvolts?\b|\d\s*v\b/i, 'V'], [/\bma\b/i, 'mA'], [/psig|\bpsi\b/i, 'psi'], [/\d\s*bar\b|\bbar\b(?!\s*(?:resistance|resistencia))/i, 'bar'], [/°c|deg ?c|˚c/i, '°C'], [/\bmm\b/i, 'mm'], [/\brpm\b/i, 'rpm'], [/\bamps?\b/i, 'A'], [/\bhz\b/i, 'Hz'], [/\bohms?\b|Ω/i, 'Ω']]
function detectUnit(text) {
  const t = text.replace(/earth bar|bus ?bar|barra/gi, ' ')
  for (const [re, unit] of UNITS) if (re.test(t)) return unit
  return null
}

const norm = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

function readChecklist(code) {
  const file = path.join(EST, `${code}.json`)
  if (!existsSync(file)) throw new Error(`sin estructura: ${code}`)
  const data = JSON.parse(readFileSync(file, 'utf8'))
  const body = data.partes.filter(p => p.parte.startsWith('word/document')).flatMap(p => p.tablas)
  const items = []
  let equipment = false, embedded = 0
  for (const table of body) {
    const rows = table.map(r => r.map(c => (c.texto ?? '').trim()))
    const first = rows[0]?.join(' ') ?? ''
    if (!/item no/i.test(first) || !/description|descripci|inspection|check/i.test(first)) continue
    const numbered = rows.slice(1).some(r => /^\s*\d/.test(r[0] ?? ''))
    for (const r of rows.slice(1)) {
      if (!r.length || r.every(c => !c)) continue
      const joined = r.join(' ')
      if (/item no|value \/ status|initials/i.test(joined)) continue
      const num = r[0] ?? '', desc = r[1] ?? ''
      if (!desc && !num) continue
      if (EQUIP_RE.test(`${num} ${desc}`)) { equipment = true; continue }
      // En listas numeradas, una fila sin número es continuación: subfilas del equipo de prueba
      // (se ignoran) o una matriz embebida (bloquea: no es lista pura).
      if (numbered && !/^\s*\d/.test(num)) {
        if (!equipment && r.filter(Boolean).length >= 2) embedded++
        continue
      }
      if (!/^\s*\d/.test(num) && (r.length === 1 || (num && !desc))) continue
      if (!desc) continue
      items.push({ num: num.trim(), raw: desc })
    }
  }
  return { items, equipment, embedded }
}

/** EN/ES: salto de línea en la celda, o coincidencia con la plantilla actual (traducción ya revisada). */
function bilingual(raw, dbItems) {
  const n = norm(raw)
  for (const it of dbItems) {
    const en = norm(it.description)
    if (en.length >= 15 && n.startsWith(en.slice(0, Math.min(en.length, 60)))) {
      return { description: it.description.trim(), description_es: it.description_es?.trim() || null, source: 'db' }
    }
  }
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (lines.length >= 2) return { description: lines[0], description_es: lines.slice(1).join(' '), source: 'split' }
  return { description: raw.replace(/\s+/g, ' ').trim(), description_es: null, source: 'none' }
}

async function loadActive(code) {
  const { data, error } = await db.from('itr_templates')
    .select('id, code, title, title_es, description, discipline_id, phase_id, equipment_type_id, version, is_global, itr_template_items(id, item_number, description, description_es, order_index)')
    .eq('org_id', ORG).eq('code', code).eq('is_active', true).maybeSingle()
  if (error) throw error
  return data
}

function buildPlan(code, active, checklist) {
  const dbItems = [...active.itr_template_items].sort((a, b) => a.order_index - b.order_index)
  const warnings = []
  let untranslated = 0, photos = 0
  const DATA_RE = /[:：]\s*$|_{3,}|^(?:input|output|indication|calibration)\s+(?:range|check)|\b(?:range|rango|setting|set ?point|ajuste)\s*:|^\s*[\d.]+\s*[-–]\s*[\d.]+\s*(?:%|v|ma|psi|bar)?\s*$/i
  let companions = 0, textItems = 0
  const inspection = []
  // Título de grupo: 2.0 «Detalles de la prueba» seguido de 2.1, 2.2… y sin verbo inicial en ninguna de sus líneas.
  const VERB_START_RE = /^(?:check|verify|confirm|ensure|inspect|record|measure|test|carry|perform|remove|install|revis\w*|verific\w*|confirm\w*|asegur\w*|inspeccion\w*|registr\w*|medir|realiz\w*|retir\w*|instal\w*|comprob\w*)\b/i
  checklist.items.forEach((it, i) => {
    const next = checklist.items[i + 1]
    const base = (it.num || '').replace(/\.0$/, '')
    const lines = it.raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (next && base && next.num.startsWith(base + '.') && it.raw.split(/\s+/).length <= 8 && !lines.some(l => VERB_START_RE.test(l))) return
    const b = bilingual(it.raw, dbItems)
    if (!b.description_es) untranslated++
    const num = it.num || `${i + 1}.0`
    const text = `${b.description} ${b.description_es ?? ''}`
    const clean = text.replace(PRESERV_RE, ' ')
    const isData = FAMILY !== 'C' && DATA_RE.test(b.description)
    const isFree = FAMILY !== 'C' && FREE_TEXT_RE.test(clean)
    if (isData || isFree) {
      // Dato o texto libre: un campo de texto con el número original (sin selección).
      textItems++
      inspection.push({ item_number: num, description: b.description, description_es: b.description_es, item_type: 'text', is_required: !isFree, requires_photo: false, options: null, option_outcomes: {}, order_index: inspection.length })
      return
    }
    const photo = PHOTO_RE.test(b.description) || PHOTO_RE.test(b.description_es ?? '')
    if (photo) photos++
    inspection.push({ item_number: num, description: b.description, description_es: b.description_es, item_type: 'select', is_required: true, requires_photo: photo, options: OPTIONS, option_outcomes: OUTCOMES, order_index: inspection.length })
    if (FAMILY !== 'C' && VALUE_RE.test(clean)) {
      // Campo de registro acompañante: medición si el texto nombra la unidad; si no, texto «valor y unidad».
      companions++
      const unit = detectUnit(clean)
      inspection.push(unit
        ? { item_number: `${num}-R`, description: `Recorded value for item ${num} (${unit}).`, description_es: `Valor registrado para el ítem ${num} (${unit}).`, item_type: 'measurement', unit, is_required: true, requires_photo: false, options: null, option_outcomes: {}, order_index: inspection.length }
        : { item_number: `${num}-R`, description: `Record for item ${num}: value and unit as per the procedure.`, description_es: `Registro del ítem ${num}: valor y unidad según el procedimiento.`, item_type: 'text', is_required: true, requires_photo: false, options: null, option_outcomes: {}, order_index: inspection.length })
    }
  })
  if (companions) warnings.push(`${companions} campos de registro (N-R)`)
  if (textItems) warnings.push(`${textItems} ítems como texto (dato o libre)`)
  // Ítem que en realidad es un dato o una matriz: termina en «:», trae línea para escribir, o es un rango/ajuste.
  if (FAMILY === 'C') {
    const dataLike = inspection.filter(it => DATA_RE.test(it.description) || DATA_RE.test(it.description_es ?? ''))
    if (dataLike.length) warnings.push(`${dataLike.length} ítems tipo dato/matriz (no es lista pura): ${dataLike.slice(0, 3).map(i => i.item_number).join(', ')}`)
  }
  if (untranslated) warnings.push(`${untranslated} sin traducción ES`)
  if (Math.abs(dbItems.length - checklist.items.length) > 0) warnings.push(`base ${dbItems.length} ítems / original ${checklist.items.length}`)
  if (!inspection.length) warnings.push('sin ítems')
  if (checklist.embedded) warnings.push(`${checklist.embedded} filas de matriz embebida en la lista (no es lista pura)`)
  if (classification[code]?.tablas_sin_clasificar > 0) warnings.push(`${classification[code].tablas_sin_clasificar} tabla(s) del original sin clasificar (no es lista pura)`)
  const sections = [
    { title: 'Referencias de ejecución', items: [{ item_number: 'R.1', description: 'Identification and revision of the drawings, specifications or procedure used for this inspection.', description_es: 'Identificación y revisión de los planos, especificaciones o procedimiento utilizados para esta inspección.', item_type: 'text', is_required: true, requires_photo: false, options: null, option_outcomes: {}, order_index: 0 }] },
    { title: 'Inspección', items: inspection },
  ]
  if (checklist.equipment) {
    sections.push({ title: 'Equipo de prueba', items: [
      { item_number: 'T.1', description: 'Test equipment make.', description_es: 'Fabricante del equipo de prueba.', item_type: 'text' },
      { item_number: 'T.2', description: 'Test equipment model.', description_es: 'Modelo del equipo de prueba.', item_type: 'text' },
      { item_number: 'T.3', description: 'Test equipment serial number.', description_es: 'Número de serie del equipo de prueba.', item_type: 'text' },
      { item_number: 'T.4', description: 'Calibration expiry date of the test equipment.', description_es: 'Fecha de vencimiento de la calibración del equipo de prueba.', item_type: 'date' },
      { item_number: 'T.5', description: 'Calibration certificate of the test equipment (attach the certificate).', description_es: 'Certificado de calibración del equipo de prueba (adjuntar el certificado).', item_type: 'text', requires_document: true },
    ].map((it, i) => ({ is_required: true, requires_photo: false, requires_document: false, options: null, option_outcomes: {}, order_index: i, ...it })) })
  }
  sections.push({ title: 'Observaciones', items: [{ item_number: 'O.1', description: 'Inspection remarks and references to findings recorded in the Punch List, where applicable.', description_es: 'Observaciones de la inspección y referencias a hallazgos registrados en Punch List, cuando correspondan.', item_type: 'text', is_required: false, requires_photo: false, options: null, option_outcomes: {}, order_index: 0 }] })
  return { code, active, sections, warnings, untranslated, photos, itemCount: checklist.items.length }
}

async function apply(plan) {
  const { data: versions } = await db.from('itr_templates').select('version').eq('org_id', ORG).eq('code', plan.code)
  const next = Math.max(0, ...(versions ?? []).map(v => v.version)) + 1
  const { data: tpl, error: tErr } = await db.from('itr_templates').insert({
    org_id: ORG, code: plan.code, title: plan.active.title, title_es: plan.active.title_es,
    description: `Revisión ${next} (borrador Fase 2${FAMILY && FAMILY !== 'C' ? ' ' + FAMILY : ''}, ${TODAY}): lista de chequeo del original con selección Conforme/No conforme/No aplica${FAMILY && FAMILY !== 'C' ? ', campos de registro (N-R) en los ítems que exigen valor' : ''}, referencias y observaciones. Fuente: estructura del Word original.`,
    discipline_id: plan.active.discipline_id, phase_id: plan.active.phase_id, equipment_type_id: plan.active.equipment_type_id,
    version: next, is_active: false, is_global: plan.active.is_global,
  }).select('id').single()
  if (tErr) throw tErr
  for (const [si, section] of plan.sections.entries()) {
    const { data: sec, error: sErr } = await db.from('itr_template_sections').insert({ template_id: tpl.id, title: section.title, order_index: si }).select('id').single()
    if (sErr) throw sErr
    const rows = section.items.map(it => ({ section_id: sec.id, template_id: tpl.id, requires_document: false, requires_measurement: false, is_critical: false, unit: null, acceptance_min: null, acceptance_max: null, acceptance_text: null, condition_item_id: null, condition_value: null, ...it }))
    const { error: iErr } = await db.from('itr_template_items').insert(rows)
    if (iErr) throw iErr
  }
  await db.from('activity_log').insert({ org_id: ORG, user_id: ACTOR, entity_type: 'itr_template', entity_id: tpl.id, action: 'revision_created', payload: { code: plan.code, version: next, source: 'fase2-script', source_template_id: plan.active.id } })
  return { id: tpl.id, version: next }
}

const { readdirSync } = await import('node:fs')
const classification = {}
{
  const latest = readdirSync(path.join(ROOT, 'docs')).filter(f => /^ITR-CLASIFICACION-ORIGINALES-.*\.csv$/.test(f)).sort().pop()
  // CSV con comillas (los ejemplos traen comas): parser mínimo RFC 4180.
  const parseCsv = text => { const rows = []; let row = [], cell = '', q = false
    for (let i = 0; i < text.length; i++) { const ch = text[i]
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch }
      else if (ch === '"') q = true
      else if (ch === ',') { row.push(cell); cell = '' }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
      else if (ch !== '\r') cell += ch }
    if (cell || row.length) { row.push(cell); rows.push(row) }
    return rows }
  if (latest) {
    const [header, ...rows] = parseCsv(readFileSync(path.join(ROOT, 'docs', latest), 'utf8').replace(/^\uFEFF/, ''))
    const col = name => header.indexOf(name)
    for (const c of rows) if (c[col('codigo')]) classification[c[col('codigo')]] = { familia: c[col('familia')], items_chequeo: Number(c[col('items_chequeo')]), tablas_sin_clasificar: Number(c[col('tablas_sin_clasificar')] || 0) }
  }
}

async function main() {
  let codes = []
  if (codesArg && !codesArg.startsWith('--')) codes = codesArg.split(',').map(s => s.trim()).filter(Boolean)
  if (PURE || FAMILY) {
    if (!Object.keys(classification).length) throw new Error('falta docs/ITR-CLASIFICACION-ORIGINALES-*.csv (ejecuta scripts/itr-v2/clasificar-originales.py)')
    codes = Object.entries(classification).filter(([, c]) => c.familia === FAMILY && c.items_chequeo > 0).map(([code]) => code)
  }
  if (!codes.length) { console.error('Indica --codes A,B, --pure o --family C+V'); process.exit(1) }
  const out = [['codigo', 'v_activa', 'v2_id', 'v2_version', 'items', 'fotos', 'sin_traduccion', 'equipo_prueba', 'avisos']]
  for (const code of codes) {
    try {
      const active = await loadActive(code)
      if (!active) { out.push([code, '', '', '', '', '', '', '', 'sin plantilla activa']); console.log(code, 'sin plantilla activa'); continue }
      const checklist = readChecklist(code)
      const plan = buildPlan(code, active, checklist)
      let created = { id: '', version: '' }
      const blocked = plan.warnings.some(w => /tipo dato|sin ítems|no es lista pura/.test(w))
      if (APPLY && plan.itemCount && !blocked) created = await apply(plan)
      else if (APPLY && blocked) plan.warnings.push('NO GENERADO: revisar a mano')
      out.push([code, active.version, created.id, created.version, plan.itemCount, plan.photos, plan.untranslated, checklist.equipment ? 'sí' : '', plan.warnings.join('; ')])
      if (args.includes('--verbose')) for (const it of plan.sections[1].items) console.log(`   ${it.item_number.padEnd(7)} ${it.item_type.padEnd(11)} ${it.requires_photo ? '📷' : '  '} ${(it.description_es ?? '(sin ES) ' + it.description).slice(0, 80)}`)
      console.log(`${code}: ${plan.itemCount} ítems, ${plan.photos} fotos, ${plan.untranslated} sin ES${checklist.equipment ? ', equipo' : ''}${plan.warnings.length ? ' — ' + plan.warnings.join('; ') : ''}${created.id ? ` → v${created.version} ${created.id}` : ''}`)
    } catch (e) {
      out.push([code, '', '', '', '', '', '', '', `ERROR ${e.message}`])
      console.error(code, 'ERROR', e.message)
    }
  }
  const csvArg = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : null
  const file = csvArg ? path.resolve(ROOT, csvArg) : path.join(ROOT, `docs/ITR-FASE2-LOTE-${TODAY}.csv`)
  writeFileSync(file, '﻿' + out.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n')
  console.log(`\n${APPLY ? 'aplicado' : 'vista previa'} → ${file}`)
}

main().catch(e => { console.error(e); process.exit(1) })
