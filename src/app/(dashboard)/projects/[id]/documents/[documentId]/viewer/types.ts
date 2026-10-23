import type { PidTagHit } from '@/app/actions/tag-search'

/** P1: el sistema trae su color estable del proyecto (`systems.color`). */
export type SystemRef = { id: string; code: string; name: string; color: string }

export type Discipline = { id: string; code: string; name: string; color: string }

export type Hotspot = {
  id: string; tag_id: string; page_num: number; x_pct: number; y_pct: number
  /** N2d: copiado de la revisión anterior; falta confirmar que quedó en su lugar. */
  needs_review: boolean
  tag: { id: string; tag_number: string; description: string; status: string }
  discipline: Discipline
  system: SystemRef | null
  open_punches_a: number
  open_punches_b: number
  itr_completion_pct: number
}

export type TagItem = PidTagHit

export type ColorBy = 'status' | 'system'
