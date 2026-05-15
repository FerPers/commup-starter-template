'use server'

import { getActiveMembership } from '@/lib/supabase/membership'
import { PRIVILEGED_ROLES } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/admin'

export interface SignalRow {
  signal_tag:      string
  instrument_tag:  string
  description:     string
  signal_type:     string   // AI | AO | DI | DO | PI | PO
  service:         string
  range_min:       number | null
  range_max:       number | null
  eng_unit:        string
  alarm_setpoints: string
  origin:          string
  destination:     string
  pid_drawing:     string
  loop_diagram:    string
  wiring_diagram:  string
  notes:           string
  // hierarchy
  discipline_code: string
  area_code:       string
  area_name:       string
  system_code:     string
  system_name:     string
  subsystem_code:  string
  subsystem_name:  string
}

export interface SignalImportResult {
  imported: number
  skipped:  number
  errors:   { row: number; tag: string; reason: string }[]
}

const VALID_SIGNAL_TYPES = ['AI', 'AO', 'DI', 'DO', 'PI', 'PO']

export async function importSignals(
  projectId: string,
  rows: SignalRow[]
): Promise<{ error?: string; result?: SignalImportResult }> {
  const ctx = await getActiveMembership()
  if (!ctx) return { error: 'No autenticado' }
  if (!PRIVILEGED_ROLES.includes(ctx.role)) return { error: 'Sin permisos para importar' }

  const { data: project } = await ctx.supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', ctx.orgId)
    .single()

  if (!project) return { error: 'Proyecto no encontrado' }

  const admin = createAdminClient()

  // Disciplines map
  const { data: disciplinesData } = await admin
    .from('disciplines')
    .select('id, code')
    .eq('org_id', ctx.orgId)
  const disciplineMap = new Map((disciplinesData ?? []).map(d => [d.code.toUpperCase(), d.id]))

  // ── Auto-create hierarchy ──────────────────────────────────

  const areaKeys    = [...new Set(rows.map(r => r.area_code.toUpperCase() || 'GENERAL'))]
  const systemKeys  = [...new Set(rows.map(r => `${r.area_code.toUpperCase()}||${r.system_code.toUpperCase()}`))]
  const subKeys     = [...new Set(rows.map(r => `${r.system_code.toUpperCase()}||${r.subsystem_code.toUpperCase()}`))]

  const areaRows = areaKeys.map(code => ({
    project_id: projectId, code,
    name: rows.find(r => r.area_code.toUpperCase() === code)?.area_name || code,
    description: null,
  }))
  const { data: areas } = await admin
    .from('areas')
    .upsert(areaRows, { onConflict: 'project_id,code', ignoreDuplicates: false })
    .select('id, code')
  const areaIdMap = new Map((areas ?? []).map(a => [a.code, a.id]))

  const systemInserts: object[] = []
  for (const key of systemKeys) {
    const [areaCode, sysCode] = key.split('||')
    const areaId = areaIdMap.get(areaCode)
    if (!areaId) continue
    const row = rows.find(r => r.area_code.toUpperCase() === areaCode && r.system_code.toUpperCase() === sysCode)
    systemInserts.push({ project_id: projectId, area_id: areaId, code: sysCode, name: row?.system_name || sysCode, description: null })
  }
  const { data: systems } = await admin
    .from('systems')
    .upsert(systemInserts, { onConflict: 'project_id,code', ignoreDuplicates: false })
    .select('id, code')
  const systemIdMap = new Map((systems ?? []).map(s => [s.code, s.id]))

  const subInserts: object[] = []
  for (const key of subKeys) {
    const [sysCode, subCode] = key.split('||')
    const sysId = systemIdMap.get(sysCode)
    if (!sysId) continue
    const row = rows.find(r => r.system_code.toUpperCase() === sysCode && r.subsystem_code.toUpperCase() === subCode)
    subInserts.push({ project_id: projectId, system_id: sysId, code: subCode, name: row?.subsystem_name || subCode, description: null })
  }
  const { data: subsystems } = await admin
    .from('subsystems')
    .upsert(subInserts, { onConflict: 'project_id,code', ignoreDuplicates: false })
    .select('id, code')
  const subsystemIdMap = new Map((subsystems ?? []).map(s => [s.code, s.id]))

  // ── Process rows ────────────────────────────────────────────

  const result: SignalImportResult = { imported: 0, skipped: 0, errors: [] }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2

    const discId    = disciplineMap.get(row.discipline_code.toUpperCase())
    const subId     = subsystemIdMap.get(row.subsystem_code.toUpperCase())
    const signalType = row.signal_type.toUpperCase()

    if (!discId) {
      result.errors.push({ row: rowNum, tag: row.signal_tag, reason: `Disciplina "${row.discipline_code}" no existe` })
      result.skipped++; continue
    }
    if (!subId) {
      result.errors.push({ row: rowNum, tag: row.signal_tag, reason: `Subsistema no pudo crearse` })
      result.skipped++; continue
    }
    if (!VALID_SIGNAL_TYPES.includes(signalType)) {
      result.errors.push({ row: rowNum, tag: row.signal_tag, reason: `Tipo de señal inválido "${row.signal_type}". Válidos: ${VALID_SIGNAL_TYPES.join(', ')}` })
      result.skipped++; continue
    }

    // Upsert instrument tag (TAG INSTRUMENTO → tags table)
    const instrTag = row.instrument_tag || row.signal_tag
    const { data: tag, error: tagError } = await admin
      .from('tags')
      .upsert({
        project_id: projectId,
        subsystem_id: subId,
        discipline_id: discId,
        tag_number: instrTag.trim(),
        description: row.description?.trim() || instrTag,
        status: 'not_started',
      }, { onConflict: 'project_id,tag_number', ignoreDuplicates: false })
      .select('id')
      .single()

    if (tagError || !tag) {
      result.errors.push({ row: rowNum, tag: row.signal_tag, reason: `Error creando tag instrumento: ${tagError?.message}` })
      result.skipped++; continue
    }

    // Upsert signal
    const { error: sigError } = await admin
      .from('signals')
      .upsert({
        tag_id:          tag.id,
        signal_tag:      row.signal_tag.trim(),
        description:     row.description?.trim() || null,
        signal_type:     signalType,
        service:         row.service?.trim() || null,
        range_min:       row.range_min,
        range_max:       row.range_max,
        eng_unit:        row.eng_unit?.trim() || null,
        alarm_setpoints: row.alarm_setpoints?.trim() || null,
        origin:          row.origin?.trim() || null,
        destination:     row.destination?.trim() || null,
        pid_drawing:     row.pid_drawing?.trim() || null,
        loop_diagram:    row.loop_diagram?.trim() || null,
        wiring_diagram:  row.wiring_diagram?.trim() || null,
        notes:           row.notes?.trim() || null,
      }, { onConflict: 'tag_id,signal_tag', ignoreDuplicates: false })

    if (sigError) {
      result.errors.push({ row: rowNum, tag: row.signal_tag, reason: sigError.message })
      result.skipped++
    } else {
      result.imported++
    }
  }

  return { result }
}
