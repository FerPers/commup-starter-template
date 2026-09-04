import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import type { OrgMemberRole } from '@/types/database'
import type { DashboardLayout, WidgetId } from '@/types/dashboard'
import { resolveLayout, WIDGET_REGISTRY, widgetsForRole } from '@/lib/dashboard/registry'
import { greetingName } from '@/lib/utils'
import DashboardCustomizer from '@/components/dashboard/DashboardCustomizer'
import DashboardStatusPill from '@/components/dashboard/DashboardStatusPill'
import InspectorSummaryWidget from '@/components/dashboard/widgets/InspectorSummaryWidget'
import MyItrsWidget from '@/components/dashboard/widgets/MyItrsWidget'
import MyPunchesWidget from '@/components/dashboard/widgets/MyPunchesWidget'
import ClientSummaryWidget from '@/components/dashboard/widgets/ClientSummaryWidget'
import ClientSignaturesWidget from '@/components/dashboard/widgets/ClientSignaturesWidget'
import ClientProjectsWidget from '@/components/dashboard/widgets/ClientProjectsWidget'
import CatAAlertsWidget from '@/components/dashboard/widgets/CatAAlertsWidget'
import KpiSummaryWidget from '@/components/dashboard/widgets/KpiSummaryWidget'
import ProjectsActiveWidget from '@/components/dashboard/widgets/ProjectsActiveWidget'
import DisciplinesWidget from '@/components/dashboard/widgets/DisciplinesWidget'

const RIBBON_COLORS: Record<WidgetId, string> = {
  inspector_summary: 'var(--primary-500)',
  my_itrs: 'var(--primary-500)',
  my_punches: 'var(--warning-500)',
  client_summary: 'var(--primary-500)',
  client_signatures: 'var(--accent-500)',
  client_projects: 'var(--primary-500)',
  cat_a_alerts: 'var(--danger-500)',
  kpi_summary: 'var(--primary-500)',
  projects_active: 'var(--success-500)',
  disciplines: 'var(--accent-500)',
}

function renderWidget(id: WidgetId, ctx: { userId: string; orgId: string; role: OrgMemberRole }) {
  switch (id) {
    case 'inspector_summary': return <InspectorSummaryWidget userId={ctx.userId} />
    case 'my_itrs': return <MyItrsWidget userId={ctx.userId} />
    case 'my_punches': return <MyPunchesWidget userId={ctx.userId} />
    case 'client_summary': return <ClientSummaryWidget userId={ctx.userId} orgId={ctx.orgId} />
    case 'client_signatures': return <ClientSignaturesWidget userId={ctx.userId} />
    case 'client_projects': return <ClientProjectsWidget orgId={ctx.orgId} />
    case 'cat_a_alerts': return <CatAAlertsWidget orgId={ctx.orgId} />
    case 'kpi_summary': return <KpiSummaryWidget orgId={ctx.orgId} />
    case 'projects_active': return <ProjectsActiveWidget orgId={ctx.orgId} role={ctx.role} />
    case 'disciplines': return <DisciplinesWidget orgId={ctx.orgId} />
  }
}

export default async function DashboardPage() {
  const auth = await getActiveMembership()
  if (!auth) redirect('/login')
  const supabase = auth.supabase

  const role = auth.role as OrgMemberRole
  const orgId = auth.orgId

  const [{ data: profile }, { data: org }, t, locale] = await Promise.all([
    supabase.from('profiles').select('full_name, dashboard_layout').eq('id', auth.userId).maybeSingle(),
    supabase.from('organizations').select('name').eq('id', orgId).maybeSingle(),
    getTranslations('Dashboard'),
    getLocale(),
  ])

  const stored = (profile?.dashboard_layout ?? null) as DashboardLayout | null
  const layout = resolveLayout(role, stored)

  type TKey = Parameters<typeof t>[0]
  const customizerOptions = widgetsForRole(role).map(w => ({
    id: w.id,
    title: t(w.titleKey as TKey),
    desc: t(w.descKey as TKey),
  }))

  const orderedKnown = layout.widgets.filter(w => WIDGET_REGISTRY[w.id])
  const visible = orderedKnown.filter(w => !w.hidden)

  const firstName = greetingName(profile?.full_name, auth.userEmail)
  const dateLocale = locale === 'en' ? 'en-US' : 'es-ES'
  const todayLabel = new Date().toLocaleDateString(dateLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const isCompact = role === 'inspector' || role === 'client'

  const ctx = { userId: auth.userId, orgId, role }

  return (
    <div style={{ padding: isCompact ? 28 : 32, maxWidth: isCompact ? 860 : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: isCompact ? 28 : 32, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: isCompact ? 'var(--text-xl)' : 26, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>
            {firstName ? t('hello', { name: firstName }) : t('title')}
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: isCompact ? 'var(--text-sm)' : 'var(--text-base)', textTransform: isCompact ? 'capitalize' : 'none', margin: '4px 0 0' }}>
            {isCompact ? `${todayLabel} · ${org?.name ?? ''}` : (org?.name ?? t('subtitle'))}
          </p>
          <div style={{ marginTop: 12 }}>
            <DashboardStatusPill />
          </div>
        </div>
        {customizerOptions.length > 0 && (
          <DashboardCustomizer layout={layout} options={customizerOptions} />
        )}
      </div>

      {visible.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--card-bg)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', margin: 0 }}>{t('customizer.allHidden')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {visible.map(w => (
            <div key={w.id} className="widget-card">
              <span className="widget-ribbon" style={{ background: RIBBON_COLORS[w.id] }} aria-hidden="true" />
              {renderWidget(w.id, ctx)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
