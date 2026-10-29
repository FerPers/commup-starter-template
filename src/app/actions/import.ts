'use server'

import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { getTranslations } from 'next-intl/server'
import { checkProjectAccess } from '@/lib/auth/access'
import { accessError } from '@/lib/i18n/action-errors'
import { createAdminClient, emitImportSummary } from '@/lib/supabase/admin'
import { upsertHierarchy, DEFAULT_SUBSYSTEM, DEFAULT_SYSTEM } from '@/lib/import/hierarchy'
import { dominantSubsystemByPid, pidSheetKey } from '@/lib/import/pid-place'
import { normalizeCode } from '@/lib/excel/normalize'
import { detectEquipmentTypeCode, normalizeTypeKey } from '@/lib/equipment-types'
import type { TablesInsert } from '@/types/supabase.generated'
import type { Criticality } from '@/lib/tags/criticality'
import { payloadColumns, planTag, presentFromColumns, type ExistingTag, type TagField, type TagPlan } from '@/lib/import/tag-merge'

export interface TagRow {
  tag_number: string
  description: string
  discipline_code: string
  area_code: string
  area_name: string
  system_code: string
  system_name: string
  subsystem_code: string
  subsystem_name: string
  equipment_type_code?: string
  manufacturer?: string
  model?: string
  serial_number?: string
  preservation_required?: boolean
  pid_drawing?: string
  /** Datos maestros que autollenan los ITR; si la columna no viene en el Excel no se tocan. */
  datasheet_number?: string
  revision?: string
  range_min?: number
  range_max?: number
  eng_unit?: string
  junction_box?: string
  fluid_type?: string
  mounting_typical?: string
  /** safety / process / normal; ausente = no se toca (con SIL declarado se sugiere safety). */
  criticality?: Criticality
  /** 'SIL1'…'SIL4' o 'None'; ausente = no se toca. */
  sil_level?: string
}

export interface ImportResult {
  imported: number   // tags nuevos
  updated: number    // tags que ya existían (datos actualizados, estado conservado)
  skipped: number
  errors: { row: number; tag: string; reason: string }[]
  warnings: string[]
  /** Tags nuevos sin sistema en el archivo: ubicados por su P&ID / quedan en el sistema general. */
  placedByPid?: number
  inGeneral?: number
}

// Filas por lote: una sola sentencia por lote en vez de un round-trip por fila.
// 300 mantiene la URL del SELECT `in(...)` de verificación bajo ~8 KB.
const CHUNK = 300

/** Tags del proyecto que ya existen entre los números dados (para la vista previa). */
export const findExistingTags = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (ctx, projectId: string, tagNumbers: string[]): Promise<{ error?: string; existing?: string[] }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: await accessError(access) }

    const existing: string[] = []
    const unique = [...new Set(tagNumbers.map(t => t.trim()).filter(Boolean))]
    for (let i = 0; i < unique.length; i += CHUNK) {
      const { data, error } = await ctx.supabase
        .from('tags')
        .select('tag_number')
        .eq('project_id', projectId)
        .in('tag_number', unique.slice(i, i + CHUNK))
      if (error) return { error: error.message }
      existing.push(...(data ?? []).map(t => t.tag_number))
    }
    return { existing }
  },
)

/** Resultado de comparar el archivo con lo cargado (vista previa, S07). */
export interface TagImportPreview {
  newTags: number
  updatedTags: number
  unchangedTags: number
  /** Columna de BD → cantidad de tags existentes en que cambia. */
  fieldChanges: Record<string, number>
  /** Tags que el archivo cambia de subsistema; `blocked` = tienen ITR o punch y se quedan donde están. */
  moves: { tag: string; tagId: string | null; blocked: boolean }[]
  /** Tags nuevos sin sistema en el archivo: ubicados por su P&ID / quedan en el sistema general. */
  placedByPid: number
  inGeneral: number
}

type Prepared = {
  plans: { plan: TagPlan; index: number; tag: string; isNew: boolean; id: string | null }[]
  errors: ImportResult['errors']
  warnings: string[]
  placedByPid: number
  inGeneral: number
}

