import { redirect } from 'next/navigation'

// N2c: el Digital Twin es el modo Tarjetas de «Tags y equipos» (decisión de Luis 2026-10-21, «Maquetas N2»).
export default async function TwinRedirect({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tag?: string; system?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const qs = new URLSearchParams({ view: 'cards', ...(sp.tag ? { tag: sp.tag } : {}), ...(sp.system ? { system: sp.system } : {}) })
  redirect(`/projects/${id}/tags?${qs.toString()}`)
}
