import { getActiveMembership } from '@/lib/supabase/membership'
import { notFound, redirect } from 'next/navigation'

// Destino del QR de una etiqueta de registro (§8.9): resuelve el proyecto del registro y lleva
// a su detalle. La RLS de register_items limita a proyectos del usuario; el detalle exige la org activa.
export default async function RegisterQrRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')

  const { data: item } = await ctx.supabase.from('register_items').select('id, project_id').eq('id', id).maybeSingle()
  if (!item) notFound()
  redirect(`/projects/${item.project_id}/registers/${item.id}`)
}
