// Historia del punch (N1b): la página propia del punch muestra qué pasó y quién lo hizo.
// Las RPC de transición (resolver, verificar, rechazar, cancelar, revisar categoría) ya dejan su
// comentario en `punch_comments` con un prefijo fijo; aquí solo se reconoce el tipo para pintarlo.
// La reasignación vive en `activity_log`, que por RLS solo leen owner/admin: para el resto no aparece.

export type PunchTimelineKind =
  | 'created' | 'comment' | 'resolved' | 'verified' | 'rejected' | 'cancelled' | 'reviewed' | 'reassigned'

export type PunchTimelineEntry = {
  key: string
  kind: PunchTimelineKind
  at: string
  userId: string | null
  /** Texto del comentario (sin el prefijo del tipo) o, en una reasignación, null. */
  text: string | null
  /** Reasignación: de quién a quién (ids). */
  from?: string | null
  to?: string | null
}

export type PunchCommentRow = { id: string; user_id: string; comment: string; created_at: string }
export type PunchActivityRow = { id: string; user_id: string; action: string; payload: unknown; created_at: string }

/** Prefijos que escriben las RPC (`resolve_punch`, `verify_punch`, `cancel_punch`, `review_punch_category`). */
const PREFIXES: Array<[RegExp, PunchTimelineKind]> = [
  [/^Resuelto:\s*/, 'resolved'],
  [/^Verificado en campo y cerrado[:.]?\s*/, 'verified'],
  [/^Verificación rechazada:\s*/, 'rejected'],
  [/^Cancelado:\s*/, 'cancelled'],
  [/^(?=Categoría [ABC] confirmada|Recategorizado [ABC] → [ABC])/, 'reviewed'],
]

export function classifyPunchComment(comment: string): { kind: PunchTimelineKind; text: string } {
  for (const [re, kind] of PREFIXES) {
    if (re.test(comment)) return { kind, text: comment.replace(re, '').trim() }
  }
  return { kind: 'comment', text: comment }
}

function idOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** Línea de tiempo en orden cronológico (lo más antiguo primero), con el alta como primera entrada. */
export function buildPunchTimeline(input: {
  punch: { id: string; created_at: string; raised_by: string | null }
  comments: PunchCommentRow[]
  activity?: PunchActivityRow[]
}): PunchTimelineEntry[] {
  const out: PunchTimelineEntry[] = [
    { key: `created:${input.punch.id}`, kind: 'created', at: input.punch.created_at, userId: input.punch.raised_by, text: null },
  ]
  for (const c of input.comments) {
    const { kind, text } = classifyPunchComment(c.comment)
    out.push({ key: `c:${c.id}`, kind, at: c.created_at, userId: c.user_id, text: text || null })
  }
  for (const a of input.activity ?? []) {
    if (a.action !== 'reassigned') continue
    const p = (a.payload ?? {}) as Record<string, unknown>
    out.push({ key: `a:${a.id}`, kind: 'reassigned', at: a.created_at, userId: a.user_id, text: null, from: idOrNull(p.from), to: idOrNull(p.to) })
  }
  return out.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : x.kind === 'created' ? -1 : y.kind === 'created' ? 1 : 0))
}
