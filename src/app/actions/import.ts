'use server'

import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { checkProjectAccess } from '@/lib/auth/access'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertHierarchy, DEFAULT_SUBSYSTEM } from '@/lib/import/hierarchy'
import { normalizeCode, normalizePidRef, textOrNull, textOr } from '@/lib/excel/normalize'
import type { TablesInsert } from '@/types/supabase.generated'

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
  fluid_type?: string
  mounting_typical?: string
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

export const importTags = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (
    ctx,
    projectId: string,
    rows: TagRow[],
  ): Promise<{ error?: string; result?: ImportResult }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }

    const admin = createAdminClient()
    const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [], warnings: [] }

    const { data: disciplinesData, error: discErr } = await admin
      .from('disciplines')
      .select('id, code')
      .eq('org_id', ctx.orgId)
    if (discErr) return { error: discErr.message }
    const disciplineMap = new Map((disciplinesData ?? []).map(d => [d.code.toUpperCase(), d.id]))

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
      result.warnings.push(
        `${dupes.size} tag(s) repetidos en el archivo; se usó la última fila de cada uno: ${list.slice(0, 5).join(', ')}${list.length > 5 ? '…' : ''}`,
      )
    }
    const uniqueRows = [...byTag.values()]

    // ── Jerarquía ──────────────────────────────────────────────
    const hier = await upsertHierarchy(admin, projectId, uniqueRows.map(u => u.row))
    if ('error' in hier) return { error: hier.error }
    result.warnings.push(...hier.warnings)

    // ── Payloads ───────────────────────────────────────────────
    type Pending = { payload: TablesInsert<'tags'>; index: number; tag: string }
    const pending: Pending[] = []

    for (const { row, index } of uniqueRows) {
      const disciplineId = disciplineMap.get(row.discipline_code.trim().toUpperCase())
      const subsystemId = hier.subsystemIdMap.get(normalizeCode(row.subsystem_code, DEFAULT_SUBSYSTEM))
      const tagNumber = row.tag_number.trim()

      if (!disciplineId) {
        result.errors.push({ row: index + 2, tag: tagNumber, reason: `Disciplina "${row.discipline_code}" no existe en la organización` })
        result.skipped++
        continue
      }
      if (!subsystemId) {
        result.errors.push({ row: index + 2, tag: tagNumber, reason: `Subsistema "${row.subsystem_code}" no pudo crearse` })
        result.skipped++
        continue
      }

      // Sin `status` a propósito: un tag existente conserva su avance
      // (ITRs en curso, punches); los nuevos toman el default 'not_started'.
      pending.push({
        index,
        tag: tagNumber,
        payload: {
          project_id: projectId,
          subsystem_id: subsystemId,
          discipline_id: disciplineId,
          tag_number: tagNumber,
          description: textOr(row.description, tagNumber),
          manufacturer: textOrNull(row.manufacturer),
          model: textOrNull(row.model),
          serial_number: textOrNull(row.serial_number),
          preservation_required: row.preservation_required ?? false,
          pid_drawing: normalizePidRef(row.pid_drawing),
          fluid_type: textOrNull(row.fluid_type),
          mounting_typical: textOrNull(row.mounting_typical),
        },
      })
    }

    // ── Upsert por lotes (fallback fila a fila solo si el lote falla) ──
    for (let i = 0; i < pending.length; i += CHUNK) {
      const chunk = pending.slice(i, i + CHUNK)

      const { data: existingRows, error: exErr } = await admin
        .from('tags')
        .select('tag_number')
        .eq('project_id', projectId)
        .in('tag_number', chunk.map(c => c.payload.tag_number))
      if (exErr) return { error: exErr.message }
      const existing = new Set((existingRows ?? []).map(t => t.tag_number))
      const count = (tag: string) => { if (existing.has(tag)) result.updated++; else result.imported++ }

      const { error: batchErr } = await admin
        .from('tags')
        .upsert(chunk.map(c => c.payload), { onConflict: 'project_id,tag_number', ignoreDuplicates: false })

      if (!batchErr) {
        chunk.forEach(c => count(c.payload.tag_number))
        continue
      }

      for (const c of chunk) {
        const { error } = await admin
          .from('tags')
          .upsert(c.payload, { onConflict: 'project_id,tag_number', ignoreDuplicates: false })
        if (error) {
          result.errors.push({ row: c.index + 2, tag: c.tag, reason: error.message })
          result.skipped++
        } else {
          count(c.payload.tag_number)
        }
      }
    }

    return { result }
  },
)
