import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatInZone } from '@/lib/time/zone'
import { getActiveMembership } from '@/lib/supabase/membership'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { detectFree, learnedMap, signatureKey, type CatalogType, type LearnedPrefix, type TypeGroup } from '@/lib/tags/type-signature'
import { estimateClassifyUsd } from '@/lib/tags/type-ai'
import UntypedTagsView, { type UntypedGroup } from './UntypedTagsView'
import { fromJson } from '@/lib/supabase/casts'

// R3 (maquetas M, 2026-10-22): «Tags sin tipo». Los tags sin tipo de equipo no reciben ningún ITR; se agrupan por firma
// (prefijo + disciplina + descripción) y cada grupo trae su propuesta: gratis (código, prefijo aprendido, nombre del
// tipo) o de la IA barata. Se acepta por grupo con vista previa «gana X, quedan fuera Y». Lo ven todos; deciden
// Propietario, Administrador y Arquitecto.
export default async function UntypedTagsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code, timezone').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  const [groupsRes, { data: catalog }, { data: proposals }, t] = await Promise.all([
    supabase.rpc('tag_type_groups', { p_project_id: id }),
    // bounded: catálogo de tipos de una org (decenas a cientos)
    supabase.from('equipment_types').select('id, code, name, category').eq('org_id', ctx.orgId).order('code').limit(2000),
    // bounded: una propuesta abierta por firma (tope de grupos 500) más las rechazadas
    supabase.from('tag_type_proposals').select('id, prefix, discipline_id, desc_norm, outcome, equipment_type_id, new_type, confidence, reason, status, model, created_at')
      .eq('project_id', id).in('status', ['proposed', 'rejected']).order('created_at', { ascending: false }).limit(5000),
    getTranslations('TagTypes'),
  ])
  if (groupsRes.error) throw new Error(groupsRes.error.message)
  const data = fromJson<{ untyped: number; groups: TypeGroup[]; learned: LearnedPrefix[] }>(groupsRes.data)
  const cat = (catalog ?? []) as CatalogType[]
  const learned = learnedMap(data.learned)
  const open = new Map((proposals ?? []).filter(p => p.status === 'proposed').map(p => [signatureKey(p), p]))
  const rejected = new Set((proposals ?? []).filter(p => p.status === 'rejected').map(signatureKey))

  const groups: UntypedGroup[] = data.groups.map(g => {
    const key = signatureKey(g)
    const free = detectFree(g, cat, learned)
    if (free) return { ...g, key, proposal: { kind: 'type', typeId: free.typeId, source: free.source } }
    const p = open.get(key)
    if (!p) return { ...g, key, proposal: { kind: 'pending', rejected: rejected.has(key) } }
    const base = { proposalId: p.id, confidence: Number(p.confidence ?? 0), reason: p.reason ?? '' }
    if (p.outcome === 'type' && p.equipment_type_id) return { ...g, key, proposal: { kind: 'type', typeId: p.equipment_type_id, source: 'ai', ...base } }
    if (p.outcome === 'new_type' && p.new_type) {
      const nt = p.new_type as { code: string; name: string; category: string | null }
      return { ...g, key, proposal: { kind: 'new_type', newType: nt, ...base } }
    }
    return { ...g, key, proposal: { kind: 'none', ...base } }
  })
  const pendingAi = groups.filter(g => g.proposal.kind === 'pending').length
  const lastRun = (proposals ?? []).find(p => p.status === 'proposed')
  // Hora en la zona del proyecto y rotulada (formatearla en el navegador rompía la hidratación).
  const locale = await getLocale()

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <Link href={`/projects/${id}/itrs/requirements`} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textDecoration: 'none' }}>← {t('back')}</Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: '6px 0 0' }}>{t('title')}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('subtitle', { count: data.untyped })}</p>
        </div>
      </div>
      <UntypedTagsView
        projectId={id}
        groups={groups}
        catalog={cat}
        untyped={data.untyped}
        pendingAi={pendingAi}
        estimateUsd={estimateClassifyUsd(pendingAi, cat.length)}
        lastRun={lastRun ? { at: formatInZone(lastRun.created_at, project.timezone, locale), model: lastRun.model ?? '' } : null}
        canEdit={ROLE_TIERS.privileged.includes(ctx.role)}
      />
    </div>
  )
}
