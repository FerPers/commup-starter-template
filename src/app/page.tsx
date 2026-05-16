import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { ClipboardCheck, AlertTriangle, FileCheck2, BarChart2, Wrench } from 'lucide-react'
import LandingNavbar from '@/components/landing/LandingNavbar'
import HeroSection from '@/components/landing/HeroSection'
import ProblemSection from '@/components/landing/ProblemSection'
import HowItWorks from '@/components/landing/HowItWorks'
import ModulesTabs from '@/components/landing/ModulesTabs'
import DifferentiatorsSection from '@/components/landing/DifferentiatorsSection'
import IndustriesSection from '@/components/landing/IndustriesSection'
import SocialProofSection from '@/components/landing/SocialProofSection'
import CtaSection from '@/components/landing/CtaSection'
import LandingFooter from '@/components/landing/LandingFooter'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  const t = await getTranslations('Landing')

  const tabs = [
    {
      key: 'itrs' as const,
      icon: <ClipboardCheck size={14} />,
      label: t('modules.tabs.itrs'),
      title: t('modules.itrs.title'),
      bullets: [t('modules.itrs.bullet1'), t('modules.itrs.bullet2'), t('modules.itrs.bullet3')],
    },
    {
      key: 'punches' as const,
      icon: <AlertTriangle size={14} />,
      label: t('modules.tabs.punches'),
      title: t('modules.punches.title'),
      bullets: [t('modules.punches.bullet1'), t('modules.punches.bullet2'), t('modules.punches.bullet3')],
    },
    {
      key: 'certs' as const,
      icon: <FileCheck2 size={14} />,
      label: t('modules.tabs.certs'),
      title: t('modules.certs.title'),
      bullets: [t('modules.certs.bullet1'), t('modules.certs.bullet2'), t('modules.certs.bullet3')],
    },
    {
      key: 'kpis' as const,
      icon: <BarChart2 size={14} />,
      label: t('modules.tabs.kpis'),
      title: t('modules.kpis.title'),
      bullets: [t('modules.kpis.bullet1'), t('modules.kpis.bullet2'), t('modules.kpis.bullet3')],
    },
    {
      key: 'preservation' as const,
      icon: <Wrench size={14} />,
      label: t('modules.tabs.preservation'),
      title: t('modules.preservation.title'),
      bullets: [t('modules.preservation.bullet1'), t('modules.preservation.bullet2'), t('modules.preservation.bullet3')],
    },
  ]

  return (
    <div style={{ background: '#080810', color: '#f1f5f9', minHeight: '100vh' }}>
      <LandingNavbar />
      <HeroSection />
      <ProblemSection />
      <HowItWorks />
      <ModulesTabs
        sectionTitle={t('modules.title')}
        sectionSubtitle={t('modules.subtitle')}
        tabs={tabs}
      />
      <DifferentiatorsSection />
      <IndustriesSection />
      <SocialProofSection />
      <CtaSection />
      <LandingFooter />
    </div>
  )
}
