/**
 * S22 (I-09, D16): temas de push = categorías de aviso. El push sale de `notifications` (cada aviso ya es de una
 * persona); el usuario elige qué categorías le llegan al teléfono. La bandeja muestra todo igual.
 */

export const NOTIFICATION_TOPICS = ['assignments', 'signatures', 'field', 'readiness', 'overdue', 'punch_cat_a'] as const
export type NotificationTopic = typeof NOTIFICATION_TOPICS[number]

/** Temas activos al suscribirse: todos menos el aviso amplio de punch Cat A (va a todos los líderes). */
export const DEFAULT_TOPICS: NotificationTopic[] = ['assignments', 'signatures', 'field', 'readiness', 'overdue']

const KIND_TOPIC: Record<string, NotificationTopic> = {
  punch_assigned: 'assignments',
  itr_assignment_changed: 'assignments',
  itr_bulk_assigned: 'assignments',
  action_assigned: 'assignments',

  gate_cosign: 'signatures',
  transfer_to_sign: 'signatures',
  ptc_to_sign: 'signatures',
  cert_signature_requested: 'signatures',
  pssr_submitted_for_approval: 'signatures',
  itr_signature_revoked: 'signatures',

  hold_to_release: 'field',
  milestone_to_witness: 'field',
  register_to_authorize: 'field',
  register_to_verify: 'field',
  action_to_verify: 'field',
  tq_answered: 'field',

  gate_ready: 'readiness',
  gate_regressed: 'readiness',
  cert_issued: 'readiness',
  certificate_revoked: 'readiness',
  certificate_reopened: 'readiness',
  pssr_approved: 'readiness',
  pssr_rejected: 'readiness',

  preservation_overdue: 'overdue',
  constraint_overdue: 'overdue',
  pssr_review_overdue: 'overdue',
  register_overdue: 'overdue',

  punch_cat_a: 'punch_cat_a',
}

/** Tema de push de un tipo de aviso; los tipos nuevos sin mapear caen en «readiness». */
export function notificationTopic(kind: string): NotificationTopic {
  return KIND_TOPIC[kind] ?? 'readiness'
}

/** Tipos de aviso conocidos (para las etiquetas y el filtro de la bandeja). */
export const NOTIFICATION_KINDS = Object.keys(KIND_TOPIC)

/** Avisos que piden actuar ya: el push los marca como urgentes y no se cierran solos. */
export function isUrgentKind(kind: string): boolean {
  return ['gate_regressed', 'hold_to_release', 'punch_cat_a', 'milestone_to_witness'].includes(kind)
}
