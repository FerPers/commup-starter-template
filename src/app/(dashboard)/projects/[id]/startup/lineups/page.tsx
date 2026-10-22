import StartupLibraryPage from '../StartupLibraryPage'

// H-18: pestaña Line-ups del hub Arranque, con ruta propia.
export default async function StartupLineupsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <StartupLibraryPage projectId={id} tab="lineups" />
}
