// C-16 (D9): forma de lo que devuelve `tag_subsystem_move_preview` (SQL, canónico en
// supabase/functions-sql/). La BD decide qué se mueve y qué bloquea; aquí solo se tipa para la UI.

export type TagMoveSide = {
  subsystem_id: string
  subsystem_code: string
  system_id: string
  system_code: string
  boundary_frozen: boolean
}

export type TagMovePreview = {
  tag_id: string
  tag_number: string
  project_id: string
  from: TagMoveSide
  to: TagMoveSide
  same: boolean
  /** ITR firmados o aprobados: bloquean el movimiento hasta reabrirlos. */
  signed_itrs: { id: string; itr_number: string; status: string }[]
  /** ITR sin firmar que se mueven con el tag. */
  itrs: { id: string; itr_number: string; status: string }[]
  /** Punches abiertos (del tag o de sus ITR) que se mueven. */
  punches: { id: string; punch_number: string; category: string; status: string }[]
  /** Punches cerrados o cancelados: se quedan en el subsistema de origen. */
  punches_kept: number
  /** Certificados en revisión o emitidos de los dos subsistemas: no bloquean, cambia lo que cubren. */
  certificates: { id: string; certificate_number: string; status: string; side: 'from' | 'to' }[]
}

export const TAG_MOVE_REASON_MIN = 10
