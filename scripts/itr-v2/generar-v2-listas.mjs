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
//   node scripts/itr-v2/generar-v2-listas.mjs --family D --apply          # datos + lista: el bloque de
//     datos del original se convierte en sección «Datos del elemento» (D.n); fabricante, modelo,
//     serie, hoja de datos y P&ID NO se crean (vienen del tag); magnitudes con unidad impresa → medición.
//   node scripts/itr-v2/generar-v2-listas.mjs --family M --apply          # lista + matrices: cada rejilla
//     de medición del original se convierte en un ítem «table» (M.n) en la sección «Registros de
//     ensayo»; filas fijas (puntos, tiempos, pares) o variables (registros por elemento); columnas
//     número/texto con la unidad impresa; siempre con Resultado y Observación opcionales.
//   node scripts/itr-v2/generar-v2-listas.mjs --family DM --apply         # datos + lista + matrices.
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

// Formatos con revisión hecha a mano (Fase 1): nunca se regeneran por script.
const MANUAL = new Set(['I01A', 'I04A', 'I06A', 'I10A', 'I33C'])
// Datos que ya vienen del listado maestro del tag (autollenado): no se crean como ítems.
const TAG_MASTER_RE = /^(?:manufacturer|fabricante|make|marca|model(?: no\.?)?|modelo(?: no\.?)?|serial(?: no\.?)?|no\.? de serial|no\.? serie|tag(?: no\.?| number)?|tag description|data ?sheet(?: no\.?)?|hoja de datos|p&id(?: no\.?)?|drawing number|rev(?:ision)?)$/i
const UNIT_TOKEN_RE = /^(?:kw\/hp|kw|hp|kva|mva|kv|v|volts?|a|amps?|hz|rpm|%|bar ?g?|psig?|deg ?c|°c|ºc|mm|m|ohm|mω|s|sec|min)$/i
const SKIP_CELL_RE = /^(?:information|información|engineer|ingeniero|inspector|date|fecha|signature|firma|rev:?|_+(?:\s*rev:?\s*_+)?)$/i

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

/** Bloque de datos del original: celdas «Label EN:  [unidad]\nLabel ES:» → campos D.n. */
function readDataBlock(code) {
  const data = JSON.parse(readFileSync(path.join(EST, `${code}.json`), 'utf8'))
  const body = data.partes.filter(p => p.parte.startsWith('word/document')).flatMap(p => p.tablas)
  const fields = []
  let skipped = 0
  for (const table of body) {
    const rows = table.map(r => r.map(c => (c.texto ?? '')))
    const first = rows[0]?.join(' ') ?? ''
    if (/item no/i.test(first) || EQUIP_RE.test(first)) continue
    const cells = rows.flat().map(c => c.replace(/\u00a0/g, ' ')).filter(c => c.trim())
    const isLabelish = c => /:\s*(?:\S+\s*)?$/m.test(c) || UNIT_TOKEN_RE.test(c.trim()) || /^_+/.test(c.trim())
    const gridRows = rows.filter(r => { const f = r.filter(c => c.trim()); return f.length >= 3 && f.filter(isLabelish).length < f.length / 2 }).length
    if (Math.max(...rows.map(r => r.length)) >= 3 && gridRows >= rows.length * 0.5) continue // rejilla/matriz: la lee readMatrices
    // Tabla de datos: la mayoría de celdas con «Etiqueta:» o bilingües en dos líneas
    const labelish = cells.filter(c => /:\s*(?:\S+\s*)?$/m.test(c) || /\n/.test(c)).length
    if (!cells.length || labelish < Math.max(2, cells.length * 0.5)) continue
    for (const raw of cells) {
      const c = raw.trim()
      if (SKIP_CELL_RE.test(c)) continue
      if (UNIT_TOKEN_RE.test(c)) { if (fields.length) fields[fields.length - 1].unit = fields[fields.length - 1].unit ?? c; continue }
      if (/^_+\s*rev:?\s*_+$/i.test(c)) { if (fields.length) fields.push({ en: `${fields[fields.length - 1].en} revision`, es: `${fields[fields.length - 1].es} — revisión`, unit: null }); continue }
      const lines = c.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      let en = lines[0] ?? '', es = lines.slice(1).join(' '), unit = null
      // «Rated Voltage:      Volts  Voltaje Nominal:» en una sola línea
      const inline = en.match(/^(.+?):\s*(\S+(?:\s\S+)?)?\s{2,}(.+?):?\s*$/)
      if (inline && !es) { en = inline[1]; if (inline[2] && UNIT_TOKEN_RE.test(inline[2])) unit = inline[2]; es = inline[3] }
      const m = en.match(/^(.*?):\s*(\S.*?)?\s*$/)
      if (m) { en = m[1]; if (m[2] && UNIT_TOKEN_RE.test(m[2].trim())) unit = m[2].trim() }
      // «kV Voltaje Primario» / «Corriente Primaria: A»: la unidad quedó pegada a la etiqueta ES
      const esLead = es.match(/^(\S+)\s+(.+)$/)
      if (esLead && UNIT_TOKEN_RE.test(esLead[1])) { unit = unit ?? esLead[1]; es = esLead[2] }
      const esTail = es.match(/^(.*?):\s*(\S+)\s*$/)
      if (esTail && UNIT_TOKEN_RE.test(esTail[2])) { unit = unit ?? esTail[2]; es = esTail[1] }
      en = en.replace(/^\*\s*/, '').replace(/\s+/g, ' ').trim(); es = es.replace(/:\s*$/, '').replace(/\s+/g, ' ').trim()
      if (!en || en.length > 70) continue
      if (SKIP_CELL_RE.test(en) || SKIP_CELL_RE.test(es)) continue // firmas/fechas del pie, no son datos del elemento
      if (TAG_MASTER_RE.test(en) || TAG_MASTER_RE.test(es)) { skipped++; continue }
      fields.push({ en, es: es || null, unit })
    }
  }
  return { fields, skipped }
}

