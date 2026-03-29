import SetupWizard from './SetupWizard'

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const { mode } = await searchParams
  return <SetupWizard isNewProject={mode === 'project'} />
}
