'use server'

import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { checkProjectAccess } from '@/lib/auth/access'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertHierarchy, DEFAULT_SUBSYSTEM } from '@/lib/import/hierarchy'
import { normalizeCode, normalizePidRef, textOrNull, textOr } from '@/lib/excel/normalize'
import type { Enums, TablesInsert } from '@/types/supabase.generated'

export interface SignalRow {
  signal_tag: string
  instrument_tag: string
  description: string
  signal_type: string
  service: string
  range_min: number | null
  range_max: number | null
  eng_unit: string
  alarm_setpoints: string
  origin: string
  destination: string
  pid_drawing: string
  loop_diagram: string
  wiring_diagram: string
  /** Fase 4-D: número de lazo y cadena del loop check (opcionales). */
  loop_number?: string
  junction_box?: string
  marshalling?: string
  io_card?: string
  io_channel?: string
  dcs_tag?: string
  hmi_display?: string
  notes: string
  discipline_code: string
  area_code: string
  area_name: string
  system_code: string
  system_name: string
  subsystem_code: string
  subsystem_name: string
}

export interface SignalImportResult {
  imported: number      // señales nuevas
  updated: number       // señales que ya existían
  tagsCreated: number   // tags instrumento creados porque no existían
  loopsCreated: number  // lazos creados desde la columna LAZO
  skipped: number
  errors: { row: number; tag: string; reason: string }[]
  warnings: string[]
}

const VALID_SIGNAL_TYPES: Enums<'signal_type'>[] = ['AI', 'AO', 'DI', 'DO', 'PI', 'PO']
const CHUNK = 300