const SEQ_RE = /^\s*\d+(?:[.,½]\d*)?\s*(?:%|min(?:ute)?s?|mins|hours?|hrs?|h|sec(?:ond)?s?|s|seg(?:undos)?|minutos|horas?)?\s*$/i
const NUMERIC_LABEL_RE = /volt|amp|current|corriente|temp|press|presi|error|reading|lectura|value|valor|resist|%|\br\d|\bkv|\bma\b|\bmm|time|tiempo|torque|flow|flujo|speed|velocid|rpm|leakage|fuga|level|nivel|hz|power|potencia|load|carga|humidity|humedad|vibra|rms|impedance|impedancia|efficien|eficien|factor|deflect|clearance|holgura|gap|size|tamaño|diameter|di[aá]metro|length|longitud|thickness|espesor|weight|peso/i
const RESULT_LABEL_RE = /^(?:result|resultado|status|estado|pass ?\/ ?fail|ok ?\/ ?nok)/i
const REMARK_LABEL_RE = /remark|observ|comment|comentario/i
const bil = cell => { const l = (cell ?? '').split(/\r?\n/).map(x => x.trim()).filter(Boolean); return { en: l[0] ?? '', es: l[1] ?? l[0] ?? '' } }
const slug = (text, used) => {
  let k = (text || 'col').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '').slice(0, 28) || 'col'
  let out = k, n = 2
  while (used.has(out)) out = `${k}_${n++}`
  used.add(out); return out
}
const unitOf = text => { const t = (text ?? '').trim(); if (!t) return null; if (UNIT_TOKEN_RE.test(t)) return t; const m = t.match(/[\[(]\s*([^\])]{1,12})\s*[\])]\s*$/); if (m && /[a-zA-Zµ°º%\/]/.test(m[1])) return m[1].trim(); if (/^(?:mm\/s(?:\s*rms)?|psi ?g|gpm(?: bpd)?|bpd|deg ?c|°c|ºc|ua|µa|ma|kv|kva|kw|hp|rpm|hz|bar ?g?)$/i.test(t)) return t; return null }

