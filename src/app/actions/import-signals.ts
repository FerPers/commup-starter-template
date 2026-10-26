'use server'

import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { getTranslations } from 'next-intl/server'
import { checkProjectAccess } from '@/lib/auth/access'
import { accessError } from '@/lib/i18n/action-errors'
import { createAdminClient, emitImportSummary } from '@/lib/supabase/admin'
import { upsertHierarchy, DEFAULT_SUBSYSTEM } from '@/lib/import/hierarchy'
import { normalizeCode, normalizePidRef, textOr } from '@/lib/excel/normalize'
import { planSignal, signalPayloadColumns } from '@/lib/import/signal-merge'
import { SIGNAL_TYPES, normalizeSignalType } from '@/lib/signals/types'
import { detectEquipmentTypeCode, normalizeTypeKey } from '@/lib/equipment-types'
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
  /** Hoja de origen (lista con DCS/ESD/F&G en hojas separadas). */
  sheet?: string
  /** El instrumento pertenece a un sistema de seguridad (hoja ESD / F&G marcada): su criticidad sube a «safety». */
  safety_critical?: boolean
}

export interface SignalImportResult {
  imported: number      // señales nuevas
  updated: number       // señales que ya existían
  tagsCreated: number   // tags instrumento creados porque no existían
  loopsCreated: number  // lazos creados desde la columna LAZO
  markedSafety: number  // tags instrumento que pasaron a criticidad «safety» (hojas de seguridad)
  skipped: number
  errors: { row: number; tag: string; reason: string }[]
  warnings: string[]
}

// Lotes de 100: con 300 el GET de señales existentes (`tag_id IN (…)` + `signal_tag IN (…)`) pasaba el largo
// máximo de URL y la lista F&G de Akacías (322 señales) fallaba entera con «URI too long».
const CHUNK = 100

