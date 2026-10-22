import { redirect } from 'next/navigation'

// N2c: el look-ahead pasó a Planificación (Gestión diaria conserva el enlace); los enlaces viejos redirigen.
export default async function LegacyLookahead({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => !!v) as [string, string][]).toString()
  redirect(`/projects/${id}/planning/lookahead${qs ? `?${qs}` : ''}`)
}
