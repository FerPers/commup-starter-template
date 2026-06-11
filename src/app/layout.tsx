import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'

export const metadata: Metadata = {
  metadataBase: new URL('https://commup.app'),
  title: {
    default: 'CommUp — Commissioning & Completions Management Software',
    template: '%s · CommUp',
  },
  description: 'Cloud platform for industrial completion & commissioning management: digital ITRs, punch lists, MC/RFC/RFSU certificates, preservation and real-time KPIs. Built for Oil & Gas, LNG, renewables, mining and industrial plants.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CommUp',
  },
  openGraph: {
    type: 'website',
    url: 'https://commup.app',
    siteName: 'CommUp',
    title: 'CommUp — Commissioning & Completions Management Software',
    description: 'Digital ITRs, punch lists, certificates, preservation and real-time KPIs for industrial commissioning projects.',
    images: [{ url: '/images/og-image.jpg', width: 1200, height: 630, alt: 'CommUp — industrial commissioning platform' }],
    locale: 'es_ES',
    alternateLocale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CommUp — Commissioning & Completions Management Software',
    description: 'Digital ITRs, punch lists, certificates, preservation and real-time KPIs for industrial commissioning projects.',
    images: ['/images/og-image.jpg'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0B1D3A',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value === 'dark' ? 'dark' : 'light'

  return (
    <html lang={locale} data-theme={theme} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}