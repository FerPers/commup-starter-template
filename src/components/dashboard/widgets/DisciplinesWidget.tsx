import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui'

export default async function DisciplinesWidget({ orgId }: { orgId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const { data: disciplines } = await supabase
    .from('disciplines')
    .select('id, name, code, color')
    .eq('org_id', orgId)

  const items = disciplines ?? []
  if (items.length === 0) return null

  return (
    <Card padding="md">
      <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-strong)', marginBottom: 16 }}>{t('disciplines')}</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map(d => (
          <span key={d.id} style={{ padding: '4px 12px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-sm)', fontWeight: 500, background: `${d.color}18`, color: d.color, border: `1px solid ${d.color}40` }}>
            {d.code} — {d.name}
          </span>
        ))}
      </div>
    </Card>
  )
}
