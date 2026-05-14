import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui'

export default async function ClientProjectsWidget({ orgId }: { orgId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, code, status')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  const items = projects ?? []

  return (
    <>
      <Card padding="md">
        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)', marginBottom: 16 }}>{t('clientView.projectsTitle')}</h3>
        {items.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', textAlign: 'center', padding: '24px 0' }}>{t('clientView.noProjects')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(p => (
              <div key={p.id} style={{ padding: '14px 16px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--primary-50)', border: '1px solid var(--primary-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--primary-700)' }}>{p.code}</div>
                  <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-strong)' }}>{p.name}</span>
                </div>
                <a href={`/projects/${p.id}`} style={{ fontSize: 'var(--text-sm)', color: 'var(--primary-700)', textDecoration: 'none', fontWeight: 500 }}>{t('clientView.viewDetail')}</a>
              </div>
            ))}
          </div>
        )}
      </Card>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', marginTop: 16, textAlign: 'center' }}>
        {t.rich('clientView.viewItrs', {
          link: (chunks) => <a href="/itrs" style={{ color: 'var(--primary-500)', textDecoration: 'none' }}>{chunks}</a>
        })}
      </p>
    </>
  )
}
