// G-17: datos y ayudas de los recorridos E2E. Los ids son los de supabase/seed/00_actors.sql y 10_e2e.sql.
import { expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const E2E = {
  password: 'E2e-commup-2026!',
  inspector: { id: 'e2e00000-0000-4000-8000-0000000000a1', email: 'inspector@e2e.commup.test' },
  projectId: 'e2e00000-0000-4000-8000-0000000000b1',
  subsystemId: 'e2e00000-0000-4000-8000-0000000000c3',
  phaseId: 'e2e00000-0000-4000-8000-0000000000d2',
  tagId: 'e2e00000-0000-4000-8000-0000000000f1',
  templateId: 'e2e00000-0000-4000-8000-000000000010',
  items: {
    nameplate: { id: 'e2e00000-0000-4000-8000-000000000021', label: 'Placa de identificación conforme' },
    insulation: { id: 'e2e00000-0000-4000-8000-000000000022', label: 'Resistencia de aislamiento' },
    notes: { id: 'e2e00000-0000-4000-8000-000000000023', label: 'Observaciones de montaje' },
    photo: { id: 'e2e00000-0000-4000-8000-000000000024', label: 'Foto del equipo instalado' },
  },
} as const

/** Cliente service role del Supabase LOCAL (el lanzador ya comprobó que es local). */
export function adminDb(): SupabaseClient {
  const url = process.env.E2E_SUPABASE_URL
  const key = process.env.E2E_SERVICE_ROLE_KEY
  if (!url || !key || !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error('E2E: falta el Supabase local (usa `npm run e2e`)')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * ITR nuevo del tag sembrado, asignado al inspector como ejecutor: cada corrida trabaja sobre uno limpio sin
 * reiniciar la base.
 */
export async function freshItr(db: SupabaseClient): Promise<string> {
  const number = `E2E-${Date.now().toString(36).toUpperCase()}`
  const { data, error } = await db.from('itrs').insert({
    template_id: E2E.templateId, subsystem_id: E2E.subsystemId, project_id: E2E.projectId, phase_id: E2E.phaseId,
    tag_id: E2E.tagId, itr_number: number,
  }).select('id').single()
  if (error) throw new Error(`E2E: no se pudo crear el ITR: ${error.message}`)
  const { error: aErr } = await db.from('itr_assignments').insert({ itr_id: data.id, user_id: E2E.inspector.id, role: 'executor' })
  if (aErr) throw new Error(`E2E: no se pudo asignar el ITR: ${aErr.message}`)
  return data.id
}

export async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(E2E.password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/(home|my-work|dashboard)/)
}

export const itrUrl = (itrId: string) => `/projects/${E2E.projectId}/tags/${E2E.tagId}/itrs/${itrId}`

/** PNG mínimo válido (1×1) para la foto del ítem. */
export const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
