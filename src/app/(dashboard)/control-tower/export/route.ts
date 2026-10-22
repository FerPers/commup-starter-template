import { NextResponse } from 'next/server'

// N2a: el Excel de Readiness vive en /projects/[id]/readiness/export; los enlaces viejos redirigen con sus filtros.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  if (!projectId) return NextResponse.redirect(new URL('/control-tower', url))
  url.searchParams.delete('projectId')
  const qs = url.searchParams.toString()
  return NextResponse.redirect(new URL(`/projects/${encodeURIComponent(projectId)}/readiness/export${qs ? `?${qs}` : ''}`, url))
}
