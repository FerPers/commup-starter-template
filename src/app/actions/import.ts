'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PRIVILEGED_ROLES = ['owner', 'admin', 'architect']

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
}

export interface ImportResult {
  imported: number
  skipped: number
  errors: { row: number; tag: string; reason: string }[]
}

export async function importTags(
  projectId: string,
  rows: TagRow[]
): Promise<{ error?: string; result?: ImportResult }> {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // Role check
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) return { error: 'No perteneces a ninguna organización' }
  if (!PRIVILEGED_ROLES.includes(membership.role)) return { error: 'Sin permisos para importar' }

  // Verify project belongs to org
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', membership.org_id)
    .single()

  if (!project) return { error: 'Proyecto no encontrado' }

  const admin = createAdminClient()

  // Load disciplines map: code → id
  const { data: disciplinesData } = await admin
    .from('disciplines')
    .select('id, code')
    .eq('org_id', membership.org_id)

  const disciplineMap = new Map((disciplinesData ?? []).map(d => [d.code.toUpperCase(), d.id]))

  // ── Auto-create hierarchy ──────────────────────────────────

  // Collect unique area/system/subsystem codes
  const areaKeys   = [...new Set(rows.map(r => r.area_code.toUpperCase() || 'GENERAL'))]
  const systemKeys = [...new Set(rows.map(r => `${r.area_code.toUpperCase()}||${r.system_code.toUpperCase()}` || 'GENERAL||GEN-SYS'))]
  const subKeys    = [...new Set(rows.map(r => `${r.system_code.toUpperCase()}||${r.subsystem_code.toUpperCase()}`))]

  // Upsert areas
  const areaRows = areaKeys.map(code => ({
    project_id: projectId,
    code,
    name: rows.find(r => r.area_code.toUpperCase() === code)?.area_name || code,
    description: null,
  }))
  const { data: areas } = await admin
    .from('areas')
    .upsert(areaRows, { onConflict: 'project_id,code', ignoreDuplicates: false })
    .select('id, code')

  const areaIdMap = new Map((areas ?? []).map(a => [a.code, a.id]))

  // Upsert systems
  const systemInserts: object[] = []
  for (const key of systemKeys) {
    const [areaCode, sysCode] = key.split('||')
    const areaId = areaIdMap.get(areaCode)
    if (!areaId) continue
    const row = rows.find(r => r.area_code.toUpperCase() === areaCode && r.system_code.toUpperCase() === sysCode)
    systemInserts.push({
      project_id: projectId,
      area_id: areaId,
      code: sysCode,
      name: row?.system_name || sysCode,
      description: null,
    })
  }
  const { data: systems } = await admin
    .from('systems')
    .upsert(systemInserts, { onConflict: 'project_id,code', ignoreDuplicates: false })
    .select('id, code')

  const systemIdMap = new Map((systems ?? []).map(s => [s.code, s.id]))

  // Upsert subsystems
  const subInserts: object[] = []
  for (const key of subKeys) {
    const [sysCode, subCode] = key.split('||')
    const sysId = systemIdMap.get(sysCode)
    if (!sysId) continue
    const row = rows.find(r => r.system_code.toUpperCase() === sysCode && r.subsystem_code.toUpperCase() === subCode)
    subInserts.push({
      project_id: projectId,
      system_id: sysId,
      code: subCode,
      name: row?.subsystem_name || subCode,
      description: null,
    })
  }
  const { data: subsystems } = await admin
    .from('subsystems')
    .upsert(subInserts, { onConflict: 'project_id,code', ignoreDuplicates: false })
    .select('id, code')

  const subsystemIdMap = new Map((subsystems ?? []).map(s => [s.code, s.id]))

  // ── Insert tags ────────────────────────────────────────────

  const result: ImportResult = { imported: 0, skipped: 0, errors: [] }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const disciplineId = disciplineMap.get(row.discipline_code.toUpperCase())
    const subsystemId  = subsystemIdMap.get(row.subsystem_code.toUpperCase())

    if (!disciplineId) {
      result.errors.push({ row: i + 2, tag: row.tag_number, reason: `Disciplina "${row.discipline_code}" no existe en la organización` })
      result.skipped++
      continue
    }
    if (!subsystemId) {
      result.errors.push({ row: i + 2, tag: row.tag_number, reason: `Subsistema "${row.subsystem_code}" no pudo crearse` })
      result.skipped++
      continue
    }

    const { error } = await admin.from('tags').upsert({
      project_id: projectId,
      subsystem_id: subsystemId,
      discipline_id: disciplineId,
      tag_number: row.tag_number.trim(),
      description: row.description.trim(),
      manufacturer: row.manufacturer?.trim() || null,
      model: row.model?.trim() || null,
      serial_number: row.serial_number?.trim() || null,
      preservation_required: row.preservation_required ?? false,
      status: 'not_started',
    }, { onConflict: 'project_id,tag_number', ignoreDuplicates: false })

    if (error) {
      result.errors.push({ row: i + 2, tag: row.tag_number, reason: error.message })
      result.skipped++
    } else {
      result.imported++
    }
  }

  return { result }
}
