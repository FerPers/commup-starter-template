import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Script from 'next/script'
import { getTranslations } from 'next-intl/server'
import LandingNavbar from '@/components/landing/LandingNavbar'
import HeroSection from '@/components/landing/HeroSection'
import ProblemSection from '@/components/landing/ProblemSection'
import HowItWorks from '@/components/landing/HowItWorks'
import ModulesTabs from '@/components/landing/ModulesTabs'
import DifferentiatorsSection from '@/components/landing/DifferentiatorsSection'
import IndustriesSection from '@/components/landing/IndustriesSection'
import SocialProofSection from '@/components/landing/SocialProofSection'
import PricingSection from '@/components/landing/PricingSection'
import CtaSection from '@/components/landing/CtaSection'
import LandingFooter from '@/components/landing/LandingFooter'

export default async function RootPage() {
  // Check barato de sesión: solo presencia de la cookie de Supabase, sin llamada
  // de red a Auth por cada visita anónima. La validación real la hace el layout
  // del dashboard; una cookie stale solo provoca un rebote /dashboard → /login.
  const cookieStore = await cookies()
  const hasSession = cookieStore.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
  if (hasSession) redirect('/dashboard')

  const t = await getTranslations('Landing')

  const tabs = [
    {
      key: 'itrs' as const,
      iconSrc: '/icons/modules/04-itr.svg',
      label: t('modules.tabs.itrs'),
      title: t('modules.itrs.title'),
      bullets: [t('modules.itrs.bullet1'), t('modules.itrs.bullet2'), t('modules.itrs.bullet3')],
    },
    {
      key: 'punches' as const,
      iconSrc: '/icons/modules/05-punch-list.svg',
      label: t('modules.tabs.punches'),
      title: t('modules.punches.title'),
      bullets: [t('modules.punches.bullet1'), t('modules.punches.bullet2'), t('modules.punches.bullet3')],
    },
    {
      key: 'certs' as const,
      iconSrc: '/icons/modules/06-certificates.svg',
      label: t('modules.tabs.certs'),
      title: t('modules.certs.title'),
      bullets: [t('modules.certs.bullet1'), t('modules.certs.bullet2'), t('modules.certs.bullet3')],
    },
    {
      key: 'kpis' as const,
      iconSrc: '/icons/modules/08-kpis.svg',
      label: t('modules.tabs.kpis'),
      title: t('modules.kpis.title'),
      bullets: [t('modules.kpis.bullet1'), t('modules.kpis.bullet2'), t('modules.kpis.bullet3')],
    },
    {
      key: 'preservation' as const,
      iconSrc: '/icons/modules/07-preservation.svg',
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
      <PricingSection />
      <CtaSection />
      <LandingFooter />
      {/* JSON-LD para resultados enriquecidos (SoftwareApplication + Organization) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'SoftwareApplication',
                name: 'CommUp',
                applicationCategory: 'BusinessApplication',
                operatingSystem: 'Web',
                url: 'https://commup.app',
                description: 'Commissioning & completions management software: digital ITRs, punch lists, certificates, preservation and real-time KPIs for industrial projects.',
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Demo on request' },
              },
              {
                '@type': 'Organization',
                name: 'CommUp',
                url: 'https://commup.app',
                logo: 'https://commup.app/icons/icon-512x512.png',
                email: 'contacto@commup.app',
              },
            ],
          }),
        }}
      />
      {/* Cloudflare Web Analytics — cookieless; solo activo si el token está configurado */}
      {process.env.NEXT_PUBLIC_CF_BEACON_TOKEN && (
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon={JSON.stringify({ token: process.env.NEXT_PUBLIC_CF_BEACON_TOKEN })}
          strategy="afterInteractive"
        />
      )}
    </div>
  )
}
