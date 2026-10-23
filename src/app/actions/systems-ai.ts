'use server'

import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { logActivity } from '@/lib/log-activity'
import { aiNotConfigured, isAiConfigured } from '@/lib/ai/claude'
import { runAi } from '@/lib/ai/run'
import { reconcileSuggestions, type ReconciledSuggestions } from '@/lib/systems/ai'
import { DEPENDENCY_KINDS, SYSTEM_TYPES, defaultDependencyGates, type DependencyKind, type SystemType } from '@/lib/systems/dependencies'

// IA de sistematización (fase 2): Claude PROPONE tipo, prioridad, nombre descriptivo y
// dependencias a partir de áreas, subsistemas y tags; una persona acepta o descarta en pantalla.
// Nada se guarda hasta que el editor aplica, y nunca se pisan sistemas ya definidos por una
// persona (llegan desmarcados). Mismo patrón que la matriz ITR (itr-matrix.ts).

const MAX_SYSTEMS_PER_CALL = 80
const TAGS_PER_SYSTEM = 25

const SYSTEM_RULES = `Eres un ingeniero senior de Completion & Commissioning (Oil & Gas, energía e industria) que arma la sistematización de un proyecto: divide la planta en sistemas, los clasifica y ordena su comisionamiento.

Para cada sistema que recibas devuelve:
- suggested_name: nombre descriptivo corto en español según su función (ej.: «Aire de instrumentos», «Compresión de GLP», «Tea de alta presión»). Si el nombre actual ya es descriptivo, consérvalo.
- system_type: process (proceso), utility (servicios: aire de instrumentos, nitrógeno, agua de enfriamiento, vapor, generación y distribución eléctrica, combustible) o safety (seguridad: tea, alivio, contra incendio, detección de fuego y gas, ESD).
- priority de 1 a 5: 1 = se comisiona primero porque habilita a otros (potencia, aire, N₂, seguridad básica); 5 = diferible.

Dependencias: un sistema depende de otro cuando no puede comisionarse o arrancar sin él. Casi todos los sistemas de proceso dependen de potencia eléctrica y de aire de instrumentos; los que manejan hidrocarburos dependen además de la tea/alivio y de contra incendio; un sistema aguas abajo depende del de aguas arriba (kind = process). Los servicios dependen de la generación eléctrica. No propongas ciclos.
- kind: utility (el proveedor es un servicio o seguridad), process (aguas arriba en el proceso) u other.

Reglas:
- Usa solo los códigos de sistema recibidos. No inventes sistemas.
- Básate en el nombre del área, los subsistemas y los tags (código y descripción). Si la evidencia es débil, baja la confianza en vez de omitir.
- confidence es un número entre 0 y 1. reason es una frase corta en español (máx. 160 caracteres), concreta y verificable por un ingeniero (cita tags o el área cuando ayude).`

const SystemizationOutput = z.object({
  systems: z.array(z.object({
    system_code: z.string(),
    suggested_name: z.string(),
    system_type: z.enum(['process', 'utility', 'safety']),
    priority: z.number().int().min(1).max(5),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  })),
  dependencies: z.array(z.object({
    system_code: z.string(),
    depends_on_code: z.string(),
    kind: z.enum(['utility', 'process', 'other']),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  })),
})

type SystemRow = { id: string; code: string; name: string; system_type: SystemType | null; priority: number | null; area: string }

export const suggestSystemization = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project' as const, field: 'projectId' }] },
  async (ctx, input: { projectId: string }): Promise<{ suggestions?: ReconciledSuggestions; truncated?: boolean; error?: string }> => {
    if (!isAiConfigured()) return { error: await aiNotConfigured() }
    const te = await getTranslations('ActionErrors')

    const [{ data: sysData }, { data: subs }, { data: tags }, { data: deps }] = await Promise.all([
      ctx.supabase.from('systems').select('id, code, name, system_type, priority, areas(code, name)').eq('project_id', input.projectId).order('code'),
      ctx.supabase.from('subsystems').select('id, system_id, code, name').eq('project_id', input.projectId),
      // Muestra de tags (tope por defecto de PostgREST: 1000); por sistema se recortan a TAGS_PER_SYSTEM.
      ctx.supabase.from('tags').select('subsystem_id, tag_number, description').eq('project_id', input.projectId).order('tag_number').limit(1000),
      ctx.supabase.from('system_dependencies').select('system_id, depends_on_system_id').eq('project_id', input.projectId),
    ])
    const all: SystemRow[] = (sysData ?? []).map(s => {
      const area = s.areas as { code: string; name: string } | null
      return { id: s.id, code: s.code, name: s.name, system_type: s.system_type as SystemType | null, priority: s.priority, area: area ? `${area.code} — ${area.name}` : '' }
    })
    if (!all.length) return { error: te('systemsAi.noSystems') }
    const systems = all.slice(0, MAX_SYSTEMS_PER_CALL)

    const systemOfSub = new Map((subs ?? []).map(s => [s.id, s.system_id]))
    const subsBySystem = new Map<string, string[]>()
    for (const s of subs ?? []) subsBySystem.set(s.system_id, [...(subsBySystem.get(s.system_id) ?? []), s.name !== s.code ? `${s.code} ${s.name}` : s.code])
    const tagsBySystem = new Map<string, string[]>()
    for (const t of tags ?? []) {
      const sid = systemOfSub.get(t.subsystem_id)
      if (!sid) continue
      const list = tagsBySystem.get(sid) ?? []
      if (list.length < TAGS_PER_SYSTEM) list.push(`${t.tag_number}${t.description ? ` ${t.description.replace(/\s+/g, ' ').slice(0, 60)}` : ''}`)
      tagsBySystem.set(sid, list)
    }
    const codeOf = new Map(all.map(s => [s.id, s.code]))
    const systemsText = systems.map(s => [
      `### ${s.code}${s.name !== s.code ? ` — ${s.name}` : ''}`,
      `Área: ${s.area || '—'}`,
      s.system_type || s.priority ? `Ya definido por el equipo: ${s.system_type ?? '—'} · P${s.priority ?? '—'}` : null,
      `Subsistemas: ${(subsBySystem.get(s.id) ?? []).join(', ') || '—'}`,
      `Tags: ${(tagsBySystem.get(s.id) ?? []).join(' | ') || '—'}`,
    ].filter(Boolean).join('\n')).join('\n\n')
    const depsText = (deps ?? []).map(d => `${codeOf.get(d.system_id)} depende de ${codeOf.get(d.depends_on_system_id)}`).join('\n')

    const run = await runAi({ orgId: ctx.orgId, userId: ctx.userId, projectId: input.projectId, feature: 'systems' }, (client, model) =>
      client.messages.parse({
        model,
        max_tokens: 16000,
        output_config: { effort: 'medium', format: zodOutputFormat(SystemizationOutput) },
        system: SYSTEM_RULES,
        messages: [{
          role: 'user',
          content: `SISTEMAS DEL PROYECTO:\n\n${systemsText}\n\nDEPENDENCIAS YA REGISTRADAS (no las repitas):\n${depsText || '—'}\n\nDevuelve tipo, prioridad y nombre para cada sistema, y las dependencias que faltan.`,
        }],
      }))
    if (!run.response) return { error: run.error }
    const response = run.response
    const parsed = response.parsed_output
    if (!parsed) return { error: te('systemsAi.aiUnparsable') }

    const suggestions = reconcileSuggestions(parsed, all, deps ?? [])
    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'system.ai_suggested', entityType: 'project', entityId: input.projectId,
      payload: { model: response.model, systems: suggestions.attributes.length, dependencies: suggestions.dependencies.length, discarded: suggestions.discarded.length },
    })
    return { suggestions, truncated: all.length > systems.length }
  },
)

