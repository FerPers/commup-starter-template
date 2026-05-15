import type { SupabaseClient } from '@supabase/supabase-js'

export type TagPhotoSource = 'itr' | 'punch' | 'preservation'

export interface ConsolidatedTagPhoto {
  id: string
  source: TagPhotoSource
  source_label: string
  source_href: string
  signed_url: string | null
  captured_at: string
  ext: string
}

interface Params {
  tagId: string
  projectId: string
  itrIds: Array<{ id: string; itr_number: string }>
  punchIds: Array<{ id: string; punch_number: string }>
  planIds: string[]
}

function extOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : ''
}

export async function fetchConsolidatedTagPhotos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  { tagId, projectId, itrIds, punchIds, planIds }: Params,
): Promise<ConsolidatedTagPhoto[]> {
  const itrIdList = itrIds.map(i => i.id)
  const itrNumberById = new Map(itrIds.map(i => [i.id, i.itr_number]))
  const punchIdList = punchIds.map(p => p.id)
  const punchNumberById = new Map(punchIds.map(p => [p.id, p.punch_number]))

  const [itrAttRes, punchAttRes, presRecRes] = await Promise.all([
    itrIdList.length > 0
      ? supabase
          .from('itr_attachments')
          .select('id, file_url, captured_at, itr_id')
          .in('itr_id', itrIdList)
          .order('captured_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; file_url: string; captured_at: string; itr_id: string }> }),
    punchIdList.length > 0
      ? supabase
          .from('punch_attachments')
          .select('id, file_url, created_at, punch_id')
          .in('punch_id', punchIdList)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; file_url: string; created_at: string; punch_id: string }> }),
    planIds.length > 0
      ? supabase
          .from('preservation_records')
          .select('id, plan_id')
          .in('plan_id', planIds)
      : Promise.resolve({ data: [] as Array<{ id: string; plan_id: string }> }),
  ])

  const itrRows = itrAttRes.data ?? []
  const punchRows = punchAttRes.data ?? []
  const recordRows = presRecRes.data ?? []
  const recordIds = recordRows.map(r => r.id)

  const { data: preservationRows = [] } = recordIds.length > 0
    ? await supabase
        .from('preservation_attachments')
        .select('id, file_url, captured_at, record_id')
        .in('record_id', recordIds)
        .order('captured_at', { ascending: false })
    : { data: [] as Array<{ id: string; file_url: string; captured_at: string; record_id: string }> }

  // Sign all URLs in parallel — one signed URL per attachment.
  const tagBase = `/projects/${projectId}/tags/${tagId}`

  const signedItr = await Promise.all(
    itrRows.map(async (row: { id: string; file_url: string; captured_at: string; itr_id: string }) => {
      const { data: signed } = await supabase.storage
        .from('itr-attachments')
        .createSignedUrl(row.file_url, 3600)
      return {
        id: row.id,
        source: 'itr' as const,
        source_label: itrNumberById.get(row.itr_id) ?? 'ITR',
        source_href: `${tagBase}/itrs/${row.itr_id}`,
        signed_url: signed?.signedUrl ?? null,
        captured_at: row.captured_at,
        ext: extOf(row.file_url),
      }
    })
  )

  const signedPunch = await Promise.all(
    punchRows.map(async (row: { id: string; file_url: string; created_at: string; punch_id: string }) => {
      const { data: signed } = await supabase.storage
        .from('punch-attachments')
        .createSignedUrl(row.file_url, 3600)
      return {
        id: row.id,
        source: 'punch' as const,
        source_label: punchNumberById.get(row.punch_id) ?? 'Punch',
        source_href: `${tagBase}`,
        signed_url: signed?.signedUrl ?? null,
        captured_at: row.created_at,
        ext: extOf(row.file_url),
      }
    })
  )

  const planIdByRecord = new Map(recordRows.map(r => [r.id, r.plan_id]))
  const signedPres = await Promise.all(
    (preservationRows as Array<{ id: string; file_url: string; captured_at: string; record_id: string }>).map(async row => {
      const { data: signed } = await supabase.storage
        .from('preservation-attachments')
        .createSignedUrl(row.file_url, 3600)
      const planId = planIdByRecord.get(row.record_id)
      return {
        id: row.id,
        source: 'preservation' as const,
        // Source label resolved in the UI via i18n (source === 'preservation' branch).
        source_label: '',
        source_href: planId ? `${tagBase}/preservation/${planId}` : tagBase,
        signed_url: signed?.signedUrl ?? null,
        captured_at: row.captured_at,
        ext: extOf(row.file_url),
      }
    })
  )

  return [...signedItr, ...signedPunch, ...signedPres].sort(
    (a, b) => (a.captured_at < b.captured_at ? 1 : -1),
  )
}
