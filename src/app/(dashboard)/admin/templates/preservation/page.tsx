import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PreservationProceduresView from './PreservationProceduresView'

export default async function PreservationProceduresPage() {
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

  const canEdit = ['owner', 'admin', 'architect', 'leader'].includes(membership.role)

  const [{ data: procedures }, { data: disciplines }] = await Promise.all([
    supabase
      .from('preservation_procedures')
      .select(`
        id, code, title, description, frequency, interval_days,
        requires_photo, requires_signature,
        disciplines(id, code, name, color),
        preservation_procedure_items(id)
      `)
      .eq('org_id', membership.org_id)
      .order('code'),
    supabase
      .from('disciplines')
      .select('id, code, name, color')
      .eq('org_id', membership.org_id)
      .order('code'),
  ])

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>
          Procedimientos de Preservación
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Check sheets de preservación — define frecuencias, ítems de verificación y criterios de medición
        </p>
      </div>

      <PreservationProceduresView
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        procedures={(procedures ?? []) as any[]}
        disciplines={disciplines ?? []}
        canEdit={canEdit}
      />
    </div>
  )
}
