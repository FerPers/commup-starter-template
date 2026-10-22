import { redirect } from 'next/navigation'

// N2d: un P&ID es un documento del registro (tipo «pid»); la lista de P&ID es Documentos filtrado por ese tipo.
export default async function PidDocumentsRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/projects/${id}/documents?type=pid`)
}
