import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HandoverView from './HandoverView'

type Pkg = {
  id: string
  project_id: string
  version: string
  status: string
  generated_by: string | null
  generated_at: string
  json_path: string | null
  pdf_path: string | null
  signature_hash: string | null
  metadata: Record<string, unknown>
  error_message: string | null
  created_at: string
}

export default async function AdminHandoverPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) redirect('/setup')
  if (!['owner', 'admin', 'architect'].includes(membership.role)) redirect('/dashboard')

  const [{ data: projects }, { data: packages }, { data: systems }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code')
      .eq('org_id', membership.org_id)
      .order('name'),
    supabase
      .from('handover_packages')
      .select('id, project_id, version, status, generated_by, generated_at, json_path, pdf_path, signature_hash, metadata, error_message, created_at')
      .eq('org_id', membership.org_id)
      .order('generated_at', { ascending: false })
      .limit(100),
    supabase
      .from('systems')
      .select('id, project_id, code, name')
      .order('code'),
  ])

  return (
    <HandoverView
      projects={projects ?? []}
      systems={systems ?? []}
      packages={(packages ?? []) as Pkg[]}
    />
  )
}
