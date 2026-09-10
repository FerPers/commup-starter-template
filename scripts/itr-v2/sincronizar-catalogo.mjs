#!/usr/bin/env node
// Fase 6 — Biblioteca de formatos: organización catálogo + clonación.
//
// Sincroniza plantillas ITR entre organizaciones con la misma huella de
// contenido que usa la app (src/lib/itr/clone.ts, importado con el soporte
// nativo de TypeScript de Node ≥ 23.6):
//
//   node scripts/itr-v2/sincronizar-catalogo.mjs                      # vista previa DEMO → catálogo
//   node scripts/itr-v2/sincronizar-catalogo.mjs --apply              # escribe
//   node scripts/itr-v2/sincronizar-catalogo.mjs --from <slug> --to <slug> [--apply]
//   node scripts/itr-v2/sincronizar-catalogo.mjs --to morelco --apply # catálogo → Ecopetrol
//
// Reglas:
//   • Origen: revisión ACTIVA por código (se ignoran los códigos QA-*).
//   • Destino sin el código → v1. Destino con el código y huella distinta → v(max+1).
//     Huella idéntica → no se toca. Re-ejecutable: nunca duplica.
//   • Si el destino es la organización catálogo (settings.is_template_catalog), la
//     revisión nueva se activa de inmediato (el catálogo no ejecuta ITRs) y la
//     matriz equipo×ITR se copia del origen. En una org cliente queda INACTIVA:
//     el editor la revisa y pulsa «Activar esta revisión».
//   • --crear-catalogo: crea la org «CommUp Catálogo» (slug commup-catalogo) con
//     Luis como owner, disciplinas, fases y tipos de equipo copiados del origen.
//   • --seed-config: crea en el destino las disciplinas / fases / tipos de equipo
//     que falten (por código) antes de sincronizar.
// Salida: docs/CATALOGO-SYNC-<fecha>.csv (--csv <ruta> para otro destino).

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { conditionRemaps, itemInsertRow, orderedSections, templateContentHash } from '../../src/lib/itr/clone.ts'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..')
const ACTOR = 'fc1593b4-5fc1-4eae-9fb0-b213ecae7366' // Luis (owner)
const TODAY = new Date().toISOString().slice(0, 10)
const CATALOG_SLUG = 'commup-catalogo'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const arg = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt)
const FROM = arg('--from', 'demo-refiner-a-los-andes')
const TO = arg('--to', CATALOG_SLUG)
const CREATE_CATALOG = args.includes('--crear-catalogo')
const SEED_CONFIG = args.includes('--seed-config') || CREATE_CATALOG

