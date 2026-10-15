import { redirect } from 'next/navigation'

// La tabla interlocks (1 causa → 1 efecto) se reemplazó por la matriz C&E (fase 4-D).
export default async function InterlocksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/projects/${id}/ce-matrices`)
}
