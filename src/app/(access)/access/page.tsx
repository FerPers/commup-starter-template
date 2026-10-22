import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getActiveMembership, listInactiveMemberships } from '@/lib/supabase/membership'
import AccessView from './AccessView'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('Access'))('title') }
}

// S15 (I-21): invitaciones por aceptar y membresías suspendidas o vencidas de quien inició sesión.
export default async function AccessPage() {
  const [inactive, active, t] = await Promise.all([listInactiveMemberships(), getActiveMembership(), getTranslations('Access')])
  return (
    <AccessView
      items={inactive}
      hasActive={!!active}
      title={t('title')}
    />
  )
}
