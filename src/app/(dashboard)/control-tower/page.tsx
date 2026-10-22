import { redirect } from 'next/navigation'

// V1 (Portafolio unificado, decisión de Luis 2026-10-22): la tabla de liberación por proyecto vive en el Portafolio
// (/dashboard). Esta ruta solo redirige; los enlaces viejos con ?projectId= abren la Liberación de sistemas del
// proyecto con los mismos filtros.
export default async function LegacyControlTowerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  if (params.projectId) {
    const rest = new URLSearchParams(Object.entries(params).filter(([k, v]) => k !== 'projectId' && !!v) as [string, string][])
    const qs = rest.toString()
    redirect(`/projects/${encodeURIComponent(params.projectId)}/readiness${qs ? `?${qs}` : ''}`)
  }
  redirect('/dashboard')
}
