'use server'

import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuthOnly } from '@/lib/auth/withAuth'
import { logActivity } from '@/lib/log-activity'
import { punchDeleteBlocker } from '@/lib/punches/deletable'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import type { Enums } from '@/types/supabase.generated'

// D7 (S05): ya no hay cambio masivo de estado de ITR ni «aprobar seleccionados» (C-10/A-28): el estado sale
// del contenido y de las firmas. En su lugar: reasignar (itr-assign.ts), agregar a un plan (work-plans.ts) y
// reprogramar.
export const bulkRescheduleItrs = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, ids: string[], scheduledDate: string | null): Promise<{ updated?: number; error?: string }> => {
    if (!ids.length) return { updated: 0 }
    const t = await getTranslations('ActionErrors')
    if (scheduledDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return { error: t('bulk.invalidDate') }
    const { data, error } = await ctx.supabase.from('itrs').update({ scheduled_date: scheduledDate }).in('id', ids).select('id')
    if (error) return { error: error.message }
    revalidatePath('/itrs')
    return { updated: data?.length ?? 0 }
  },
)

export const bulkUpdatePunchStatus = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, ids: string[], status: Enums<'punch_status'>): Promise<{ error?: string }> => {
    if (!ids.length) return {}
    const t = await getTranslations('ActionErrors')
    // Fase 4: cerrar exige verificación en campo por otra persona, punch por punch.
    if (status === 'closed') return { error: t('bulk.closeOneByOne') }
    // S06 (C-11, D8): cancelar exige motivo y otra persona, punch por punch.
    if (status === 'cancelled') return { error: t('bulk.cancelOneByOne') }

    const { error } = await ctx.supabase
      .from('punches')
      .update({ status })
      .in('id', ids)

    if (error) return { error: error.message }
    revalidatePath('/punch-list')
    return {}
  },
)

export const bulkUpdateTagStatus = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, ids: string[], status: Enums<'tag_status'>): Promise<{ error?: string }> => {
    if (!ids.length) return {}

    const { error } = await ctx.supabase
      .from('tags')
      .update({ status })
      .in('id', ids)

    if (error) return { error: error.message }
    revalidatePath('/tags')
    return {}
  },
)

export const bulkDeletePunches = withAuthOnly(
  { role: EDITOR_ROLES },
  async (ctx, ids: string[]): Promise<{ deleted?: number; error?: string }> => {
    if (!ids.length) return { deleted: 0 }
    const t = await getTranslations('ActionErrors')

    const { data: found, error: fetchErr } = await ctx.supabase
      .from('punches')
      .select('id, punch_number, project_id, status, resolved_at, post_handover_status, preservation_record_id, punch_attachments(count)')
      .in('id', ids)

    if (fetchErr) return { deleted: 0, error: fetchErr.message }
    if (!found || found.length === 0) return { deleted: 0 }

    // C-27 (S08): solo los que son errores de carga (abiertos, sin evidencia ni vínculos); el resto se cancela.
    const blocked = found.filter(r => punchDeleteBlocker({ ...r, attachments: (r.punch_attachments as unknown as { count: number }[])[0]?.count ?? 0 }))
    if (blocked.length) {
      return { deleted: 0, error: t('bulk.deleteBlocked', { count: blocked.length, list: `${blocked.slice(0, 5).map(r => r.punch_number).join(', ')}${blocked.length > 5 ? '…' : ''}` }) }
    }
    const rows = found
    const deletableIds = rows.map(r => r.id)
    const { data: deleted, error } = await ctx.supabase
      .from('punches')
      .delete()
      .in('id', deletableIds)
      .select('id')

    if (error) return { deleted: 0, error: error.message }
    if ((deleted?.length ?? 0) !== deletableIds.length) return { deleted: deleted?.length ?? 0, error: t('bulk.deletePartial') }

    await logActivity(ctx.supabase, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      entityType: 'punch',
      action: 'bulk_deleted',
      payload: {
        count: deletableIds.length,
        punches: rows.map(r => ({ id: r.id, punch_number: r.punch_number, project_id: r.project_id })),
      },
    })

    const projectIds = new Set(rows.map(r => r.project_id).filter(Boolean) as string[])
    projectIds.forEach(pid => revalidatePath(`/projects/${pid}/punches`))
    revalidatePath('/punch-list')

    return { deleted: deletableIds.length }
  },
)
