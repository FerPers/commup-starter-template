import { getTranslations } from 'next-intl/server'
import HubTabs from '@/components/navigation/HubTabs'

// N2c («Maquetas N2»): Planificación junta el look-ahead de gates (antes en Gestión diaria) y los planes de trabajo
// de ITR, con pestañas por ruta y un solo ítem de menú. E1 (maquetas M): + skyline de liberación.
export default async function PlanningHub({ projectId, current }: { projectId: string; current: 'lookahead' | 'skyline' | 'workPlans' }) {
  const t = await getTranslations('Planning')
  return (
    <HubTabs title={t('title')} current={current} tabs={[
      { key: 'lookahead', href: `/projects/${projectId}/planning/lookahead`, label: t('tab.lookahead') },
      { key: 'skyline', href: `/projects/${projectId}/planning/skyline`, label: t('tab.skyline') },
      { key: 'workPlans', href: `/projects/${projectId}/work-plans`, label: t('tab.workPlans') },
    ]} />
  )
}
