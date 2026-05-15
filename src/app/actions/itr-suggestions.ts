'use server'

import { revalidatePath } from 'next/cache'
import { getActiveMembership as getCtx } from '@/lib/supabase/membership'

export async function acceptItrSuggestionAction(
  suggestionId: string,
  note?: string,
): Promise<{ error?: string; itrId?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Not authenticated' }

  const { data, error } = await ctx.supabase.rpc('accept_itr_suggestion', {
    p_suggestion_id: suggestionId,
    p_note:          note ?? null,
  })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { itrId: data as string }
}

export async function rejectItrSuggestionAction(
  suggestionId: string,
  note?: string,
): Promise<{ error?: string }> {
  const ctx = await getCtx()
  if (!ctx) return { error: 'Not authenticated' }

  const { error } = await ctx.supabase.rpc('reject_itr_suggestion', {
    p_suggestion_id: suggestionId,
    p_note:          note ?? null,
  })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return {}
}