/** Matrices del original → configuraciones de ítem `table` (más campos sueltos y bandera de equipo). */
function readMatrices(code) {
  const data = JSON.parse(readFileSync(path.join(EST, `${code}.json`), 'utf8'))
  const body = data.partes.filter(p => p.parte.startsWith('word/document')).flatMap(p => p.tablas)
  const tables = [], extraFields = [], notes = []
  let equipment = false, tableNo = 0
  for (const table of body) {
    const rows = table.map(r => r.map(c => (c.texto ?? '').replace(/\u00a0/g, ' ').trim()))
    const first = rows[0]?.join(' ') ?? ''
    if (/item no/i.test(first)) continue
    const ncols = Math.max(...rows.map(r => r.length))
    const cells = rows.flat().filter(Boolean)
    const labelish = cells.filter(c => /:\s*(?:\S+\s*)?$/m.test(c) || (/\n/.test(c) && !SEQ_RE.test(c))).length
    if (ncols < 3) continue // bloques de datos y notas: los lee readDataBlock
    if (cells.filter(c => /:\s*(?:\S+\s*)?$/m.test(c) || UNIT_TOKEN_RE.test(c.trim()) || /^_+/.test(c.trim())).length >= cells.length * 0.5) continue // bloque de datos ancho (I03A)
    // bloques separados por filas-título (una sola celda)
    const blocks = []; let cur = { title: '', rows: [] }
    rows.forEach((r, ri) => {
      const filled = r.filter(Boolean)
      const caps = filled.length === 1 && !/[a-záéíóúñ]/.test(filled[0].replace(/\([^)]*\)/g, ''))
      if (filled.length === 1 && r[0] === filled[0] && filled[0].length <= 70 && !SEQ_RE.test(filled[0]) && (ri === 0 || caps || !cur.rows.length)) {
        if (cur.rows.length) blocks.push(cur)
        cur = { title: filled[0], rows: [] }
      } else if (filled.length) cur.rows.push(r)
    })
    if (cur.rows.length) blocks.push(cur)
    for (const block of blocks) {
      const t = bil(block.title)
      if (EQUIP_RE.test(block.title) || EQUIP_RE.test(block.rows[0]?.join(' ') ?? '')) { equipment = true; continue }
      const brows = block.rows
      const bcells = brows.flat().filter(Boolean)
      // bloque de datos dentro de la matriz (CORRECTIONS: «Elevation set at:»)
      const colonLabels = bcells.filter(c => /:\s*$/m.test(c) || /:\s*\S{0,6}\s*$/m.test(c)).length
      if (bcells.length && colonLabels >= bcells.length * 0.6 && !brows.some(r => r.filter(c => SEQ_RE.test(c)).length >= 3)) {
        for (const c of bcells) { if (c.length <= 3) continue; const b = bil(c); extraFields.push({ en: b.en.replace(/:\s*$/, ''), es: b.es.replace(/:\s*$/, ''), unit: null, group: t.es || t.en }) }
        continue
      }
      const used = new Set(); let columns = [], rowsSpec = null, note = ''
      const seqIdx = brows.findIndex(r => r.filter(c => SEQ_RE.test(c)).length >= 3)
      const totalCells = brows.reduce((a, r) => a + r.length, 0)
      const labelGrid = seqIdx < 0 && bcells.length >= 3 && bcells.every(c => c.length <= 12 && !/\d{3,}/.test(c)) && (totalCells - bcells.length) <= totalCells * 0.25
      if (labelGrid) {
        // rejilla de etiquetas sin valores (pares R-Y, Y-B…): una fila por etiqueta y una columna de lectura
        rowsSpec = { mode: 'fixed', labels: bcells.map(c => bil(c).es || c) }
        columns.push({ key: 'reading', label: 'Lectura', type: 'number', unit: null, options: null, min: null, max: null, required: true })
        note = 'rejilla de etiquetas'
      } else if (seqIdx >= 0) {
        // eje numérico en columnas → se transpone: filas = puntos/tiempos, columnas = parámetros con unidad
        const axis = brows[seqIdx]
        const axisLabel = bil(axis.find(c => c && !SEQ_RE.test(c)) ?? '')
        const pct = /%/.test(axisLabel.en)
        const labels = axis.filter(c => SEQ_RE.test(c)).map(c => pct && /^\d+$/.test(c.trim()) ? `${c.trim()} %` : c.trim())
        rowsSpec = { mode: 'fixed', labels }
        for (const r of brows.slice(seqIdx + 1)) {
          const label = bil(r[0]); if (!label.en) continue
          if (/^(?:operating checks|value|valor)$/i.test(label.en)) continue
          let unit = null; const extras = []
          for (const c of r.slice(1, 4)) { if (!c) break; const u = unitOf(c); if (u && !unit) unit = u; else if (!/^value$/i.test(c)) extras.push(c) }
          const text = [label.es || label.en, ...extras].join(' ').trim() || `Parámetro ${columns.length + 1}`
          columns.push({ key: slug(label.en + ' ' + extras.join(' '), used), label: text, type: 'number', unit, options: null, min: null, max: null, required: true })
        }
        note = `transpuesta (${labels.length} puntos)`
      } else {
        const headerIdx = brows.findIndex(r => r.filter(Boolean).length >= 3)
        if (headerIdx < 0) {
          notes.push(`bloque de texto omitido: «${(t.es || t.en || bcells[0]).slice(0, 40)}»`)
          continue
        } else {
          const header = brows[headerIdx]
          const bodyRows = brows.slice(headerIdx + 1)
          const unitRow = bodyRows[0] && bodyRows[0].filter(Boolean).length >= 2 && bodyRows[0].filter(Boolean).every(c => unitOf(c)) ? bodyRows.shift() : null
          const labelsInBody = bodyRows.map(r => r[0]).filter(Boolean)
          const firstColIsLabel = !header[0] || (labelsInBody.length >= 2 && labelsInBody.length === bodyRows.length) || bodyRows.some(r => r[0] && !SEQ_RE.test(r[0]) && r.slice(1).every(c => !c))
          if (firstColIsLabel && labelsInBody.length >= 2 && labelsInBody.length === bodyRows.length) {
            rowsSpec = { mode: 'fixed', labels: labelsInBody.map((c, i) => { const b = bil(c); const l = (b.es || b.en).trim() || `Fila ${i + 1}`; return labelsInBody.filter(x => (bil(x).es || bil(x).en).trim() === l).length > 1 ? `${l} (${i + 1})` : l }) }
          } else if (bodyRows.length && bodyRows.every(r => SEQ_RE.test(r[0] ?? '') || !r[0])) {
            rowsSpec = labelsInBody.length ? { mode: 'fixed', labels: labelsInBody.map(c => c.trim()) } : { mode: 'variable', min: 1, max: Math.max(10, bodyRows.length), label: bil(header[0]).es || 'Registro' }
          } else {
            rowsSpec = { mode: 'variable', min: 1, max: Math.max(10, bodyRows.length), label: (firstColIsLabel ? bil(header[0]).es : '') || 'Registro' }
          }
          header.forEach((h, i) => {
            if (i === 0 && (firstColIsLabel || !h)) return
            if (!h) return
            const b = bil(h); const unit = unitOf(unitRow?.[i] ?? '') ?? unitOf(h.match(/[\[(][^\])]+[\])]/)?.[0] ?? '')
            const label = (b.es || b.en).replace(/\s*[\[(][^\])]*[\])]\s*$/, '').trim() || (unit ? `Valor (${unit})` : `Columna ${i + 1}`)
            if (RESULT_LABEL_RE.test(b.en)) columns.push({ key: slug('result', used), label: 'Resultado', type: 'result', unit: null, options: null, min: null, max: null, required: true })
            else if (REMARK_LABEL_RE.test(b.en)) columns.push({ key: slug('remarks', used), label: label || 'Observación', type: 'text', unit: null, options: null, min: null, max: null, required: false })
            else columns.push({ key: slug(b.en, used), label, type: unit || NUMERIC_LABEL_RE.test(b.en) ? 'number' : 'text', unit, options: null, min: null, max: null, required: true })
          })
          note = rowsSpec.mode === 'fixed' ? `${rowsSpec.labels.length} filas fijas` : `filas variables (${rowsSpec.min}–${rowsSpec.max})`
        }
      }
      if (!columns.some(c => c.type === 'result')) columns.push({ key: slug('result', used), label: 'Resultado', type: 'result', unit: null, options: null, min: null, max: null, required: false })
      if (!columns.some(c => c.key.startsWith('remarks'))) columns.push({ key: slug('remarks', used), label: 'Observación', type: 'text', unit: null, options: null, min: null, max: null, required: false })
      tableNo++
      if (columns.length > 16 || !rowsSpec || (rowsSpec.mode === 'fixed' && (!rowsSpec.labels.length || rowsSpec.labels.length > 200))) { notes.push(`matriz ${tableNo} no representable (${columns.length} columnas, ${rowsSpec?.labels?.length ?? '?'} filas): diseño manual`); continue }
      tables.push({ title: t, config: { version: 1, columns, rows: rowsSpec }, note })
    }
  }
  return { tables, extraFields, equipment, notes }
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
  const withMatrices = FAMILY === 'M' || FAMILY === 'DM'
  const matrices = withMatrices ? readMatrices(code) : { tables: [], extraFields: [], equipment: false, notes: [] }
  if (matrices.equipment) checklist.equipment = true
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
  if (!inspection.length) warnings.push(withMatrices ? 'sin lista de chequeo (solo matriz)' : 'sin ítems')
  if (checklist.embedded) warnings.push(`${checklist.embedded} filas de matriz embebida en la lista${withMatrices ? ' (revisar)' : ' (no es lista pura)'}`)
  if (classification[code]?.tablas_sin_clasificar > 0) warnings.push(`${classification[code].tablas_sin_clasificar} tabla(s) del original sin clasificar${withMatrices ? ' (revisar que la matriz/datos las cubra)' : ' (no es lista pura)'}`)
  let dataFields = 0, dataSkipped = 0
  const dataSection = []
  const matrixSection = []
  if (FAMILY === 'D' || FAMILY === 'DM') {
    const block = readDataBlock(code)
    dataSkipped = block.skipped
    block.fields.forEach((f, i) => dataSection.push({
      item_number: `D.${i + 1}`, description: f.en, description_es: f.es ?? f.en,
      item_type: f.unit ? 'measurement' : 'text', unit: f.unit, is_required: false, requires_photo: false, options: null, option_outcomes: {}, order_index: i,
    }))
    dataFields = dataSection.length
    if (dataFields) warnings.push(`${dataFields} campos de datos (D.n)`)
  }
  if (withMatrices) {
    for (const f of matrices.extraFields) dataSection.push({ item_number: `D.${dataSection.length + 1}`, description: f.en, description_es: f.es || f.en, item_type: 'text', unit: null, is_required: false, requires_photo: false, options: null, option_outcomes: {}, order_index: dataSection.length })
    matrices.tables.forEach((tb, i) => matrixSection.push({
      item_number: `M.${i + 1}`, description: tb.title.en || `Test record ${i + 1}`, description_es: tb.title.es || tb.title.en || `Registro de ensayo ${i + 1}`,
      item_type: 'table', options: tb.config, is_required: true, requires_photo: false, option_outcomes: {}, order_index: i, _note: tb.note,
    }))
    if (matrixSection.length) warnings.push(`${matrixSection.length} matriz(es) como tabla (M.n)`)
    if (matrices.extraFields.length) warnings.push(`${matrices.extraFields.length} campos sueltos de la matriz (D.n)`)
    warnings.push(...matrices.notes)
    if (!matrixSection.length && !matrices.notes.length) warnings.push('sin matriz reconocida (no es familia M)')
    if (dataSkipped) warnings.push(`${dataSkipped} datos del tag no duplicados`)
    if (!dataFields && !dataSkipped && FAMILY !== 'M') warnings.push('bloque de datos no reconocido')
  }
  const sections = [
    { title: 'Referencias de ejecución', items: [{ item_number: 'R.1', description: 'Identification and revision of the drawings, specifications or procedure used for this inspection.', description_es: 'Identificación y revisión de los planos, especificaciones o procedimiento utilizados para esta inspección.', item_type: 'text', is_required: true, requires_photo: false, options: null, option_outcomes: {}, order_index: 0 }] },
    ...(dataSection.length ? [{ title: 'Datos del elemento', items: dataSection }] : []),
    { title: 'Inspección', items: inspection },
    ...(matrixSection.length ? [{ title: 'Registros de ensayo', items: matrixSection }] : []),
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
  return { code, active, sections, warnings, untranslated, photos, itemCount: checklist.items.length, dataFields, dataSkipped }
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
    const rows = section.items.map(({ _note, ...it }) => ({ section_id: sec.id, template_id: tpl.id, requires_document: false, requires_measurement: false, is_critical: false, unit: null, acceptance_min: null, acceptance_max: null, acceptance_text: null, condition_item_id: null, condition_value: null, ...it }))
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
  if (!codes.length && (PURE || FAMILY)) {
    if (!Object.keys(classification).length) throw new Error('falta docs/ITR-CLASIFICACION-ORIGINALES-*.csv (ejecuta scripts/itr-v2/clasificar-originales.py)')
    // Las familias con matriz admiten formatos sin lista de chequeo (solo registro de ensayo).
    codes = Object.entries(classification).filter(([, c]) => c.familia === FAMILY && (c.items_chequeo > 0 || FAMILY === 'M' || FAMILY === 'DM')).map(([code]) => code)
  }
  if (!codes.length) { console.error('Indica --codes A,B, --pure o --family C+V'); process.exit(1) }
  const out = [['codigo', 'v_activa', 'v2_id', 'v2_version', 'items', 'fotos', 'sin_traduccion', 'equipo_prueba', 'avisos']]
  for (const code of codes) {
    try {
      if (MANUAL.has(code)) { out.push([code, '', '', '', '', '', '', '', 'revisión manual (Fase 1); no se genera']); console.log(code, 'revisión manual, omitido'); continue }
      const active = await loadActive(code)
      if (!active) { out.push([code, '', '', '', '', '', '', '', 'sin plantilla activa']); console.log(code, 'sin plantilla activa'); continue }
      const checklist = readChecklist(code)
      const plan = buildPlan(code, active, checklist)
      let created = { id: '', version: '' }
      const blocked = plan.warnings.some(w => /tipo dato|sin ítems|no es lista pura|no representable|sin matriz reconocida/.test(w))
      const hasContent = plan.itemCount > 0 || plan.sections.some(sec => sec.title === 'Registros de ensayo' && sec.items.length)
      if (APPLY && hasContent && !blocked) created = await apply(plan)
      else if (APPLY && blocked) plan.warnings.push('NO GENERADO: revisar a mano')
      out.push([code, active.version, created.id, created.version, plan.itemCount, plan.photos, plan.untranslated, checklist.equipment ? 'sí' : '', plan.warnings.join('; ')])
      if (args.includes('--verbose')) for (const it of plan.sections.filter(sec => sec.title === 'Registros de ensayo').flatMap(sec => sec.items)) console.log(`   ${it.item_number.padEnd(7)} table ${it._note} — ${it.description_es.slice(0, 40)} | filas: ${it.options.rows.mode === 'fixed' ? it.options.rows.labels.slice(0, 6).join(', ') + (it.options.rows.labels.length > 6 ? '…' : '') : it.options.rows.label + ' ' + it.options.rows.min + '–' + it.options.rows.max} | cols: ${it.options.columns.map(c => `${c.label}${c.unit ? ' [' + c.unit + ']' : ''}:${c.type[0]}`).join(', ')}`)
      if (args.includes('--verbose')) for (const it of plan.sections.filter(sec => sec.title === 'Datos del elemento' || sec.title === 'Inspección').flatMap(sec => sec.items)) console.log(`   ${it.item_number.padEnd(7)} ${it.item_type.padEnd(11)} ${it.requires_photo ? '📷' : '  '} ${(it.description_es ?? '(sin ES) ' + it.description).slice(0, 80)}`)
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
