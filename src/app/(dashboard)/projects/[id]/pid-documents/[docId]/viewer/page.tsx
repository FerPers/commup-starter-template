import { redirect } from 'next/navigation'

// N2d: el visor vive en /projects/[id]/documents/[documentId]/viewer; los planos del modelo viejo ya no existen.
export default async function LegacyPidViewer({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id } = await params
  redirect(`/projects/${id}/documents?type=pid`)
}
