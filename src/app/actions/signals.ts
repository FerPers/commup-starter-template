'use server'

// S07 (F-16): corregir en la app la cadena del loop check de una señal (JB → marshalling → I/O → DCS → HMI),
// el rango y las alarmas, sin reimportar el índice. Supervisor+ (la RLS de signals ya exige editor);
// patch parcial y rastro en activity_log con el antes y el después.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth } from '@/lib/auth/withAuth'
import { logActivity } from '@/lib/log-activity'
import { SIGNAL_EDITABLE, type SignalEditable } from '@/lib/signals/editable'
import type { Json, TablesUpdate } from '@/types/supabase.generated'

export const updateSignalChain = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: { projectId: string; signalId: string; patch: Partial<Record<SignalEditable, string | number | null>> },
  ): Promise<{ error?: string }> => {
    const t = await getTranslations('ActionErrors')
    const patch: Record<string, string | number | null> = {}
    for (const key of SIGNAL_EDITABLE) {
      if (!(key in input.patch)) continue
      const raw = input.patch[key]
      if (key === 'range_min' || key === 'range_max') {
        if (raw === null || raw === '') { patch[key] = null; continue }
        const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'))
        if (!Number.isFinite(n)) return { error: t('signals.rangeNumeric') }
        patch[key] = n
      } else {
        const s = String(raw ?? '').trim()
        patch[key] = s.length ? s.slice(0, 200) : null
      }
    }
    if (!Object.keys(patch).length) return {}

    const { data: before, error: readErr } = await ctx.supabase
      .from('signals')
      .select(`id, signal_tag, ${SIGNAL_EDITABLE.join(', ')}, tags!inner(project_id)`)
      .eq('id', input.signalId)
      .eq('tags.project_id', input.projectId)
      .maybeSingle()
    if (readErr) return { error: readErr.message }
    if (!before) return { error: t('signals.notFound') }

    const { error } = await ctx.supabase.from('signals').update(patch as TablesUpdate<'signals'>).eq('id', input.signalId)
    if (error) return { error: error.message }

    // eslint-disable-next-line no-restricted-syntax -- G-18: select armado con SIGNAL_EDITABLE (supabase-js no lo puede tipar)
    const prev = before as unknown as Record<string, Json>
    const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => (prev[k] ?? null) !== v).map(([k, v]) => [k, { from: prev[k] ?? null, to: v }]))
    if (Object.keys(changed).length) {
      await logActivity(ctx.supabase, {
        orgId: ctx.orgId, userId: ctx.userId, entityType: 'signal', entityId: input.signalId, action: 'chain_edited',
        payload: { projectId: input.projectId, signalTag: prev.signal_tag, changes: changed },
      })
    }
    revalidatePath(`/projects/${input.projectId}/signals`)
    revalidatePath(`/projects/${input.projectId}/loops`)
    return {}
  },
)
