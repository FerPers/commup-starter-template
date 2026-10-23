import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getActiveMembership } from '@/lib/supabase/membership'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { catalogPrompt, estimateAdjustUsd, type AiSignaturePage } from '@/lib/itr/ai-adjust'
import { loadAdjustCandidates } from '@/lib/itr/ai-adjust-server'
import AiAdjustView from './AiAdjustView'

// R4 (plan referente; decisiones de Luis 2026-10-23): «Ajustes con IA». La base de requisitos de cada firma sale de la
// matriz aceptada de su tipo; Opus propone agregar o excluir códigos por firma y una persona decide. Solo firmas de
// tipos con reglas aceptadas. Correr = Propietario, Administrador o Arquitecto; decidir = Líder en adelante.
const PAGE_SIZE = 25
const FILTERS = ['open', 'pending', 'all'] as const
type Filter = (typeof FILTERS)[number]

export default async function AiAdjustPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ filter?: string; page?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  const supabase = ctx.supabase

  const { data: project } = await supabase.from('projects').select('id, code').eq('id', id).eq('org_id', ctx.orgId).single()
  if (!project) notFound()

  // Sin filtro en la URL: lo que hay por decidir si existe; si no, todo.
  const head = await supabase.rpc('tag_ai_signatures', { p_project_id: id, p_status: 'open', p_limit: 0, p_offset: 0 })
  if (head.error) throw new Error(head.error.message)
  const openCount = (head.data as unknown as AiSignaturePage).filtered
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.filter ?? '') ? (sp.filter as Filter) : openCount > 0 ? 'open' : 'all'
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)

  const [res, candidates, t] = await Promise.all([
    supabase.rpc('tag_ai_signatures', { p_project_id: id, p_status: filter, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE }),
    loadAdjustCandidates(supabase, ctx.orgId, id),
    getTranslations('ItrAiAdjust'),
  ])
  if (res.error) throw new Error(res.error.message)
  const data = res.data as unknown as AiSignaturePage
  const toReview = data.pending + data.stale
  const canRun = ROLE_TIERS.privileged.includes(ctx.role)
  const pages = Math.max(1, Math.ceil(data.filtered / PAGE_SIZE))
  const base = `/projects/${id}/itrs/requirements/ai`
  const href = (f: Filter, p = 1) => `${base}?filter=${f}${p > 1 ? `&page=${p}` : ''}`

  return (
    <div style={{ padding: 'clamp(12px, 4vw, 32px)', maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <Link href={`/projects/${id}/itrs/requirements`} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textDecoration: 'none' }}>← {t('back')}</Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: '6px 0 0' }}>{t('title')}</h1>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', maxWidth: 900 }}>{t('subtitle')}</p>
      </div>

      {data.no_rules.groups > 0 && (
        <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--warning-50)', border: '1px solid var(--warning-200)', color: 'var(--warning-900)', fontSize: 'var(--text-sm)' }}>
          <span>{t('noRules', { groups: data.no_rules.groups, tags: data.no_rules.tags })}</span>
          {canRun && <Link href="/admin/templates/matrix" style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--warning-900)' }}>{t('reviewMatrix')}</Link>}
        </div>
      )}

      <AiAdjustView
        projectId={id}
        page={data}
        toReview={toReview}
        estimateUsd={estimateAdjustUsd(toReview, catalogPrompt(candidates).length)}
        canRun={canRun}
        canDecide={ROLE_TIERS.editor.includes(ctx.role)}
        filters={FILTERS.map(f => ({ key: f, href: href(f), active: f === filter, count: f === 'open' ? openCount : f === 'pending' ? toReview : data.groups_total }))}
        pager={{ page, pages, prev: page > 1 ? href(filter, page - 1) : null, next: page < pages ? href(filter, page + 1) : null }}
      />
    </div>
  )
}
