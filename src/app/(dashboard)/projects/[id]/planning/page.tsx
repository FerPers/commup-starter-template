import { redirect } from 'next/navigation'

// N2c: el hub Planificación abre por el look-ahead.
export default async function PlanningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/projects/${id}/planning/lookahead`)
}
