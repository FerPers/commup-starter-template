import { FileSignature } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui'

export default async function ClientSignaturesWidget({ userId }: { userId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  const { data: clientAssignments } = await supabase
    .from('itr_assignments')
    .select(`id, itrs(id, itr_number, status, project_id, tags(id, tag_number, description), projects(id, name, code), project_phases(code, color, name), itr_signatures(role))`)
    .eq('user_id', userId)
    .eq('role', 'client')


  const pendingSignature = (clientAssignments ?? []).filter(a => {
    const itr = a.itrs
    return itr && itr.status === 'completed' && !itr.itr_signatures.some(s => s.role === 'client')
  })

  if (pendingSignature.length === 0) return null

  return (
    <Card padding="md" style={{ borderLeft: '3px solid var(--warning-500)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <FileSignature size={20} color="var(--warning-700)" aria-hidden="true" />
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-strong)' }}>{t('clientView.signaturesTitle')}</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{t('clientView.signaturesDesc', { count: pendingSignature.length })}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pendingSignature.map(a => {
          const itr = a.itrs
          if (!itr) return null
          const phase = itr.project_phases
          return (
            <a key={itr.id} href={`/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`} style={{ display: 'block', textDecoration: 'none' }}>
              <div style={{ padding: '12px 14px', background: 'var(--warning-50)', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 12 }}>
                {phase && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: `${phase.color}18`, color: phase.color, whiteSpace: 'nowrap' }}>{phase.code}</span>}
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{itr.itr_number}</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', flex: 1 }}>{itr.tags?.tag_number} — {itr.tags?.description}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--primary-500)', fontWeight: 600 }}>{itr.projects?.code}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning-500)', fontWeight: 600 }}>{t('clientView.sign')}</span>
              </div>
            </a>
          )
        })}
      </div>
    </Card>
  )
}