/** Por hoja de P&ID, el subsistema con más tags del proyecto (src/lib/import/pid-place.ts). */
async function pidSubsystems(admin: ReturnType<typeof createAdminClient>, projectId: string): Promise<Map<string, string> | { error: string }> {
  const tags: { pid_drawing: string | null; subsystem_id: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('tags').select('pid_drawing, subsystem_id')
      .eq('project_id', projectId).not('pid_drawing', 'is', null).order('id').range(from, from + 999)
    if (error) return { error: error.message }
    tags.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return dominantSubsystemByPid(tags)
}

/**
 * Común a la vista previa y a la importación: deduplica, resuelve jerarquía, disciplina y tipo de
 * equipo, lee los tags existentes (con sus valores actuales y si tienen ITR o punch) y arma los planes
 * (src/lib/import/tag-merge.ts). `createHierarchy: false` en la vista previa no crea nada.
 */
async function prepareTagImport(
  ctx: { orgId: string },
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  rows: TagRow[],
  present: Set<TagField>,
  createHierarchy: boolean,
): Promise<Prepared | { error: string }> {
  const t = await getTranslations('ActionErrors')
  const errors: ImportResult['errors'] = []
  const warnings: string[] = []

  const { data: disciplinesData, error: discErr } = await admin.from('disciplines').select('id, code').eq('org_id', ctx.orgId)
  if (discErr) return { error: discErr.message }
  const disciplineMap = new Map((disciplinesData ?? []).map(d => [d.code.toUpperCase(), d.id]))

  // Tipos de equipo de la org: se resuelven por código o por nombre (columna TIPO EQUIPO); si el Excel
  // no lo trae, por el prefijo ISA del tag (solo para tags nuevos).
  const { data: eqtData } = await admin.from('equipment_types').select('id, code, name').eq('org_id', ctx.orgId)
  const eqtByKey = new Map<string, string>()
  for (const e of eqtData ?? []) {
    eqtByKey.set(normalizeTypeKey(e.code), e.id)
    eqtByKey.set(normalizeTypeKey(e.name), e.id)
  }
  const unknownTypes = new Set<string>()
  // Listas mecánicas (CPF Orotoy): la columna «TIPO» trae la norma o el alcance del paquete («API-650, Techo Fijo»,
  // «Equipo paquetizado en skid compuesto por…»), no un tipo. Se cuentan aparte y el aviso no los copia.
  let descriptiveTypes = 0
  const resolveEquipmentType = (explicit: string | undefined, tagNumber: string): string | null => {
    if (explicit?.trim()) {
      const id = eqtByKey.get(normalizeTypeKey(explicit))
      if (id) return id
      if (explicit.trim().length > 40 || /[,;:.]/.test(explicit)) descriptiveTypes++
      else unknownTypes.add(explicit.trim())
    }
    const detected = detectEquipmentTypeCode(tagNumber)
    return detected ? eqtByKey.get(normalizeTypeKey(detected)) ?? null : null
  }

  // ── Deduplicar por tag (última fila gana: es la revisión más reciente en la hoja) ──
  const byTag = new Map<string, { row: TagRow; index: number }>()
  const dupes = new Set<string>()
  rows.forEach((row, index) => {
    const key = row.tag_number.trim().toUpperCase()
    if (!key) return
    if (byTag.has(key)) dupes.add(row.tag_number.trim())
    byTag.set(key, { row, index })
  })
  if (dupes.size > 0) {
    const list = [...dupes]
    warnings.push(t('import.duplicateTags', { count: dupes.size, list: `${list.slice(0, 5).join(', ')}${list.length > 5 ? '…' : ''}` }))
  }
  const uniqueRows = [...byTag.values()]

  // ── Existentes, con valores actuales y si tienen ITR o punch ──
  const columns = payloadColumns(present)
  const existingByTag = new Map<string, ExistingTag>()
  const numbers = uniqueRows.map(u => u.row.tag_number.trim())
  for (let i = 0; i < numbers.length; i += CHUNK) {
    const { data, error } = await admin.from('tags')
      .select(['id', 'tag_number', 'subsystem_id', 'discipline_id', ...columns].join(', '))
      .eq('project_id', projectId)
      .in('tag_number', numbers.slice(i, i + CHUNK))
    if (error) return { error: error.message }
    // eslint-disable-next-line no-restricted-syntax -- G-18: select armado en tiempo de ejecución (supabase-js no lo puede tipar)
    const found = (data ?? []) as unknown as Array<Record<string, unknown> & { id: string; tag_number: string; subsystem_id: string }>
    const ids = found.map(t => t.id)
    const [{ data: withItr }, { data: withPunch }] = ids.length
      ? await Promise.all([
          admin.from('itrs').select('tag_id').in('tag_id', ids),
          admin.from('punches').select('tag_id').in('tag_id', ids),
        ])
      : [{ data: [] }, { data: [] }]
    const busy = new Set([...(withItr ?? []), ...(withPunch ?? [])].map(r => r.tag_id))
    for (const tg of found) existingByTag.set(tg.tag_number, { ...tg, has_work: busy.has(tg.id) })
  }

  // Sin sistema en el archivo (listas mecánicas: solo «EQUIPO ESTÁTICO / ROTATIVO»), un tag NUEVO va al subsistema
  // con más tags de su hoja de P&ID (decisión de Luis, 2026-10-29); sin P&ID conocido, al sistema general. Los que
  // ya existen no se mueven.
  const byPid = new Map<string, string>()
  const unplaced = uniqueRows.filter(u => !existingByTag.has(u.row.tag_number.trim()) && normalizeCode(u.row.system_code, DEFAULT_SYSTEM) === DEFAULT_SYSTEM)
  if (unplaced.some(u => pidSheetKey(u.row.pid_drawing))) {
    const sheets = await pidSubsystems(admin, projectId)
    if ('error' in sheets) return sheets
    for (const u of unplaced) {
      const key = pidSheetKey(u.row.pid_drawing)
      const sub = key ? sheets.get(key) : undefined
      if (sub) byPid.set(u.row.tag_number.trim(), sub)
    }
  }

  // ── Jerarquía (la vista previa solo lee la existente) ─────────
  let subsystemIdMap: Map<string, string>
  if (createHierarchy) {
    // Sin columna de subsistema, la jerarquía solo hace falta para los tags nuevos (antes se creaba
    // «GEN-SUB» aunque todos existieran).
    const needHierarchy = uniqueRows.filter(u => !byPid.has(u.row.tag_number.trim()) && (present.has('subsystem') || !existingByTag.has(u.row.tag_number.trim())))
    const hier = needHierarchy.length
      ? await upsertHierarchy(admin, projectId, needHierarchy.map(u => u.row))
      : { subsystemIdMap: new Map<string, string>(), warnings: [] as string[] }
    if ('error' in hier) return { error: hier.error }
    warnings.push(...hier.warnings)
    subsystemIdMap = hier.subsystemIdMap
  } else {
    const { data: subs } = await admin.from('subsystems').select('id, code, systems!inner(project_id)').eq('systems.project_id', projectId)
    subsystemIdMap = new Map((subs ?? []).map(s => [s.code.toUpperCase(), s.id]))
  }

  const plans: Prepared['plans'] = []
  for (const { row, index } of uniqueRows) {
    const tagNumber = row.tag_number.trim()
    const disciplineId = disciplineMap.get(row.discipline_code.trim().toUpperCase())
    const existing = existingByTag.get(tagNumber) ?? null
    const subsystemId = subsystemIdMap.get(normalizeCode(row.subsystem_code, DEFAULT_SUBSYSTEM))
    if (!disciplineId) { errors.push({ row: index + 2, tag: tagNumber, reason: t('import.disciplineNotFound', { code: row.discipline_code }) }); continue }
    // Sin columna de subsistema, un tag existente se queda en el suyo; uno nuevo necesita el del archivo (o el genérico).
    const target = byPid.get(tagNumber) ?? subsystemId ?? (existing && !present.has('subsystem') ? existing.subsystem_id : undefined)
    if (!target) {
      if (createHierarchy) { errors.push({ row: index + 2, tag: tagNumber, reason: t('import.subsystemNotCreated', { code: row.subsystem_code }) }); continue }
    }
    const plan = planTag(row, present, existing, {
      projectId, subsystemId: target ?? `nuevo:${normalizeCode(row.subsystem_code, DEFAULT_SUBSYSTEM)}`, disciplineId,
      equipmentTypeId: present.has('equipment_type') || !existing ? resolveEquipmentType(row.equipment_type_code, tagNumber) : null,
    })
    plans.push({ plan, index, tag: tagNumber, isNew: !existing, id: existing?.id ?? null })
  }

  if (descriptiveTypes > 0) warnings.push(t('import.typeColumnDescriptive', { count: descriptiveTypes }))
  if (unknownTypes.size > 0) {
    const list = [...unknownTypes]
    warnings.push(t('import.unknownEquipmentTypes', { list: `${list.slice(0, 6).join(', ')}${list.length > 6 ? '…' : ''}` }))
  }
  if ((eqtData ?? []).length === 0) {
    warnings.push(t('import.noEquipmentTypes'))
  }
  const blocked = plans.filter(p => p.plan.move?.blocked).map(p => p.tag)
  if (blocked.length) {
    warnings.push(t('import.movesBlocked', { count: blocked.length, list: `${blocked.slice(0, 6).join(', ')}${blocked.length > 6 ? '…' : ''}` }))
  }
  return { plans, errors, warnings, placedByPid: byPid.size, inGeneral: unplaced.length - byPid.size }
}

/** Vista previa del diff por campo antes de aplicar (S07). No escribe nada. */
export const previewTagImport = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (ctx, projectId: string, rows: TagRow[], columns: string[]): Promise<{ error?: string; preview?: TagImportPreview }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: await accessError(access) }
    const prep = await prepareTagImport(ctx, createAdminClient(), projectId, rows, presentFromColumns(columns), false)
    if ('error' in prep) return { error: prep.error }
    const preview: TagImportPreview = { newTags: 0, updatedTags: 0, unchangedTags: 0, fieldChanges: {}, moves: [], placedByPid: prep.placedByPid, inGeneral: prep.inGeneral }
    for (const { plan, isNew, tag, id } of prep.plans) {
      if (isNew) { preview.newTags++; continue }
      if (plan.changes.length) preview.updatedTags++; else preview.unchangedTags++
      for (const c of plan.changes) preview.fieldChanges[c] = (preview.fieldChanges[c] ?? 0) + 1
      if (plan.move) preview.moves.push({ tag, tagId: id, blocked: plan.move.blocked })
    }
    return { preview }
  },
)

