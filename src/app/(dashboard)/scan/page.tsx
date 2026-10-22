import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import ScanView from './ScanView'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('Sidebar.nav'))('scan') }
}

export default async function ScanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <ScanView />
}
