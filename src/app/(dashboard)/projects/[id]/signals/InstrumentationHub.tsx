import { getTranslations } from 'next-intl/server'
import HubTabs from '@/components/navigation/HubTabs'

// N2c («Maquetas N2»): Señales, Lazos, Matrices C&E e Importar señales son un hub con pestañas por ruta y un solo
// ítem de menú («Señales y lazos»). Importar solo aparece a quien puede (arquitecto+, el guard de su página).
export type InstrumentationTab = 'signals' | 'loops' | 'ce' | 'import'

export default async function InstrumentationHub({ projectId, current, canImport }: { projectId: string; current: InstrumentationTab; canImport: boolean }) {
  const t = await getTranslations('SignalsHub')
  const base = `/projects/${projectId}`
  const tabs = [
    { key: 'signals', href: `${base}/signals`, label: t('tab.signals') },
    { key: 'loops', href: `${base}/loops`, label: t('tab.loops') },
    { key: 'ce', href: `${base}/ce-matrices`, label: t('tab.ce') },
    ...(canImport ? [{ key: 'import', href: `${base}/import-signals`, label: t('tab.import') }] : []),
  ]
  return <HubTabs title={t('title')} tabs={tabs} current={current} />
}