/**
 * Importa un lote (el wizard manda lotes de ~1000 filas, C-24). `columns` = columnas que el archivo
 * trae: lo que no viene no se toca (D9).
 */
export const importTags = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (
    ctx,
    projectId: string,
    rows: TagRow[],
    columns: string[],
  ): Promise<{ error?: string; result?: ImportResult }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: await accessError(access) }

    // S21 (B-03): sin un evento por fila (50k tags = 50k eventos); un resumen al final.
    const admin = createAdminClient({ bulk: 'tags' })
    const prep = await prepareTagImport(ctx, admin, projectId, rows, presentFromColumns(columns), true)
    if ('error' in prep) return { error: prep.error }
    const result: ImportResult = { imported: 0, updated: 0, skipped: prep.errors.length, errors: prep.errors, warnings: prep.warnings, placedByPid: prep.placedByPid, inGeneral: prep.inGeneral }

    // ── Upsert por lotes con claves uniformes (fallback fila a fila solo si el lote falla) ──
    for (let i = 0; i < prep.plans.length; i += CHUNK) {
      const chunk = prep.plans.slice(i, i + CHUNK)
      const count = (isNew: boolean) => { if (isNew) result.imported++; else result.updated++ }
      const { error: batchErr } = await admin.from('tags')
        .upsert(chunk.map(c => c.plan.payload as TablesInsert<'tags'>), { onConflict: 'project_id,tag_number', ignoreDuplicates: false })
      if (!batchErr) { chunk.forEach(c => count(c.isNew)); continue }
      for (const c of chunk) {
        const { error } = await admin.from('tags')
          .upsert(c.plan.payload as TablesInsert<'tags'>, { onConflict: 'project_id,tag_number', ignoreDuplicates: false })
        if (error) { result.errors.push({ row: c.index + 2, tag: c.tag, reason: error.message }); result.skipped++ }
        else count(c.isNew)
      }
    }

    if (result.imported + result.updated > 0) {
      await emitImportSummary(admin, {
        orgId: ctx.orgId, projectId, actorId: ctx.userId, kind: 'tags',
        counts: { imported: result.imported, updated: result.updated, skipped: result.skipped },
      })
    }
    return { result }
  },
)
