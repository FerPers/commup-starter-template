// G-17 (decisión de Luis 2026-10-23: primer recorrido = «sin red y sincronizar»). Protege lo que se vende como
// «ITR sin red»: el inspector abre el ITR con red, la pierde, responde (casilla, medición, texto), toma la foto y
// firma; todo queda en la cola del dispositivo y, al volver la red, llega a la BD con la hora de campo.
import { test, expect } from '@playwright/test'
import { E2E, adminDb, freshItr, itrUrl, login, tinyPng } from './fixtures'

test('inspector sin red: responde, toma foto y firma; al volver la red todo llega a la BD', async ({ page, context }) => {
  const db = adminDb()
  const itrId = await freshItr(db)

  await login(page, E2E.inspector.email)
  await page.goto(itrUrl(itrId))
  const nameplate = page.getByRole('checkbox', { name: E2E.items.nameplate.label })
  await expect(nameplate).toBeVisible()

  // ── Sin red ──
  await context.setOffline(true)
  await expect(page.getByText('🔴 Sin red', { exact: false })).toBeVisible()
  const offlineSince = new Date()

  await nameplate.check()
  const insulation = page.getByRole('spinbutton', { name: E2E.items.insulation.label })
  await insulation.fill('250')
  await insulation.blur()
  const notes = page.getByRole('textbox', { name: E2E.items.notes.label })
  await notes.fill('Montado sin novedad (E2E sin red)')
  await notes.blur()
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({ name: 'equipo.png', mimeType: 'image/png', buffer: tinyPng })

  // Lo capturado se ve en pantalla y espera en la cola del dispositivo.
  await expect(page.getByText(/Sin red — \d+ pendientes?/)).toBeVisible()
  await expect(nameplate).toBeChecked()
  await expect(insulation).toHaveValue('250')

  // Firma como ejecutor, también sin red.
  await page.getByRole('button', { name: /Firmar/ }).first().click()
  const pad = page.locator('canvas').first()
  const box = (await pad.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 8 })
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20, { steps: 8 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Confirmar firma' }).click()

  // Nada llegó todavía a la BD.
  const before = await db.from('itr_responses').select('id').eq('itr_id', itrId)
  expect(before.data ?? []).toHaveLength(0)

  // ── Vuelve la red: la cola se vacía sola ──
  const onlineAt = new Date()
  await context.setOffline(false)
  // Ningún aviso «Sin red» queda en pantalla una vez sincronizado (el de la foto incluido).
  await expect(page.getByText(/Sin red/)).toHaveCount(0, { timeout: 30_000 })

  await expect.poll(async () => {
    const [{ data: r }, { data: a }, { data: s }] = await Promise.all([
      db.from('itr_responses').select('item_id').eq('itr_id', itrId),
      db.from('itr_attachments').select('id').eq('itr_id', itrId),
      db.from('itr_signatures').select('id').eq('itr_id', itrId),
    ])
    return `${r?.length ?? 0} respuestas · ${a?.length ?? 0} fotos · ${s?.length ?? 0} firmas`
  }, { timeout: 30_000 }).toBe('3 respuestas · 1 fotos · 1 firmas')

  // Valores y hora de campo (capturada sin red, antes de reconectar).
  const { data: rows } = await db.from('itr_responses')
    .select('item_id, value_bool, value_numeric, value_text, is_passed, captured_at, responded_by').eq('itr_id', itrId)
  const byItem = new Map((rows ?? []).map(r => [r.item_id, r]))
  expect(byItem.get(E2E.items.nameplate.id)).toMatchObject({ value_bool: true, responded_by: E2E.inspector.id })
  expect(byItem.get(E2E.items.insulation.id)).toMatchObject({ value_numeric: 250, is_passed: true })
  expect(byItem.get(E2E.items.notes.id)).toMatchObject({ value_text: 'Montado sin novedad (E2E sin red)' })
  for (const r of rows ?? []) {
    const at = new Date(r.captured_at).getTime()
    expect(at).toBeGreaterThanOrEqual(offlineSince.getTime() - 1000)
    expect(at).toBeLessThanOrEqual(onlineAt.getTime())
  }

  // La foto quedó en el bucket del ITR y la firma es del inspector como ejecutor.
  const { data: att } = await db.from('itr_attachments').select('file_url, item_id').eq('itr_id', itrId).single()
  expect(att?.item_id).toBe(E2E.items.photo.id)
  const { data: file, error: fileErr } = await db.storage.from('itr-attachments').download(att!.file_url)
  expect(fileErr).toBeNull()
  expect(file!.size).toBeGreaterThan(0)
  const { data: sig } = await db.from('itr_signatures').select('user_id, role').eq('itr_id', itrId).single()
  expect(sig).toMatchObject({ user_id: E2E.inspector.id, role: 'executor' })

  // Con red, la pantalla recargada muestra lo que quedó en la BD.
  await page.reload()
  await expect(page.getByRole('checkbox', { name: E2E.items.nameplate.label })).toBeChecked()
  await expect(page.getByRole('spinbutton', { name: E2E.items.insulation.label })).toHaveValue('250')
})
