import { DOMAIN_EVENT_TYPES } from './domain-events'

/** S21 (I-08): el selector de webhooks usa el catálogo v1 (antes ofrecía nombres que la BD nunca emitía). */
export const WEBHOOK_EVENT_TYPES: { value: string; label: string }[] = [
  { value: '*', label: '* — todos los eventos' },
  ...DOMAIN_EVENT_TYPES.map(value => ({ value, label: value })),
]
