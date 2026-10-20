'use server'

import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { checkProjectAccess } from '@/lib/auth/access'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertHierarchy, DEFAULT_SUBSYSTEM } from '@/lib/import/hierarchy'
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
}

// Filas por lote: una sola sentencia por lote en vez de un round-trip por fila.
// 300 mantiene la URL del SELECT `in(...)` de verificación bajo ~8 KB.
const CHUNK = 300

/** Tags del proyecto que ya existen entre los números dados (para la vista previa). */
export const findExistingTags = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (ctx, projectId: string, tagNumbers: string[]): Promise<{ error?: string; existing?: string[] }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }

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
  moves: { tag: string; blocked: boolean }[]
}

type Prepared = {
  plans: { plan: TagPlan; index: number; tag: string; isNew: boolean }[]
  errors: ImportResult['errors']
  warnings: string[]
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
  const resolveEquipmentType = (explicit: string | undefined, tagNumber: string): string | null => {
    if (explicit?.trim()) {
      const id = eqtByKey.get(normalizeTypeKey(explicit))
      if (id) return id
      unknownTypes.add(explicit.trim())
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
    warnings.push(`${dupes.size} tag(s) repetidos en el archivo; se usó la última fila de cada uno: ${list.slice(0, 5).join(', ')}${list.length > 5 ? '…' : ''}`)
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
    const found = (data ?? []) as unknown as Array<Record<string, unknown> & { id: string; tag_number: string; subsystem_id: string }>
    const ids = found.map(t => t.id)
    const [{ data: withItr }, { data: withPunch }] = ids.length
      ? await Promise.all([
          admin.from('itrs').select('tag_id').in('tag_id', ids),
          admin.from('punches').select('tag_id').in('tag_id', ids),
        ])
      : [{ data: [] }, { data: [] }]
    const busy = new Set([...(withItr ?? []), ...(withPunch ?? [])].map(r => r.tag_id))
    for (const t of found) existingByTag.set(t.tag_number, { ...t, has_work: busy.has(t.id) })
  }

  // ── Jerarquía (la vista previa solo lee la existente) ─────────
  let subsystemIdMap: Map<string, string>
  if (createHierarchy) {
    // Sin columna de subsistema, la jerarquía solo hace falta para los tags nuevos (antes se creaba
    // «GEN-SUB» aunque todos existieran).
    const needHierarchy = uniqueRows.filter(u => present.has('subsystem') || !existingByTag.has(u.row.tag_number.trim()))
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
    if (!disciplineId) { errors.push({ row: index + 2, tag: tagNumber, reason: `Disciplina "${row.discipline_code}" no existe en la organización` }); continue }
    // Sin columna de subsistema, un tag existente se queda en el suyo; uno nuevo necesita el del archivo (o el genérico).
    const target = subsystemId ?? (existing && !present.has('subsystem') ? existing.subsystem_id : undefined)
    if (!target) {
      if (createHierarchy) { errors.push({ row: index + 2, tag: tagNumber, reason: `Subsistema "${row.subsystem_code}" no pudo crearse` }); continue }
    }
    const plan = planTag(row, present, existing, {
      projectId, subsystemId: target ?? `nuevo:${normalizeCode(row.subsystem_code, DEFAULT_SUBSYSTEM)}`, disciplineId,
      equipmentTypeId: present.has('equipment_type') || !existing ? resolveEquipmentType(row.equipment_type_code, tagNumber) : null,
    })
    plans.push({ plan, index, tag: tagNumber, isNew: !existing })
  }

  if (unknownTypes.size > 0) {
    const list = [...unknownTypes]
    warnings.push(`Tipos de equipo no reconocidos (se usó la detección por prefijo del tag): ${list.slice(0, 6).join(', ')}${list.length > 6 ? '…' : ''}. Créalos en Admin → Configuración → Tipos de equipo.`)
  }
  if ((eqtData ?? []).length === 0) {
    warnings.push('La organización no tiene tipos de equipo configurados; los tags quedaron sin tipo. Carga el catálogo estándar en Admin → Configuración.')
  }
  const blocked = plans.filter(p => p.plan.move?.blocked).map(p => p.tag)
  if (blocked.length) {
    warnings.push(`${blocked.length} tag(s) con ITR o punch no se movieron de subsistema (muévelos con su flujo, no por importación): ${blocked.slice(0, 6).join(', ')}${blocked.length > 6 ? '…' : ''}`)
  }
  return { plans, errors, warnings }
}

/** Vista previa del diff por campo antes de aplicar (S07). No escribe nada. */
export const previewTagImport = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (ctx, projectId: string, rows: TagRow[], columns: string[]): Promise<{ error?: string; preview?: TagImportPreview }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }
    const prep = await prepareTagImport(ctx, createAdminClient(), projectId, rows, presentFromColumns(columns), false)
    if ('error' in prep) return { error: prep.error }
    const preview: TagImportPreview = { newTags: 0, updatedTags: 0, unchangedTags: 0, fieldChanges: {}, moves: [] }
    for (const { plan, isNew, tag } of prep.plans) {
      if (isNew) { preview.newTags++; continue }
      if (plan.changes.length) preview.updatedTags++; else preview.unchangedTags++
      for (const c of plan.changes) preview.fieldChanges[c] = (preview.fieldChanges[c] ?? 0) + 1
      if (plan.move) preview.moves.push({ tag, blocked: plan.move.blocked })
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
    if (!access.ok) return { error: access.error }

    const admin = createAdminClient()
    const prep = await prepareTagImport(ctx, admin, projectId, rows, presentFromColumns(columns), true)
    if ('error' in prep) return { error: prep.error }
    const result: ImportResult = { imported: 0, updated: 0, skipped: prep.errors.length, errors: prep.errors, warnings: prep.warnings }

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

    return { result }
  },
)
