import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OpsPunchesView from './OpsPunchesView'

type OpsPunch = {
  project_id: string
  punch_id: string
  punch_number: string
  description: string
  priority: string
  post_handover_status: string | null
  transferred_at: string | null
  transferred_to_user_id: string | null
  ops_target_date: string | null
  ops_notes: string | null
  target_date: string | null
  closed_date: string | null
  subsystem_id: string
  subsystem_code: string
  system_code: string
  system_name: string
  tag_id: string | null
  tag_number: string | null
  assigned_to_name: string | null
}

export default async function OpsPunchesPage({
  searchParams,
}: { searchParams: Promise<{ project_id?: string; status?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members').select('org_id, role').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/setup')

  const sp = await searchParams
  const projectId = sp.project_id ?? null
  const status    = sp.status ?? null

  const { data: projects } = await supabase
    .from('projects').select('id, name, code').eq('org_id', membership.org_id).order('name')

  // Punches Cat B abiertos SIN transferir todavía — candidatos a transferir
  let pendingTransfer: Array<{
    id: string; project_id: string; punch_number: string; description: string;
    priority: string; subsystem_id: string; tag_id: string | null
  }> = []
  if (projectId) {
    const { data } = await supabase
      .from('punches')
      .select('id, project_id, punch_number, description, priority, subsystem_id, tag_id')
      .eq('project_id', projectId)
      .eq('category', 'B')
      .in('status', ['open', 'in_progress'])
      .is('post_handover_status', null)
      .order('punch_number')
      .limit(200)
    pendingTransfer = data ?? []
  }

  // Dashboard ops (ya transferidos)
  let ops: OpsPunch[] = []
  if (projectId) {
    let q = supabase.from('ops_dashboard').select('*').eq('project_id', projectId)
    if (status) q = q.eq('post_handover_status', status)
    const { data } = await q.order('transferred_at', { ascending: false }).limit(300)
    ops = (data ?? []) as OpsPunch[]
  }

  // Team members para asignar (profiles del org)
  const { data: team } = await supabase
    .from('profiles')
    .select('id, full_name')
    .order('full_name')
    .limit(200)

  return (
    <OpsPunchesView
      projects={projects ?? []}
      selectedProjectId={projectId}
      selectedStatus={status}
      pendingTransfer={pendingTransfer}
      opsPunches={ops}
      team={team ?? []}
    />
  )
}
