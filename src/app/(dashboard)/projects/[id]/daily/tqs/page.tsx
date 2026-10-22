import DailyTabPage from '../DailyTabPage'

// H-18: pestaña con ruta propia del hub Gestión diaria.
export default async function DailyTqsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DailyTabPage projectId={id} tab="tqs" />
}
