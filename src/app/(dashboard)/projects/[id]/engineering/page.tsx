import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { denyAccess } from '@/lib/auth/denied'
import { ROLE_TIERS } from '@/lib/constants/roles'
import { getActiveMembership } from '@/lib/supabase/membership'

// Carga de ingeniería (decisión de Luis, 2026-10-29): la entrada «Importar» de Configuración del proyecto abría lo
// mismo que el botón de Tags. Ahora reúne todos los importadores en el orden que se probó con CPF Orotoy, cada uno con
// lo que ya hay cargado y lo que queda por resolver. Los botones de cada módulo (Tags, Señales, C&E, Proveedores)
// siguen siendo el atajo cuando ya estás ahí. Mismo nivel que los importadores: Propietario, Administrador, Arquitecto.

type Step = { key: string; href: string | null; status: string; done: boolean }

export default async function EngineeringLoadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (!ROLE_TIERS.privileged.includes(ctx.role)) denyAccess('privileged')
  const supabase = ctx.supabase
  const t = await getTranslations('EngineeringLoad')

  const { data: project } = await supabase.from('projects').select('id, code, name').eq('id', id).eq('org_id', ctx.orgId).maybeSingle()
  if (!project) notFound()
  // bounded: disciplinas de la org (decenas)
  const { data: disciplines } = await supabase.from('disciplines').select('id, code').eq('org_id', ctx.orgId).limit(200)

  const tagCount = () => supabase.from('tags').select('id', { count: 'exact', head: true }).eq('project_id', id)
  const byDiscipline = await Promise.all((disciplines ?? []).map(async d => {
    const { count } = await tagCount().eq('discipline_id', d.id)
    return [d.code.toUpperCase(), count ?? 0] as const
  }))
  const disc = new Map(byDiscipline)
  const [total, safety, untyped, general, signals, vendors, matrices, pids] = await Promise.all([
    tagCount(),
    tagCount().eq('criticality', 'safety'),
    tagCount().is('equipment_type_id', null),
    supabase.from('tags').select('id, subsystems!inner(systems!inner(code))', { count: 'exact', head: true })
      .eq('project_id', id).eq('subsystems.systems.code', 'GEN-SYS'),
    supabase.from('signals').select('id, tags!inner(project_id)', { count: 'exact', head: true }).eq('tags.project_id', id),
    supabase.from('vendor_packages').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('ce_matrices').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('project_id', id).eq('doc_type', 'pid'),
  ]).then(rs => rs.map(r => r.count ?? 0))

  const p = `/projects/${id}`
  const n = (code: string) => disc.get(code) ?? 0
  const steps: Step[] = [
    { key: 'instruments', href: `${p}/import?discipline=INST`, status: t('status.tags', { n: n('INST') }), done: n('INST') > 0 },
    { key: 'fg', href: `${p}/import?discipline=INST`, status: t('status.safety', { n: safety }), done: safety > 0 },
    { key: 'signals', href: `${p}/import-signals`, status: t('status.signals', { n: signals }), done: signals > 0 },
    { key: 'equipment', href: `${p}/import?discipline=MECH`, status: t('status.equipment', { mech: n('MECH'), elec: n('ELEC') }), done: n('MECH') + n('ELEC') > 0 },
    { key: 'vendors', href: `${p}/vendors/import`, status: t('status.vendors', { n: vendors }), done: vendors > 0 },
    { key: 'ce', href: `${p}/ce-matrices/import`, status: t('status.ce', { n: matrices }), done: matrices > 0 },
    { key: 'pid', href: `${p}/documents?type=pid`, status: t('status.pid', { n: pids }), done: pids > 0 },
    { key: 'pending', href: null, status: t('status.noImporter'), done: false },
  ]
  const issues = [
    general > 0 && { text: t('issues.general', { n: general }), href: `${p}/tags?view=tree` },
    untyped > 0 && { text: t('issues.untyped', { n: untyped }), href: `${p}/itrs/requirements/untyped` },
  ].filter((x): x is { text: string; href: string } => !!x)

  const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12 }
  return (
    <div style={{ padding: 32, maxWidth: 1000, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>{t('title')}</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0', maxWidth: 760 }}>{t('subtitle', { code: project.code, total })}</p>
      </div>

      {issues.length > 0 && (
        <div style={{ ...card, padding: '12px 16px', background: 'var(--warning-50)', borderColor: 'var(--warning-200)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--warning-800)' }}>{t('issues.title')}</p>
          {issues.map(i => (
            <p key={i.href} style={{ margin: '2px 0', fontSize: 13, color: 'var(--warning-800)' }}>
              ⚠ {i.text} · <Link href={i.href} style={{ color: 'var(--warning-800)', fontWeight: 600 }}>{t('issues.open')}</Link>
            </p>
          ))}
        </div>
      )}

      <ol style={{ ...card, listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map((s, i) => (
          <li key={s.key} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 16px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
            <span aria-hidden="true" style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
              background: s.done ? 'var(--success-50)' : 'var(--gray-100)', color: s.done ? 'var(--success-700)' : 'var(--text-muted)',
              border: `1px solid ${s.done ? 'var(--success-200)' : 'var(--border)'}`,
            }}>{s.done ? '✓' : i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{t(`step.${s.key}.title`)}</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{t(`step.${s.key}.hint`)}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: s.done ? 'var(--success-700)' : 'var(--text-muted)', fontWeight: 500 }}>
                <span className="sr-only">{s.done ? t('done') : t('notYet')}: </span>{s.status}
              </p>
            </div>
            {s.href && (
              <Link href={s.href} style={{
                flexShrink: 0, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
                background: s.done ? 'var(--card-bg)' : 'var(--primary-600)', color: s.done ? 'var(--primary-700)' : '#fff',
                border: s.done ? '1px solid var(--primary-200)' : '1px solid transparent',
              }}>{t(s.done ? 'importMore' : 'import')}</Link>
            )}
          </li>
        ))}
      </ol>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{t('footer')}</p>
    </div>
  )
}
