import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TOPICS, NOTIFICATION_KINDS, NOTIFICATION_TOPICS, notificationTopic } from './topics'

describe('temas de push (S22, I-09)', () => {
  it('cada tipo de aviso que crea la BD tiene tema propio', () => {
    const sql = ['notify_obligation_trg', 'gate_status_transition_trg', 'notify_preservation_overdue',
      'notify_constraints_overdue', 'notify_pssr_reviews_overdue', 'notify_registers_overdue']
      .map(f => readFileSync(join(__dirname, '../../../supabase/functions-sql', `${f}.sql`), 'utf8')).join('\n')
    // El tipo es el literal que va justo antes del título (un texto en mayúscula o el CASE del título).
    const kinds = [...sql.matchAll(/'([a-z_]+)',\s*(?:'[A-ZÁÉÍÓÚ]|CASE WHEN r\.status)/g)].map(m => m[1])
    expect(kinds.length).toBeGreaterThan(12)
    for (const k of new Set(kinds)) expect(NOTIFICATION_KINDS).toContain(k)
  })

  it('los temas por defecto existen y no incluyen el aviso amplio de Cat A', () => {
    for (const t of DEFAULT_TOPICS) expect(NOTIFICATION_TOPICS).toContain(t)
    expect(DEFAULT_TOPICS).not.toContain('punch_cat_a')
    expect(notificationTopic('algo_nuevo')).toBe('readiness')
  })
})
