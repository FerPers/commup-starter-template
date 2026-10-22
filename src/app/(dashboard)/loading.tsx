import { Skeleton, SkeletonStack } from '@/components/ui'

/** N0 (H-05): respuesta inmediata al navegar (en 4G las páginas con muchas consultas tardan). */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" style={{ padding: '24px 16px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Skeleton width={260} height={28} />
      <Skeleton width="60%" height={14} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {[0, 1, 2, 3].map(i => <Skeleton key={i} shape="block" height={84} />)}
      </div>
      <SkeletonStack rows={8} />
    </div>
  )
}
