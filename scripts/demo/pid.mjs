#!/usr/bin/env node
// Demo local (supabase/seed/20_demo.sql): genera un P&ID de prueba (pdf-lib) y lo sube al Supabase LOCAL en
// project-documents/<project>/<document>/rev-A.pdf, la ruta que la semilla deja en la revisión A de PID-E2E-001.
//   node scripts/demo/pid.mjs   (lo corre `npm run demo:reset` después del reset)
// Se niega a correr si la URL no es local. El plano dice «Plano de prueba CommUp, no es un plano real».
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const out = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const env = Object.fromEntries(out.split('\n').map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]))
const url = env.API_URL
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url ?? '') || !env.SERVICE_ROLE_KEY) {
  console.error(`demo/pid: Supabase no es local (${url ?? 'sin URL'}). Corre \`supabase start\`; nunca contra prod.`)
  process.exit(1)
}

const PATH = 'e2e00000-0000-4000-8000-0000000000b1/e2e00000-0000-4000-8000-0000000000e1/rev-A.pdf'

const pdf = await PDFDocument.create()
const page = pdf.addPage([1191, 842]) // A3 apaisado
const font = await pdf.embedFont(StandardFonts.Helvetica)
const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
const ink = rgb(0.2, 0.25, 0.33)
const H = 842
const line = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: 2, color: ink })
const text = (s, x, y, size = 11, f = font) => page.drawText(s, { x, y: H - y, size, font: f, color: ink })
const valve = (x, y) => { line(x - 15, y - 12, x + 15, y + 12); line(x - 15, y + 12, x + 15, y - 12); line(x - 15, y - 12, x - 15, y + 12); line(x + 15, y - 12, x + 15, y + 12) }
const bubble = (x, y, a, b) => { page.drawCircle({ x, y: H - y, size: 22, borderColor: ink, borderWidth: 1.5 }); text(a, x - 8, y - 2, 10, bold); text(b, x - 18, y + 36, 9) }

line(80, 420, 330, 420); page.drawCircle({ x: 360, y: H - 420, size: 30, borderColor: ink, borderWidth: 2 }); text('P-101A', 335, 470)
line(390, 420, 660, 420); valve(675, 420); text('XV-103', 655, 455)
line(690, 420, 1100, 420)
line(520, 420, 520, 220); line(520, 220, 860, 220); valve(875, 220); text('HV-104', 855, 190); line(890, 220, 1100, 220)
line(520, 420, 520, 620); line(520, 620, 780, 620); valve(795, 620); text('LV-105', 775, 655); line(810, 620, 1100, 620)
bubble(600, 330, 'PT', 'PT-101'); line(600, 352, 600, 420)
bubble(640, 540, 'FT', 'FT-102'); line(640, 518, 640, 420)
page.drawRectangle({ x: 20, y: 20, width: 1151, height: 802, borderColor: ink, borderWidth: 1 })
text('PID-E2E-001 · rev A · Plano de prueba CommUp, no es un plano real', 40, 805, 12, bold)

const bytes = await pdf.save()
const db = createClient(url, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { error } = await db.storage.from('project-documents').upload(PATH, bytes, { contentType: 'application/pdf', upsert: true })
if (error) { console.error('demo/pid:', error.message); process.exit(1) }
console.log(`demo/pid: subido ${PATH} (${bytes.length} bytes)`)
