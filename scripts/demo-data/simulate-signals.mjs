#!/usr/bin/env node
// E-35 (2026-10-19): simulador de PLC para la DEMO. A diferencia de los seeds SQL, que insertan
// directo en signal_samples, este pasa por la ingesta real: POST /api/v1/signals/samples con una
// API key (scope signals:write), a 1 Hz por señal, enviando un lote cada --flush segundos.
//
//   COMMUP_API_KEY=cu_... node scripts/demo-data/simulate-signals.mjs \
//     --url https://commup.app --signals PT-3001.PV:48:2,TT-3002.PV:85:1.5 [--flush 5] [--minutes 10]
//
// Cada señal es nombre:base:amplitud (onda seno de 5 min + ruido). Ctrl-C envía lo pendiente y sale.
import { randomUUID } from 'node:crypto'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
const KEY = process.env.COMMUP_API_KEY
const URL_BASE = (args.url ?? 'http://localhost:3000').replace(/\/$/, '')
const FLUSH_S = Number(args.flush ?? 5)
const MINUTES = args.minutes ? Number(args.minutes) : Infinity
const SIGNALS = (args.signals ?? '').split(',').filter(Boolean).map(spec => {
  const [name, base = '0', amp = '1'] = spec.split(':')
  return { name, base: Number(base), amp: Number(amp) }
})

if (!KEY || SIGNALS.length === 0) {
  console.error('Uso: COMMUP_API_KEY=… node scripts/demo-data/simulate-signals.mjs --url … --signals NOMBRE:base:amp[,…]')
  process.exit(1)
}

let buffer = []
const t0 = Date.now()

function tick() {
  const now = new Date()
  const phase = ((now.getTime() - t0) / 300_000) * 2 * Math.PI
  for (const s of SIGNALS) {
    const value = s.base + s.amp * Math.sin(phase) + (Math.random() - 0.5) * s.amp * 0.1
    buffer.push({ signal_name: s.name, sampled_at: now.toISOString(), value: Number(value.toFixed(3)), quality: 0 })
  }
}

async function flush() {
  if (buffer.length === 0) return
  const samples = buffer
  buffer = []
  const res = await fetch(`${URL_BASE}/api/v1/signals/samples`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'SIMULATOR', source_system: 'CommUp DEMO · simulador 1 Hz', batch_id: randomUUID(), samples }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok && res.status !== 207) console.error(`HTTP ${res.status}:`, body.error ?? body)
  else console.log(`${new Date().toISOString()} · ${body.data?.accepted ?? 0}/${body.data?.total ?? samples.length} aceptadas${body.data?.rejected ? ` · rechazos: ${JSON.stringify(body.data.errors)}` : ''}`)
}

const sampler = setInterval(tick, 1000)
const flusher = setInterval(() => { flush().catch(e => console.error(e.message)) }, FLUSH_S * 1000)

async function stop() {
  clearInterval(sampler)
  clearInterval(flusher)
  await flush().catch(e => console.error(e.message))
  process.exit(0)
}
process.on('SIGINT', stop)
if (Number.isFinite(MINUTES)) setTimeout(stop, MINUTES * 60_000)
console.log(`Simulando ${SIGNALS.length} señal(es) a 1 Hz contra ${URL_BASE} (lote cada ${FLUSH_S} s)…`)