export const importSignals = withAuthOnly(
  { role: PRIVILEGED_ROLES },
  async (
    ctx,
    projectId: string,
    rows: SignalRow[],
    /** S07 (D9): columnas que trae el archivo; lo que no viene (o viene vacío) no se toca. */
    columns: string[],
  ): Promise<{ error?: string; result?: SignalImportResult }> => {
    const t = await getTranslations('ActionErrors')
    const present = new Set(columns)
    const access = await checkProjectAccess(ctx.supabase, ctx.orgId, projectId)
    if (!access.ok) return { error: await accessError(access) }

    // S21 (B-03): sin un evento por fila; un resumen al final.
    const admin = createAdminClient({ bulk: 'signals' })
    const result: SignalImportResult = { imported: 0, updated: 0, tagsCreated: 0, loopsCreated: 0, markedSafety: 0, skipped: 0, errors: [], warnings: [] }

    const { data: disciplinesData, error: discErr } = await admin
      .from('disciplines')
      .select('id, code')
      .eq('org_id', ctx.orgId)
    if (discErr) return { error: discErr.message }
    const disciplineMap = new Map((disciplinesData ?? []).map(d => [d.code.toUpperCase(), d.id]))

    // Tags instrumento nuevos: tipo de equipo por el prefijo ISA (como el importador de tags), si la org lo tiene.
    const { data: eqtData } = await admin.from('equipment_types').select('id, code').eq('org_id', ctx.orgId)
    const eqtByCode = new Map((eqtData ?? []).map(e => [normalizeTypeKey(e.code), e.id]))
    const typeFor = (tagNumber: string) => {
      const code = detectEquipmentTypeCode(tagNumber)
      return code ? eqtByCode.get(normalizeTypeKey(code)) ?? null : null
    }

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
      const signalType = normalizeSignalType(row.signal_type)
      const discId = disciplineMap.get(row.discipline_code.trim().toUpperCase())

      if (!signalTag) return
      if (!discId) {
        result.errors.push({ row: index + 2, tag: signalTag, reason: t('importSignals.disciplineNotFound', { code: row.discipline_code }) })
        result.skipped++
        return
      }
      if (!signalType) {
        result.errors.push({ row: index + 2, tag: signalTag, reason: t('importSignals.signalTypeInvalid', { type: row.signal_type, valid: SIGNAL_TYPES.join(', ') }) })
        result.skipped++
        return
      }
      const key = `${instrTag.toUpperCase()}|${signalTag.toUpperCase()}`
      if (byKey.has(key)) dupes.add(signalTag)
      byKey.set(key, { index, row, instrTag, signalTag, discId, signalType })
    })
    if (dupes.size > 0) {
      const list = [...dupes]
      result.warnings.push(t('importSignals.duplicateSignals', { count: dupes.size, list: `${list.slice(0, 5).join(', ')}${list.length > 5 ? '…' : ''}` }))
    }
    const pending = [...byKey.values()]

    // ── Tags instrumento que ya existen (vienen del índice de instrumentos) ──
    // Se leen antes de la jerarquía: sistema y subsistema del archivo (columnas o títulos de sección) solo ubican
    // los tags NUEVOS; uno existente no se mueve, y crear su subsistema dejaría subsistemas vacíos.
    const existingInstr = new Map<string, { id: string; subsystem_id: string }>()
    const instrNumbers = [...new Set(pending.map(p => p.instrTag))]
    for (let i = 0; i < instrNumbers.length; i += CHUNK) {
      const { data, error: exErr } = await admin.from('tags').select('id, tag_number, subsystem_id')
        .eq('project_id', projectId).in('tag_number', instrNumbers.slice(i, i + CHUNK))
      if (exErr) return { error: exErr.message }
      for (const tg of data ?? []) existingInstr.set(tg.tag_number, { id: tg.id, subsystem_id: tg.subsystem_id })
    }

    // ── Jerarquía (solo para los tags instrumento que se van a crear) ──
    const hier = await upsertHierarchy(admin, projectId, pending.filter(p => !existingInstr.has(p.instrTag)).map(p => p.row))
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
        const subsystemId = existingInstr.get(p.instrTag)?.subsystem_id ?? hier.subsystemIdMap.get(normalizeCode(p.row.subsystem_code, DEFAULT_SUBSYSTEM))
        if (!subsystemId) { result.warnings.push(t('importSignals.loopSubsystemMissing', { loop: loopNumber, code: p.row.subsystem_code })); continue }
        newLoops.push({ project_id: projectId, subsystem_id: subsystemId, loop_number: loopNumber, discipline_id: p.discId, description: textOr(p.row.service, loopNumber) })
      }
      for (let i = 0; i < newLoops.length; i += CHUNK) {
        const { data: inserted, error: insErr } = await admin.from('loops').insert(newLoops.slice(i, i + CHUNK)).select('id, loop_number')
        if (insErr) return { error: t('importSignals.loopsError', { error: insErr.message }) }
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
      const tagIdMap = new Map([...new Set(chunk.map(c => c.instrTag))]
        .flatMap(n => { const ex = existingInstr.get(n); return ex ? [[n, ex.id] as const] : [] }))

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
          equipment_type_id: typeFor(c.instrTag),
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
            if (one) { tagIdMap.set(one.tag_number, one.id); existingInstr.set(one.tag_number, { id: one.id, subsystem_id: payload.subsystem_id }); result.tagsCreated++ }
            else result.warnings.push(oneErr ? t('importSignals.instrumentTagError', { tag: payload.tag_number, error: oneErr.message }) : t('importSignals.instrumentTagNotCreated', { tag: payload.tag_number }))
          }
        } else {
          // Un instrumento repetido en otro lote (DCS y ESD) ya existe: no se vuelve a crear.
          for (const tg of inserted ?? []) {
            tagIdMap.set(tg.tag_number, tg.id)
            existingInstr.set(tg.tag_number, { id: tg.id, subsystem_id: newTags.get(tg.tag_number)!.subsystem_id })
          }
          result.tagsCreated += inserted?.length ?? 0
        }
      }

      // 1b. Instrumentos de un sistema de seguridad (hoja ESD / F&G marcada): criticidad «safety». Solo sube,
      //     nunca baja: un tag ya «safety» no se toca y uno «process» o «normal» pasa a «safety».
      const safetyIds = [...new Set(chunk.filter(c => c.row.safety_critical).map(c => tagIdMap.get(c.instrTag)).filter((v): v is string => !!v))]
      if (safetyIds.length > 0) {
        const { data: marked, error: critErr } = await admin.from('tags').update({ criticality: 'safety' })
          .eq('project_id', projectId).in('id', safetyIds).or('criticality.is.null,criticality.neq.safety').select('id')
        if (critErr) result.warnings.push(t('importSignals.safetyError', { error: critErr.message }))
        else result.markedSafety += marked?.length ?? 0
      }

      // 2. Señales — S07 (F-06): claves uniformes; las existentes conservan lo que el archivo no trae.
      const sigColumns = signalPayloadColumns(present)
      const tagIds = [...new Set(chunk.map(c => tagIdMap.get(c.instrTag)).filter((v): v is string => !!v))]
      const { data: existingSigs, error: exSigErr } = tagIds.length
        ? await admin.from('signals')
            .select(['tag_id', 'signal_tag', 'signal_type', ...sigColumns].join(', '))
            .in('tag_id', tagIds)
            .in('signal_tag', chunk.map(c => c.signalTag))
        : { data: [], error: null }
      if (exSigErr) return { error: exSigErr.message }
      const existingByKey = new Map(((existingSigs ?? []) as Array<Record<string, unknown> & { tag_id: string; signal_tag: string }>)
        .map(s => [`${s.tag_id}|${s.signal_tag}`, s]))

      type SigPending = { payload: TablesInsert<'signals'>; index: number; tag: string; isNew: boolean }
      const sigs: SigPending[] = []
      for (const c of chunk) {
        const tagId = tagIdMap.get(c.instrTag)
        if (!tagId) {
          const reason = hier.subsystemIdMap.has(normalizeCode(c.row.subsystem_code, DEFAULT_SUBSYSTEM))
            ? t('importSignals.instrumentTagNotCreated', { tag: c.instrTag })
            : t('importSignals.subsystemNotCreated', { code: c.row.subsystem_code })
          result.errors.push({ row: c.index + 2, tag: c.signalTag, reason })
          result.skipped++
          continue
        }
        const existing = existingByKey.get(`${tagId}|${c.signalTag}`) ?? null
        const loopId = loopIdMap.get(normalizeCode(c.row.loop_number ?? '', '')) ?? null
        // eslint-disable-next-line no-restricted-syntax -- G-18: planSignal recorre la fila por nombre de columna (SignalRow no tiene firma de índice)
        const plan = planSignal(c.row as unknown as Record<string, unknown> & { signal_tag: string }, present, existing, { tagId, signalType: c.signalType, loopId })
        sigs.push({ index: c.index, tag: c.signalTag, payload: plan.payload as TablesInsert<'signals'>, isNew: !existing })
      }
      if (sigs.length === 0) continue
      const count = (s: SigPending) => { if (s.isNew) result.imported++; else result.updated++ }

      // Instrumentos del lazo (loop_tags): idempotente por (loop_id, tag_id).
      const loopTags = [...new Map(sigs.filter(s => s.payload.loop_id).map(s => [`${s.payload.loop_id}|${s.payload.tag_id}`, { loop_id: s.payload.loop_id!, tag_id: s.payload.tag_id }])).values()]
      if (loopTags.length) {
        const { error: ltErr } = await admin.from('loop_tags').upsert(loopTags, { onConflict: 'loop_id,tag_id', ignoreDuplicates: true })
        if (ltErr) result.warnings.push(t('importSignals.loopTagsError', { error: ltErr.message }))
      }

      const { error: batchErr } = await admin
        .from('signals')
        .upsert(sigs.map(s => s.payload), { onConflict: 'tag_id,signal_tag', ignoreDuplicates: false })
      if (!batchErr) {
        sigs.forEach(count)
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
          count(s)
        }
      }
    }

    if (result.imported + result.updated + result.tagsCreated + result.loopsCreated > 0) {
      await emitImportSummary(admin, {
        orgId: ctx.orgId, projectId, actorId: ctx.userId, kind: 'signals',
        counts: { imported: result.imported, updated: result.updated, tags_created: result.tagsCreated,
                  loops_created: result.loopsCreated, marked_safety: result.markedSafety, skipped: result.skipped },
      })
    }
    return { result }
  },
)
