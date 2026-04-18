import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ScanView from './ScanView'

export const metadata = { title: 'Escanear Tag — CommUp' }

export default async function ScanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <ScanView />
}
