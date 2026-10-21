/**
 * S21 (I-08): catálogo v1 de `domain_events` (schema_version = 1). Lo emite la BD:
 * - cambios de fila (`emit_domain_event`): `<entidad>.created|updated|deleted`, entidad en singular;
 * - eventos de negocio derivados de transiciones de estado (`emit_domain_event` / `emit_business_event`);
 * - eventos que escriben a mano la API v1 y el handover.
 * Un test compara este catálogo con los literales de `supabase/functions-sql/emit_*.sql`.
 */

export const DOMAIN_ENTITIES = ['tag', 'itr', 'punch', 'certificate', 'system', 'subsystem', 'signal', 'loop'] as const

const CHANGE_EVENTS = DOMAIN_ENTITIES.flatMap(e => [`${e}.created`, `${e}.updated`, `${e}.deleted`])

export const BUSINESS_EVENTS = [
  'itr.completed', 'itr.approved', 'itr.rejected', 'itr.returned', 'itr.reopened',
  'punch.assigned', 'punch.closed', 'punch.cancelled', 'punch.reopened',
  'punch.transferred_to_ops', 'punch.ops_updated', 'punch.ops_closed',
  'certificate.issued', 'certificate.rejected', 'certificate.revoked',
  'gate.approved', 'gate.revoked',
  'transfer.completed',
  'handover.issued',
  'import.completed',
] as const

export const DOMAIN_EVENT_TYPES: readonly string[] = [...CHANGE_EVENTS, ...BUSINESS_EVENTS]

/** = SQL `push_event_types()`: los eventos que `outbox_dispatch` encola para el cron de push. */
export const PUSH_EVENT_TYPES = ['itr.rejected', 'itr.returned', 'punch.created', 'punch.assigned', 'certificate.issued'] as const

/** Entidades que aparecen en la auditoría (/admin/audit): las de cambio de fila más las de negocio. */
export const AUDIT_ENTITY_TYPES = [...DOMAIN_ENTITIES, 'gate', 'transfer', 'handover_package', 'import'] as const
