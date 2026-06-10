'use server'

import { revalidatePath } from 'next/cache'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'

// Antes no exigían rol — política 2026-05-24: aceptar/rechazar sugerencias AI
// crea/descarta ITRs → EDITOR. Los RPCs DEFINER verifican is_project_member.

export const acceptItrSuggestionAction = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    suggestionId: string,
    note?: string,
  ): Promise<{ error?: string; itrId?: string }> => {

  const { data, error } = await ctx.supabase.rpc('accept_itr_suggestion', {
    p_suggestion_id: suggestionId,
    p_note:          note ?? undefined,
  })
  if (error) return { error: error.message }

    revalidatePath('/', 'layout')
    return { itrId: data as string }
  },
)

export const rejectItrSuggestionAction = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    suggestionId: string,
    note?: string,
  ): Promise<{ error?: string }> => {

  const { error } = await ctx.supabase.rpc('reject_itr_suggestion', {
    p_suggestion_id: suggestionId,
    p_note:          note ?? undefined,
  })
  if (error) return { error: error.message }

    revalidatePath('/', 'layout')
    return {}
  },
)
