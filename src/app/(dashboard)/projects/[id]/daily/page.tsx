import { redirect } from 'next/navigation'
import { DAILY_TABS, dailyTabHref, legacyTab } from '@/lib/navigation/hub-routes'
import DailyTabPage from './DailyTabPage'

// Gestión diaria: la pestaña Acciones es la raíz del hub (H-18). `?tab=` viejo → su ruta.
export default async function DailyPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams])
  const moved = legacyTab(DAILY_TABS, tab)
  if (moved) redirect(dailyTabHref(id, moved))
  return <DailyTabPage projectId={id} tab="actions" />
}
