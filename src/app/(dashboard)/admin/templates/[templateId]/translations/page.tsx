import { getActiveMembership } from '@/lib/supabase/membership'
import { redirect, notFound } from 'next/navigation'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { isAiConfigured } from '@/lib/ai/claude'
import { getTranslationReview } from '@/app/actions/itr-translations'
import TranslationsView from './TranslationsView'

export default async function TemplateTranslationsPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const ctx = await getActiveMembership()
  if (!ctx) redirect('/login')
  if (!EDITOR_ROLES.includes(ctx.role)) redirect(`/admin/templates/${templateId}`)

  const res = await getTranslationReview(templateId)
  if (res.error || !res.review) notFound()

  return <TranslationsView initial={res.review} aiEnabled={isAiConfigured()} />
}
