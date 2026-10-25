/**
 * A47 · E5 (D8): «Quién debe actuar» en la liberación siguiente de cada sistema. Lo calcula la RPC
 * `project_gate_actors` (supabase/functions-sql/project_gate_actors.sql) a partir del motivo; aquí solo se arma el
 * texto de la columna de la matriz y del Excel.
 */
export type GateActorPerson = { id: string; name: string | null }

export type GateActor = {
  system_id: string
  gate_id: string
  gate_code: string
  /** sign · approve · review · punch · punch_b · itr_rejected · itrs · scope, o el criterio que falla (sin persona). */
  kind: string
  /** Capacidad que falta firmar (solo `sign`). */
  capacity: string | null
  people: GateActorPerson[]
  item_count: number | null
}

export const ACTOR_KINDS = ['sign', 'approve', 'review', 'punch', 'punch_b', 'itr_rejected', 'itrs', 'scope'] as const
export type ActorKind = (typeof ACTOR_KINDS)[number]
export const isActorKind = (k: string): k is ActorKind => (ACTOR_KINDS as readonly string[]).includes(k)

/** Hasta dos nombres y «y N más». */
export function peopleText(people: readonly GateActorPerson[], more: (names: string, count: number) => string): string {
  const names = people.map(p => p.name ?? '—')
  if (names.length <= 2) return names.join(', ')
  return more(names.slice(0, 2).join(', '), names.length - 2)
}

/**
 * Texto de la columna: «qué hay que hacer · quién». `t` da las etiquetas (ControlTower.actors.*), `capacity` la de la
 * capacidad y `criterion` la del criterio (Gates.kind.*) cuando el motivo no tiene persona.
 */
export function actorText(a: GateActor, t: {
  action: (kind: ActorKind, values: { capacity: string; count: number }) => string
  capacity: (c: string) => string
  criterion: (kind: string) => string
  more: (names: string, count: number) => string
  nobody: string
}): string {
  const what = isActorKind(a.kind)
    ? t.action(a.kind, { capacity: a.capacity ? t.capacity(a.capacity) : '', count: a.item_count ?? 0 })
    : t.criterion(a.kind)
  if (!isActorKind(a.kind)) return what
  const who = a.people.length > 0 ? peopleText(a.people, t.more) : t.nobody
  return `${what} · ${who}`
}
