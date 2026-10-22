/**
 * N3a (H-17, «Maquetas N3» aprobadas por Luis 2026-10-22): búsqueda global ⌘K.
 * La RPC `search_everything` (SECURITY INVOKER, sobre RLS) devuelve kind + ids; aquí se decide el orden de los grupos,
 * la ruta de cada resultado y los «recientes» del dispositivo (tipo SAP: últimos objetos abiertos).
 */

export const SEARCH_KINDS = [
  'tag', 'system', 'subsystem', 'itr', 'punch', 'certificate', 'document',
  'action', 'constraint', 'tq', 'decision', 'register',
  'procedure', 'event', 'transfer', 'performance_test', 'ptc', 'vendor', 'report', 'handover',
] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]

export type SearchRow = { kind: string; id: string; project_id: string; ref: string; title: string | null; extra_id: string | null; rank: number }
export type SearchHit = { kind: SearchKind; id: string; projectId: string; ref: string; title: string | null; href: string; rank: number; projectCode?: string }

/** Ruta de cada tipo (las fichas que existen; un ITR sin tag cae en la lista filtrada). */
export function hrefFor(r: Pick<SearchRow, 'kind' | 'id' | 'project_id' | 'ref' | 'extra_id'>): string | null {
  const p = `/projects/${r.project_id}`
  switch (r.kind) {
    case 'tag': return `${p}/tags/${r.id}`
    case 'system': return `${p}/systems/${r.id}`
    case 'subsystem': return `${p}/tags?subsystem=${r.id}`
    case 'itr': return r.extra_id ? `${p}/tags/${r.extra_id}/itrs/${r.id}` : `${p}/itrs?q=${encodeURIComponent(r.ref)}`
    case 'punch': return `${p}/punches/${r.id}`
    case 'certificate': return `${p}/certificates/${r.id}`
    case 'document': return `${p}/documents/${r.id}`
    case 'action': return `${p}/daily/action/${r.id}`
    case 'constraint': return `${p}/daily/constraint/${r.id}`
    case 'tq': return `${p}/daily/tq/${r.id}`
    case 'decision': return `${p}/daily/decision/${r.id}`
    case 'register': return `${p}/registers/${r.id}`
    case 'procedure': return `${p}/startup/procedures/${r.id}`
    case 'event': return `${p}/startup/events/${r.id}`
    case 'transfer': return `${p}/startup/transfers/${r.id}`
    case 'performance_test': return `${p}/startup/performance/${r.id}`
    case 'ptc': return r.extra_id ? `${p}/startup/performance/runs/${r.extra_id}` : `${p}/startup/performance`
    case 'vendor': return `${p}/vendors/${r.id}`
    case 'report': return `${p}/daily/reports/${r.id}`
    case 'handover': return `${p}/daily/handovers/${r.id}`
    default: return null
  }
}

export function toHits(rows: readonly SearchRow[], projectCode: (id: string) => string | undefined = () => undefined): SearchHit[] {
  const out: SearchHit[] = []
  for (const r of rows) {
    const href = hrefFor(r)
    if (!href || !(SEARCH_KINDS as readonly string[]).includes(r.kind)) continue
    out.push({ kind: r.kind as SearchKind, id: r.id, projectId: r.project_id, ref: r.ref, title: r.title, href, rank: r.rank, projectCode: projectCode(r.project_id) })
  }
  return out
}

/**
 * Grupos en el orden del catálogo, pero el grupo del mejor resultado (p. ej. el número exacto TQ-0042) va primero,
 * así Enter lo abre directo. Dentro de cada grupo: exacto, empieza, contiene, título.
 */
export function groupHits(hits: readonly SearchHit[]): { kind: SearchKind; hits: SearchHit[] }[] {
  const byKind = new Map<SearchKind, SearchHit[]>()
  for (const h of hits) byKind.set(h.kind, [...(byKind.get(h.kind) ?? []), h])
  const groups = SEARCH_KINDS.filter(k => byKind.has(k)).map(k => ({
    kind: k,
    hits: byKind.get(k)!.sort((a, b) => a.rank - b.rank || a.ref.localeCompare(b.ref, undefined, { numeric: true })),
  }))
  const best = Math.min(...groups.map(g => g.hits[0].rank))
  const first = groups.findIndex(g => g.hits[0].rank === best)
  return first > 0 ? [groups[first], ...groups.slice(0, first), ...groups.slice(first + 1)] : groups
}

/** Proyecto actual según la ruta (`/projects/<uuid>/…`), para el alcance por defecto. */
export function projectFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)
  return m ? m[1] : null
}

// ── Recientes (este dispositivo) ─────────────────────────────────────────

export const RECENTS_KEY = 'commup:search:recent'
export const RECENTS_MAX = 8
export type RecentItem = { kind: SearchKind; ref: string; title: string | null; href: string; projectCode?: string }

/** Agrega al principio, sin repetir la misma ruta, con tope. */
export function pushRecent(list: readonly RecentItem[], item: RecentItem, max = RECENTS_MAX): RecentItem[] {
  return [item, ...list.filter(r => r.href !== item.href)].slice(0, max)
}

/** Lee la lista guardada tolerando basura (otra versión, almacenamiento editado a mano). */
export function parseRecents(raw: string | null): RecentItem[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter((r): r is RecentItem => !!r && typeof r.href === 'string' && r.href.startsWith('/') && typeof r.ref === 'string'
      && (SEARCH_KINDS as readonly string[]).includes(r.kind)).slice(0, RECENTS_MAX)
  } catch { return [] }
}
