/**
 * C-27 (S08): un punch solo se BORRA si fue un error de carga — abierto, sin resolver, sin fotos, sin
 * vínculo con preservación y sin pasar a Operaciones. Lo demás se cancela con motivo (cancel_punch).
 */
export type DeletablePunch = {
  status: string
  resolved_at: string | null
  post_handover_status?: string | null
  preservation_record_id?: string | null
  attachments: number
}

export function punchDeleteBlocker(p: DeletablePunch): string | null {
  if (p.status !== 'open') return 'ya está en curso, cerrado o cancelado'
  if (p.resolved_at) return 'tiene una resolución registrada'
  if (p.attachments > 0) return 'tiene fotos de evidencia'
  if (p.preservation_record_id) return 'lo levantó un registro de preservación'
  if (p.post_handover_status && p.post_handover_status !== 'active') return 'está en seguimiento de Operaciones'
  return null
}
