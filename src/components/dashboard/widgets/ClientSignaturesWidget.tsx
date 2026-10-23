import Link from 'next/link'
import { FileSignature } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { isMyTurnToSign } from '@/lib/my-work/queues'
import { Card } from '@/components/ui'
import { alpha, ink } from '@/lib/theme'
import { fetchAllRowsFlagged } from '@/lib/list/fetch-all'

export default async function ClientSignaturesWidget({ userId }: { userId: string }) {
  const supabase = await createClient()
  const t = await getTranslations('Dashboard')

  // S09 (B-07): sin los aprobados, paginado
  const { rows: clientAssignments } = await fetchAllRowsFlagged(() => supabase
    .from('itr_assignments')
    .select(`id, itrs!inner(id, itr_number, status, project_id, tags(id, tag_number, description), projects(id, name, code), project_phases(code, color, name), itr_signatures(role, user_id), required_signatures)`)
    .eq('user_id', userId)
    .eq('role', 'client')
    .neq('itrs.status', 'approved'), { maxRows: 10_000 })


  const pendingSignature = (clientAssignments ?? []).filter(a => {
    const itr = a.itrs
    // S04: le toca al cliente cuando el ITR lo exige y están las firmas requeridas anteriores (misma regla que Mi trabajo).
    return !!itr && isMyTurnToSign('client', itr.status, itr.itr_signatures.map(s => s.role), itr.required_signatures, itr.itr_signatures.some(s => s.user_id === userId))
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
            <Link key={itr.id} href={`/projects/${itr.project_id}/tags/${itr.tags?.id}/itrs/${itr.id}`} style={{ display: 'block', textDecoration: 'none' }}>
              <div style={{ padding: '12px 14px', background: 'var(--warning-50)', border: '1px solid var(--warning-200)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
                {phase && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: alpha(phase.color, 9), color: ink(phase.color), whiteSpace: 'nowrap' }}>{phase.code}</span>}
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{itr.itr_number}</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', flex: '1 1 180px', minWidth: 0 }}>{itr.tags?.tag_number} — {itr.tags?.description}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--primary-700)', fontWeight: 600 }}>{itr.projects?.code}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning-700)', fontWeight: 600 }}>{t('clientView.sign')}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}