export type ApplySuggestionsResult = { systemsUpdated: number; dependenciesCreated: number; errors: string[]; error?: string }

/** Aplica solo lo que el editor marcó. Las dependencias quedan con source = 'ai' y gates por defecto del tipo. */
export const applySystemSuggestions = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project' as const, field: 'projectId' }] },
  async (
    ctx,
    input: {
      projectId: string
      attributes: { systemId: string; name?: string; system_type: SystemType; priority: number }[]
      dependencies: { systemId: string; providerId: string; kind: DependencyKind; notes?: string }[]
    },
  ): Promise<ApplySuggestionsResult> => {
    const t = await getTranslations('ActionErrors')
    const result: ApplySuggestionsResult = { systemsUpdated: 0, dependenciesCreated: 0, errors: [] }
    if (input.attributes.length + input.dependencies.length > 500) return { ...result, error: t('systemsAi.tooMany', { max: 500 }) }

    const [{ data: systems }, { data: gates }] = await Promise.all([
      ctx.supabase.from('systems').select('id, code').eq('project_id', input.projectId),
      ctx.supabase.from('readiness_gates').select('id, code, order_index, is_active').eq('org_id', ctx.orgId),
    ])
    const codeOf = new Map((systems ?? []).map(s => [s.id, s.code]))

    for (const a of input.attributes) {
      if (!codeOf.has(a.systemId)) { result.errors.push(t('systemsAi.systemOutside')); continue }
      if (!SYSTEM_TYPES.includes(a.system_type) || !(Number.isInteger(a.priority) && a.priority >= 1 && a.priority <= 5)) {
        result.errors.push(t('systemsAi.typeOrPriorityInvalid', { code: codeOf.get(a.systemId) ?? '' })); continue
      }
      const name = a.name?.trim().slice(0, 200)
      const { error } = await ctx.supabase.from('systems')
        .update({ system_type: a.system_type, priority: a.priority, ...(name ? { name } : {}) })
        .eq('id', a.systemId).eq('project_id', input.projectId)
      if (error) result.errors.push(`${codeOf.get(a.systemId)}: ${error.message}`)
      else result.systemsUpdated++
    }

    for (const d of input.dependencies) {
      if (!codeOf.has(d.systemId) || !codeOf.has(d.providerId)) { result.errors.push(t('systemsAi.systemOutside')); continue }
      if (!DEPENDENCY_KINDS.includes(d.kind)) { result.errors.push(t('systemsAi.dependencyKindInvalid')); continue }
      const def = defaultDependencyGates(d.kind, gates ?? [])
      if (!def) { result.errors.push(t('systemsAi.noActiveGates')); break }
      const { error } = await ctx.supabase.from('system_dependencies').insert({
        org_id: ctx.orgId,
        project_id: input.projectId,
        system_id: d.systemId,
        depends_on_system_id: d.providerId,
        kind: d.kind,
        required_gate_id: def.requiredGateId,
        blocked_gate_id: def.blockedGateId,
        notes: d.notes?.slice(0, 1000) ?? null,
        source: 'ai',
      })
      const label = `${codeOf.get(d.systemId)} → ${codeOf.get(d.providerId)}`
      if (error?.code === '23505') continue
      if (error) result.errors.push(`${label}: ${error.message}`)
      else result.dependenciesCreated++
    }

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId, userId: ctx.userId, action: 'system.ai_applied', entityType: 'project', entityId: input.projectId,
      payload: { systems_updated: result.systemsUpdated, dependencies_created: result.dependenciesCreated, errors: result.errors.length },
    })
    revalidatePath(`/projects/${input.projectId}/systems`)
    revalidatePath('/projects/[id]/readiness', 'page')
    return result
  },
)
