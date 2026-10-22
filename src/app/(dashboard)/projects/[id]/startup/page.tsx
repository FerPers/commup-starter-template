import { redirect } from 'next/navigation'
import { STARTUP_TABS, legacyTab, startupTabHref } from '@/lib/navigation/hub-routes'
import StartupLibraryPage from './StartupLibraryPage'

// Arranque: la pestaña Procedimientos es la raíz del hub (H-18). `?tab=` viejo → su ruta.
export default async function StartupPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams])
  const moved = legacyTab(STARTUP_TABS, tab)
  if (moved) redirect(startupTabHref(id, moved))
  return <StartupLibraryPage projectId={id} tab="procedures" />
}
