/**
 * S21 (I-08): catálogo v1 de `domain_events` (schema_version = 1). Lo emite la BD:
 * - cambios de fila (`emit_domain_event`): `<entidad>.created|updated|deleted`, entidad en singular;
 * - eventos de negocio derivados de transiciones de estado (`emit_domain_event` / `emit_business_event` /
 *   `gate_status_transition_trg`, S22);
 * - `handover.issued` (lo escribe el paquete) e `import.completed` (resumen de una importación masiva).
 * A04: la API v1 no escribe eventos; declara su origen por cabecera y el trigger lo deja en `payload.context`.
 * Un test compara este catálogo con los literales de esas funciones en `supabase/functions-sql`.
 * S22: el push sale de `notifications` (src/lib/notifications/topics.ts), no de estos eventos.
 */

export const DOMAIN_ENTITIES = ['tag', 'itr', 'punch', 'certificate', 'system', 'subsystem', 'signal', 'loop'] as const

const CHANGE_EVENTS = DOMAIN_ENTITIES.flatMap(e => [`${e}.created`, `${e}.updated`, `${e}.deleted`])

export const BUSINESS_EVENTS = [
  'itr.completed', 'itr.approved', 'itr.rejected', 'itr.returned', 'itr.reopened',
  'punch.assigned', 'punch.closed', 'punch.cancelled', 'punch.reopened',
  'punch.transferred_to_ops', 'punch.ops_updated', 'punch.ops_closed',
  'certificate.issued', 'certificate.rejected', 'certificate.revoked',
  'gate.approved', 'gate.revoked', 'gate.ready', 'gate.regressed',
  'transfer.completed',
  'handover.issued', 'handover.partial',
  'import.completed',
] as const

export const DOMAIN_EVENT_TYPES: readonly string[] = [...CHANGE_EVENTS, ...BUSINESS_EVENTS]

/** Entidades que aparecen en la auditoría (/admin/audit): las de cambio de fila más las de negocio. */
export const AUDIT_ENTITY_TYPES = [...DOMAIN_ENTITIES, 'gate', 'transfer', 'handover_package', 'import'] as const