export const importSignals = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (
    ctx,
    projectId: string,
    rows: SignalRow[],
  ): Promise<{ error?: string; result?: SignalImportResult }> => {
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: access.error }

    const admin = createAdminClient()
    const result: SignalImportResult = { imported: 0, updated: 0, tagsCreated: 0, loopsCreated: 0, skipped: 0, errors: [], warnings: [] }

    const { data: disciplinesData, error: discErr } = await admin
      .from('disciplines')
      .select('id, code')
      .eq('org_id', ctx.orgId)
    if (discErr) return { error: discErr.message }
    const disciplineMap = new Map((disciplinesData ?? []).map(d => [d.code.toUpperCase(), d.id]))

    // ── Validación + deduplicación por (instrumento, señal) ─────
    type Pending = {
      index: number
      row: SignalRow
      instrTag: string
      signalTag: string
      discId: string
      signalType: Enums<'signal_type'>
    }
    const byKey = new Map<string, Pending>()
    const dupes = new Set<string>()

    rows.forEach((row, index) => {
      const signalTag = row.signal_tag.trim()
      const instrTag = (row.instrument_tag || row.signal_tag).trim()
      const signalType = row.signal_type.trim().toUpperCase() as Enums<'signal_type'>
      const discId = disciplineMap.get(row.discipline_code.trim().toUpperCase())

      if (!signalTag) return
      if (!discId) {
        result.errors.push({ row: index + 2, tag: signalTag, reason: `Disciplina "${row.discipline_code}" no existe` })
        result.skipped++
        return
      }
      if (!VALID_SIGNAL_TYPES.includes(signalType)) {
        result.errors.push({ row: index + 2, tag: signalTag, reason: `Tipo de señal inválido "${row.signal_type}". Válidos: ${VALID_SIGNAL_TYPES.join(', ')}` })
        result.skipped++
        return
      }
      const key = `${instrTag.toUpperCase()}|${signalTag.toUpperCase()}`
      if (byKey.has(key)) dupes.add(signalTag)
      byKey.set(key, { index, row, instrTag, signalTag, discId, signalType })
    })
    if (dupes.size > 0) {
      const list = [...dupes]
      result.warnings.push(`${dupes.size} señal(es) repetidas en el archivo; se usó la última fila de cada una: ${list.slice(0, 5).join(', ')}${list.length > 5 ? '…' : ''}`)
    }
    const pending = [...byKey.values()]

    // ── Jerarquía ──────────────────────────────────────────────
    const hier = await upsertHierarchy(admin, projectId, pending.map(p => p.row))
    if ('error' in hier) return { error: hier.error }
    result.warnings.push(...hier.warnings)

    // ── Lazos (fase 4-D): se crean los que falten desde la columna LAZO ──
    // Subsistema y disciplina del lazo = los de su primera señal en el archivo.
    const loopIdMap = new Map<string, string>()
    const loopSeeds = new Map<string, Pending>()
    for (const p of pending) {
      const loopNumber = normalizeCode(p.row.loop_number ?? '', '')
      if (loopNumber && !loopSeeds.has(loopNumber)) loopSeeds.set(loopNumber, p)
    }
    if (loopSeeds.size > 0) {
      const numbers = [...loopSeeds.keys()]
      for (let i = 0; i < numbers.length; i += CHUNK) {
        const { data: existingLoops, error: lErr } = await admin.from('loops').select('id, loop_number').eq('project_id', projectId).in('loop_number', numbers.slice(i, i + CHUNK))
        if (lErr) return { error: lErr.message }
        for (const l of existingLoops ?? []) loopIdMap.set(l.loop_number, l.id)
      }
      const newLoops: TablesInsert<'loops'>[] = []
      for (const [loopNumber, p] of loopSeeds) {
        if (loopIdMap.has(loopNumber)) continue
        const subsystemId = hier.subsystemIdMap.get(normalizeCode(p.row.subsystem_code, DEFAULT_SUBSYSTEM))
        if (!subsystemId) { result.warnings.push(`Lazo "${loopNumber}": subsistema "${p.row.subsystem_code}" no disponible`); continue }
        newLoops.push({ project_id: projectId, subsystem_id: subsystemId, loop_number: loopNumber, discipline_id: p.discId, description: textOr(p.row.service, loopNumber) })
      }
      for (let i = 0; i < newLoops.length; i += CHUNK) {
        const { data: inserted, error: insErr } = await admin.from('loops').insert(newLoops.slice(i, i + CHUNK)).select('id, loop_number')
        if (insErr) return { error: `Lazos: ${insErr.message}` }
        for (const l of inserted ?? []) loopIdMap.set(l.loop_number, l.id)
        result.loopsCreated += inserted?.length ?? 0
      }
    }

    // ── Lotes ──────────────────────────────────────────────────
    for (let i = 0; i < pending.length; i += CHUNK) {
      const chunk = pending.slice(i, i + CHUNK)

      // 1. Tags instrumento: solo se CREAN los que faltan. Un tag que ya
      //    existe (viene del índice de instrumentos) conserva su descripción
      //    y su estado; antes el upsert los pisaba con los datos de la señal.
      const instrTags = [...new Set(chunk.map(c => c.instrTag))]
      const { data: existingTags, error: exErr } = await admin
        .from('tags')
        .select('id, tag_number')
        .eq('project_id', projectId)
        .in('tag_number', instrTags)
      if (exErr) return { error: exErr.message }
      const tagIdMap = new Map((existingTags ?? []).map(t => [t.tag_number, t.id]))

      const newTags = new Map<string, TablesInsert<'tags'>>()
      for (const c of chunk) {
        if (tagIdMap.has(c.instrTag) || newTags.has(c.instrTag)) continue
        const subsystemId = hier.subsystemIdMap.get(normalizeCode(c.row.subsystem_code, DEFAULT_SUBSYSTEM))
        if (!subsystemId) continue // se reporta abajo, fila a fila
        newTags.set(c.instrTag, {
          project_id: projectId,
          subsystem_id: subsystemId,
          discipline_id: c.discId,
          tag_number: c.instrTag,
          description: textOr(c.row.description, c.instrTag),
          pid_drawing: normalizePidRef(c.row.pid_drawing),
        })
      }
      if (newTags.size > 0) {
        const { data: inserted, error: insErr } = await admin
          .from('tags')
          .insert([...newTags.values()])
          .select('id, tag_number')
        if (insErr) {
          // Fallback fila a fila para aislar la que falla
          for (const payload of newTags.values()) {
            const { data: one, error: oneErr } = await admin.from('tags').insert(payload).select('id, tag_number').single()
            if (one) { tagIdMap.set(one.tag_number, one.id); result.tagsCreated++ }
            else result.warnings.push(`Tag instrumento "${payload.tag_number}": ${oneErr?.message ?? 'no pudo crearse'}`)
          }
        } else {
          for (const t of inserted ?? []) tagIdMap.set(t.tag_number, t.id)
          result.tagsCreated += inserted?.length ?? 0
        }
      }

      // 2. Señales
      type SigPending = { payload: TablesInsert<'signals'>; index: number; tag: string }
      const sigs: SigPending[] = []
      for (const c of chunk) {
        const tagId = tagIdMap.get(c.instrTag)
        if (!tagId) {
          const reason = hier.subsystemIdMap.has(normalizeCode(c.row.subsystem_code, DEFAULT_SUBSYSTEM))
            ? `Tag instrumento "${c.instrTag}" no pudo crearse`
            : `Subsistema "${c.row.subsystem_code}" no pudo crearse`
          result.errors.push({ row: c.index + 2, tag: c.signalTag, reason })
          result.skipped++
          continue
        }
        sigs.push({
          index: c.index,
          tag: c.signalTag,
          payload: {
            tag_id: tagId,
            signal_tag: c.signalTag,
            description: textOrNull(c.row.description),
            signal_type: c.signalType,
            service: textOrNull(c.row.service),
            range_min: c.row.range_min,
            range_max: c.row.range_max,
            eng_unit: textOrNull(c.row.eng_unit),
            alarm_setpoints: textOrNull(c.row.alarm_setpoints),
            origin: textOrNull(c.row.origin),
            destination: textOrNull(c.row.destination),
            pid_drawing: normalizePidRef(c.row.pid_drawing),
            loop_diagram: textOrNull(c.row.loop_diagram),
            wiring_diagram: textOrNull(c.row.wiring_diagram),
            notes: textOrNull(c.row.notes),
            junction_box: textOrNull(c.row.junction_box),
            marshalling: textOrNull(c.row.marshalling),
            io_card: textOrNull(c.row.io_card),
            io_channel: textOrNull(c.row.io_channel),
            dcs_tag: textOrNull(c.row.dcs_tag),
            hmi_display: textOrNull(c.row.hmi_display),
            loop_id: loopIdMap.get(normalizeCode(c.row.loop_number ?? '', '')) ?? null,
          },
        })
      }
      if (sigs.length === 0) continue

      const { data: existingSigs, error: exSigErr } = await admin
        .from('signals')
        .select('tag_id, signal_tag')
        .in('tag_id', [...new Set(sigs.map(s => s.payload.tag_id))])
        .in('signal_tag', sigs.map(s => s.payload.signal_tag))
      if (exSigErr) return { error: exSigErr.message }
      const existingKeys = new Set((existingSigs ?? []).map(s => `${s.tag_id}|${s.signal_tag}`))
      const count = (p: TablesInsert<'signals'>) => {
        if (existingKeys.has(`${p.tag_id}|${p.signal_tag}`)) result.updated++; else result.imported++
      }

      // Instrumentos del lazo (loop_tags): idempotente por (loop_id, tag_id).
      const loopTags = [...new Map(sigs.filter(s => s.payload.loop_id).map(s => [`${s.payload.loop_id}|${s.payload.tag_id}`, { loop_id: s.payload.loop_id!, tag_id: s.payload.tag_id }])).values()]
      if (loopTags.length) {
        const { error: ltErr } = await admin.from('loop_tags').upsert(loopTags, { onConflict: 'loop_id,tag_id', ignoreDuplicates: true })
        if (ltErr) result.warnings.push(`Lazos ↔ instrumentos: ${ltErr.message}`)
      }

      const { error: batchErr } = await admin
        .from('signals')
        .upsert(sigs.map(s => s.payload), { onConflict: 'tag_id,signal_tag', ignoreDuplicates: false })
      if (!batchErr) {
        sigs.forEach(s => count(s.payload))
        continue
      }
      for (const s of sigs) {
        const { error } = await admin
          .from('signals')
          .upsert(s.payload, { onConflict: 'tag_id,signal_tag', ignoreDuplicates: false })
        if (error) {
          result.errors.push({ row: s.index + 2, tag: s.tag, reason: error.message })
          result.skipped++
        } else {
          count(s.payload)
        }
      }
    }

    return { result }
  },
)