const env = Object.fromEntries(readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const SECTIONS = 'itr_template_sections(id, title, order_index, itr_template_items(id, item_number, description, description_es, description_es_source, item_type, is_required, is_critical, requires_photo, requires_document, requires_measurement, options, option_outcomes, unit, acceptance_min, acceptance_max, acceptance_text, order_index, condition_item_id, condition_value))'
const fail = (e, what) => { if (e) throw new Error(`${what}: ${e.message ?? e}`) }

async function org(slug) {
  const { data, error } = await db.from('organizations').select('id, name, slug, settings').eq('slug', slug).maybeSingle()
  fail(error, 'organizations')
  return data
}

async function createCatalog(source) {
  const { data: o, error } = await db.from('organizations').insert({ name: 'CommUp Catálogo', slug: CATALOG_SLUG, plan: 'starter', settings: { is_template_catalog: true } }).select('id, name, slug, settings').single()
  fail(error, 'crear org catálogo')
  fail((await db.from('org_members').insert({ org_id: o.id, user_id: ACTOR, role: 'owner' })).error, 'owner del catálogo')
  await db.from('activity_log').insert({ org_id: o.id, user_id: ACTOR, entity_type: 'organization', entity_id: o.id, action: 'catalog_created', payload: { source_org_id: source.id } })
  return o
}

/** Disciplinas, fases y tipos de equipo del destino por código; crea los que falten si SEED_CONFIG. */
async function config(source, target) {
  const out = {}
  for (const [table, cols] of [['disciplines', 'code, name, color'], ['project_phases', 'code, name, color, order_index'], ['equipment_types', 'code, name, category']]) {
    const { data: src } = await db.from(table).select(cols).eq('org_id', source.id)
    const { data: dst } = await db.from(table).select('id, code').eq('org_id', target.id)
    const map = new Map((dst ?? []).map(r => [r.code, r.id]))
    const missing = (src ?? []).filter(r => !map.has(r.code))
    if (missing.length && SEED_CONFIG && APPLY) {
      const { data: ins, error } = await db.from(table).insert(missing.map(r => ({ ...r, org_id: target.id }))).select('id, code')
      fail(error, `sembrar ${table}`)
      for (const r of ins ?? []) map.set(r.code, r.id)
    }
    console.log(`${table}: ${map.size} en destino${missing.length ? `, ${missing.length} faltan en destino${SEED_CONFIG ? (APPLY ? ' → creadas' : ' → se crearán') : ' (usa --seed-config)'}: ${missing.map(m => m.code).join(', ')}` : ''}`)
    out[table] = map
  }
  return out
}

async function copyTemplate(src, target, cfg, version, activate) {
  const disc = cfg.disciplines.get(src.disciplines?.code), phase = cfg.project_phases.get(src.project_phases?.code)
  if (!disc || !phase) throw new Error(`falta disciplina ${src.disciplines?.code} o fase ${src.project_phases?.code} en el destino`)
  const { data: tpl, error } = await db.from('itr_templates').insert({
    org_id: target.id, discipline_id: disc, phase_id: phase, equipment_type_id: cfg.equipment_types.get(src.equipment_types?.code) ?? null,
    code: src.code, title: src.title, title_es: src.title_es,
    description: version === 1 ? (src.description ?? `Importada de «${src.orgName}» (v${src.version}, ${TODAY}).`) : `Revisión ${version}: importada de «${src.orgName}» (v${src.version}, ${TODAY}).${src.description ? ' ' + src.description : ''}`,
    version, is_active: activate, is_global: false,
  }).select('id').single()
  fail(error, `insertar ${src.code}`)
  const idMap = new Map()
  for (const sec of orderedSections(src.itr_template_sections)) {
    const { data: s, error: sErr } = await db.from('itr_template_sections').insert({ template_id: tpl.id, title: sec.title, order_index: sec.order_index }).select('id').single()
    fail(sErr, `sección ${sec.title}`)
    if (!sec.itr_template_items.length) continue
    const { data: ins, error: iErr } = await db.from('itr_template_items').insert(sec.itr_template_items.map(it => itemInsertRow(it, s.id, tpl.id))).select('id, order_index')
    fail(iErr, `ítems de ${sec.title}`)
    const byOrder = [...ins].sort((a, b) => a.order_index - b.order_index)
    sec.itr_template_items.forEach((it, i) => { if (byOrder[i]) idMap.set(it.id, byOrder[i].id) })
  }
  for (const c of conditionRemaps(src.itr_template_sections, idMap)) {
    fail((await db.from('itr_template_items').update({ condition_item_id: c.condition_item_id, condition_value: c.condition_value }).eq('id', c.id)).error, 'condición')
  }
  return tpl.id
}

/** Activa la revisión en el destino (catálogo): desactiva las demás del código y mueve/copia la matriz. */
async function activateInCatalog(target, code, newId, srcId, cfg) {
  const { data: others } = await db.from('itr_templates').select('id').eq('org_id', target.id).eq('code', code).neq('id', newId)
  const otherIds = (others ?? []).map(o => o.id)
  if (otherIds.length) {
    fail((await db.from('itr_templates').update({ is_active: false }).in('id', otherIds)).error, 'desactivar anteriores')
    fail((await db.from('equipment_type_templates').delete().in('itr_template_id', otherIds)).error, 'limpiar matriz anterior')
  }
  const { data: rows } = await db.from('equipment_type_templates').select('status, source, confidence, reason, model, reviewed_at, equipment_types(code)').eq('itr_template_id', srcId)
  const matrix = (rows ?? []).flatMap(m => { const t = cfg.equipment_types.get(m.equipment_types?.code); return t ? [{ org_id: target.id, equipment_type_id: t, itr_template_id: newId, status: m.status, source: m.source, confidence: m.confidence, reason: m.reason, model: m.model, reviewed_at: m.reviewed_at }] : [] })
  if (matrix.length) fail((await db.from('equipment_type_templates').insert(matrix)).error, 'matriz')
  return matrix.length
}

async function main() {
  const source = await org(FROM)
  if (!source) throw new Error(`no existe la org origen «${FROM}»`)
  let target = await org(TO)
  if (!target) {
    if (!(CREATE_CATALOG && TO === CATALOG_SLUG)) throw new Error(`no existe la org destino «${TO}» (para crear el catálogo: --to ${CATALOG_SLUG} --crear-catalogo)`)
    if (APPLY) target = await createCatalog(source)
    else { console.log(`[vista previa] se crearía la org «CommUp Catálogo» (${CATALOG_SLUG}) marcada como catálogo, con Luis como owner`); target = { id: '00000000-0000-0000-0000-000000000000', name: 'CommUp Catálogo', slug: CATALOG_SLUG, settings: { is_template_catalog: true } } }
  }
  const targetIsCatalog = !!target.settings?.is_template_catalog
  console.log(`${APPLY ? 'APLICANDO' : 'Vista previa'}: ${source.name} → ${target.name}${targetIsCatalog ? ' (catálogo: las revisiones nuevas se activan)' : ' (org cliente: las revisiones nuevas quedan inactivas)'}`)
  const cfg = await config(source, target)

  const { data: srcTemplates, error } = await db.from('itr_templates')
    .select(`id, code, title, title_es, description, version, disciplines(code), project_phases(code), equipment_types(code), ${SECTIONS}`)
    .eq('org_id', source.id).eq('is_active', true).not('code', 'ilike', 'QA-%').order('code')
  fail(error, 'plantillas origen')
  const { data: dstTemplates } = await db.from('itr_templates').select(`id, code, version, is_active, ${SECTIONS}`).eq('org_id', target.id)
  const latest = new Map()
  for (const t of dstTemplates ?? []) { const p = latest.get(t.code); if (!p || t.version > p.version) latest.set(t.code, { ...t, hash: templateContentHash(t.itr_template_sections) }) }

  const out = [['codigo', 'accion', 'version_origen', 'version_destino', 'id_destino', 'matriz', 'nota']]
  const tally = { created: 0, revision: 0, unchanged: 0, error: 0 }
  for (const src of srcTemplates) {
    src.orgName = source.name
    const hash = templateContentHash(src.itr_template_sections)
    const local = latest.get(src.code)
    try {
      if (local && local.hash === hash) { tally.unchanged++; out.push([src.code, 'sin cambios', src.version, local.version, local.id, '', '']); continue }
      const version = local ? local.version + 1 : 1
      const action = local ? 'revisión' : 'nueva'
      let id = '', matrix = ''
      if (APPLY) {
        id = await copyTemplate(src, target, cfg, version, !local || targetIsCatalog)
        if (targetIsCatalog) matrix = await activateInCatalog(target, src.code, id, src.id, cfg)
        await db.from('activity_log').insert({ org_id: target.id, user_id: ACTOR, entity_type: 'itr_template', entity_id: id, action: 'template_imported', payload: { code: src.code, version, kind: local ? 'revision' : 'created', source_org_id: source.id, source_template_id: src.id, source_version: src.version, content_hash: hash, source: 'sincronizar-catalogo' } })
      }
      tally[local ? 'revision' : 'created']++
      out.push([src.code, action, src.version, version, id, matrix, local && !targetIsCatalog ? 'inactiva: activar en el editor' : ''])
    } catch (e) {
      tally.error++; out.push([src.code, 'ERROR', src.version, '', '', '', e.message]); console.error(src.code, 'ERROR', e.message)
    }
  }
  const file = path.resolve(ROOT, arg('--csv', `docs/CATALOGO-SYNC-${TODAY}.csv`))
  writeFileSync(file, '﻿' + out.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n')
  console.log(`\n${srcTemplates.length} plantillas activas en origen → nuevas ${tally.created} · revisiones ${tally.revision} · sin cambios ${tally.unchanged} · errores ${tally.error}\n${APPLY ? 'aplicado' : 'vista previa'} → ${file}`)
}

main().catch(e => { console.error(e); process.exit(1) })
