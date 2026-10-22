import { redirect } from 'next/navigation'

// N2c: el Explorador es el modo Árbol de «Tags y equipos» (decisión de Luis 2026-10-21, «Maquetas N2»).
export default async function ExplorerRedirect({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ subsystem?: string }>
}) {
  const [{ id }, { subsystem }] = await Promise.all([params, searchParams])
  // Un subsistema (enlace viejo de Calidad de datos) abre directamente sus tags en la lista.
  redirect(subsystem ? `/projects/${id}/tags?subsystem=${encodeURIComponent(subsystem)}` : `/projects/${id}/tags?view=tree`)
}
