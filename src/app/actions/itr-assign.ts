'use server'

import { EDITOR_ROLES } from '@/lib/auth/permissions'
import { withAuth, withAuthOnly } from '@/lib/auth/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyItrAssignmentChanged, type ItrAssignmentChange } from '@/lib/notifications/itr-assignment'
import { assignmentDbError, isSigningRole, type SigningRole } from '@/lib/itr/signatures'
import type { ActiveContext } from '@/lib/supabase/membership'
import { revalidatePath } from 'next/cache'

type ItrMeta = { itr_number: string; project_id: string; tag_id: string | null }

/** Diff de asignaciones para avisar a quien entra y a quien sale de un rol. */
function assignmentChanges(
  ids: string[],
  role: SigningRole,
  userId: string,
  prevByItr: Map<string, string>,
  itrMeta: Map<string, ItrMeta>,
): ItrAssignmentChange[] {
  const changes: ItrAssignmentChange[] = []
  for (const itrId of ids) {
    const meta = itrMeta.get(itrId)
    if (!meta) continue
    const prevUser = prevByItr.get(itrId) ?? null
    if (prevUser === userId) continue
    const base = { itrId, itrNumber: meta.itr_number, projectId: meta.project_id, tagId: meta.tag_id, role }
    if (prevUser) changes.push({ ...base, recipientUserId: prevUser, changeType: 'removed' })
    changes.push({ ...base, recipientUserId: userId, changeType: 'added' })
  }
  return changes
}

async function snapshot(ctx: ActiveContext, ids: string[], role: SigningRole) {
  const [{ data: prevAssigns }, { data: itrRows }] = await Promise.all([
    ctx.supabase.from('itr_assignments').select('itr_id, user_id').in('itr_id', ids).eq('role', role),
    ctx.supabase.from('itrs').select('id, itr_number, project_id, tag_id, required_signatures').in('id', ids),
  ])
  const prevByItr = new Map<string, string>()
  for (const r of prevAssigns ?? []) if (r.itr_id && r.user_id) prevByItr.set(r.itr_id, r.user_id)
  const itrMeta = new Map((itrRows ?? []).map(r => [r.id, { itr_number: r.itr_number, project_id: r.project_id, tag_id: r.tag_id }]))
  return { prevByItr, itrMeta, rows: itrRows ?? [] }
}

/**
 * Asignación masiva de un rol. I-24 (S04): un solo UPSERT por (itr_id, role) en lugar de borrar e
 * insertar sin transacción — si falla, nadie queda sin asignar. La BD (guard_itr_content) rechaza el
 * lote entero si un ITR no exige ese rol, si el rol ya firmó o si la persona ya tiene otro rol (D6).
 */
export const bulkAssignItrs = withAuthOnly(
  { role: EDITOR_ROLES },
  async (
    ctx,
    ids: string[],
    userId: string,
    role: 'executor' | 'supervisor' | 'client',
  ): Promise<{ error?: string }> => {
    if (!ids.length) return {}
    if (!isSigningRole(role)) return { error: 'Rol de firma inválido' }

    const { prevByItr, itrMeta, rows } = await snapshot(ctx, ids, role)
    const notRequired = rows.filter(r => !r.required_signatures.includes(role)).map(r => r.itr_number)
    if (notRequired.length) return { error: `Estos ITR no exigen ese rol de firma: ${notRequired.slice(0, 5).join(', ')}${notRequired.length > 5 ? '…' : ''}` }

    const { error } = await ctx.supabase
      .from('itr_assignments')
      .upsert(ids.map(itr_id => ({ itr_id, user_id: userId, role })), { onConflict: 'itr_id,role' })
    if (error) return { error: assignmentDbError(error.message) }

    const changes = assignmentChanges(ids, role, userId, prevByItr, itrMeta)
    if (changes.length > 0) await notifyItrAssignmentChanged(createAdminClient(), ctx.orgId, ctx.userId, changes)

    revalidatePath('/itrs')
    return {}
  },
)

/**
 * C-01 (S04): completar o cambiar la persona de un rol de firma de un ITR mientras ese rol no haya
 * firmado (por ejemplo, asignar el supervisor después de que firmó el ejecutor).
 */
export const setItrAssignment = withAuth(
  { role: EDITOR_ROLES, guards: [{ resource: 'project', field: 'projectId' }] },
  async (
    ctx,
    input: { itrId: string; projectId: string; tagId: string | null; role: SigningRole; userId: string },
  ): Promise<{ error?: string }> => {
    if (!isSigningRole(input.role)) return { error: 'Rol de firma inválido' }
    const { prevByItr, itrMeta, rows } = await snapshot(ctx, [input.itrId], input.role)
    const itr = rows[0]
    if (!itr || itr.project_id !== input.projectId) return { error: 'ITR no encontrado' }
    if (!itr.required_signatures.includes(input.role)) return { error: 'Este ITR no exige ese rol de firma' }

    const { error } = await ctx.supabase
      .from('itr_assignments')
      .upsert({ itr_id: input.itrId, user_id: input.userId, role: input.role }, { onConflict: 'itr_id,role' })
    if (error) return { error: assignmentDbError(error.message) }

    const changes = assignmentChanges([input.itrId], input.role, input.userId, prevByItr, itrMeta)
    if (changes.length > 0) await notifyItrAssignmentChanged(createAdminClient(), ctx.orgId, ctx.userId, changes)

    if (input.tagId) revalidatePath(`/projects/${input.projectId}/tags/${input.tagId}/itrs/${input.itrId}`)
    revalidatePath(`/projects/${input.projectId}/itrs`)
    revalidatePath('/my-work')
    return {}
  },
)
