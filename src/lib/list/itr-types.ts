/** Fila plana de la lista de ITRs (vista itr_list_v + embeds de la página) */
export type ItrListRow = {
  id: string
  itr_number: string
  status: string
  progress_pct: number
  scheduled_date: string | null
  created_at: string
  project_id: string
  project_name: string
  project_code: string
  tag_id: string | null
  tag_number: string | null
  tag_description: string | null
  template_code: string | null
  template_title: string | null
  discipline_code: string | null
  discipline_name: string | null
  discipline_color: string | null
  phase_code: string | null
  phase_name: string | null
  phase_color: string | null
  assignments: Array<{ user_id: string; role: string; full_name: string | null }>
  signatures: Array<{ role: string; signed_at: string }>
}

export const ITR_SORT_KEYS = ['created_at', 'itr_number', 'tag_number', 'template_title', 'scheduled_date', 'progress_pct', 'status'] as const
export type ItrSortKey = typeof ITR_SORT_KEYS[number]

export type ItrListFilters = {
  status?: string
  phase?: string
  disc?: string
  q?: string
  project?: string
}

export type ItrStatusCounts = Record<string, number>
