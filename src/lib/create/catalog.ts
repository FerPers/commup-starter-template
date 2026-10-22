/**
 * N3b («Maquetas N3» aprobadas por Luis 2026-10-22): ＋ Crear desde donde estés.
 * Cada opción abre su formulario de siempre con el proyecto, el sistema y el tag de la pantalla precargados.
 * Ocultar es UX: cada página de alta y cada RPC vuelven a validar el rol.
 */
import { hasTier } from '@/lib/constants/roles'

export const CREATE_KINDS = ['punch', 'action', 'constraint', 'tq', 'event', 'register'] as const
export type CreateKind = (typeof CREATE_KINDS)[number]

/** Lo de campo (inspector) y todo para líder+. El cliente (la operadora) solo levanta TQ (decisión de Luis 2026-10-22). */
const FIELD_KINDS: readonly CreateKind[] = ['punch', 'register', 'event']

export function createKindsFor(role: string | null | undefined): CreateKind[] {
  if (hasTier('editor', role)) return [...CREATE_KINDS]
  if (role === 'inspector') return [...FIELD_KINDS]
  if (role === 'client') return ['tq']
  return []
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

export type CreateContext = { projectId: string | null; tagId: string | null; systemId: string | null }

/** Contexto de la ruta actual: proyecto y, si es la ficha de un tag o de un sistema, ese objeto. */
export function createContextFromPath(pathname: string): CreateContext {
  const m = pathname.match(new RegExp(`^/projects/(${UUID})(?:/(tags|systems)/(${UUID}))?(?:/|$)`, 'i'))
  if (!m) return { projectId: null, tagId: null, systemId: null }
  return { projectId: m[1], tagId: m[2] === 'tags' ? m[3] : null, systemId: m[2] === 'systems' ? m[3] : null }
}

/** Ruta interna segura para volver (relativa al sitio, sin `//` ni esquema). */
export function safeBack(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  return raw.slice(0, 500)
}

export function createHref(kind: CreateKind, ctx: CreateContext & { projectId: string }, back?: string | null): string {
  const p = `/projects/${ctx.projectId}`
  const q = new URLSearchParams()
  // El tag precarga su sistema en todas; en punch, TQ, registro y evento además queda como tag del objeto.
  if (ctx.tagId) q.set('tag', ctx.tagId)
  if (ctx.systemId) q.set(kind === 'event' ? 'system' : 'systemId', ctx.systemId)
  // Desde la ficha del tag, el punch nuevo vuelve a su pestaña de punch (queda a la vista).
  if (kind === 'punch') {
    const to = ctx.tagId ? `${p}/tags/${ctx.tagId}?tab=punches` : safeBack(back)
    if (to) q.set('back', to)
  }
  const qs = () => (q.size ? `?${q.toString()}` : '')
  switch (kind) {
    case 'punch': return `${p}/punches/new${qs()}`
    case 'action': case 'constraint': case 'tq': q.set('kind', kind); return `${p}/daily/new${qs()}`
    case 'event': q.set('new', '1'); return `${p}/startup/events${qs()}`
    case 'register': return `${p}/registers/new${qs()}`
  }
}
