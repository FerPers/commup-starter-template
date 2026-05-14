#!/usr/bin/env tsx
/**
 * One-shot migration: split bilingual ITR template item descriptions
 * (English + Spanish concatenated in `description`) into separate fields.
 *
 * Reads items where description_es IS NULL or empty, sends batches to Claude,
 * writes back description (EN) + description_es (ES). Never touches items
 * already migrated.
 *
 * Snapshot: itr_template_items_backup_pre_split (created via Supabase MCP).
 * Rollback:
 *   UPDATE itr_template_items i SET description=b.description, description_es=b.description_es
 *     FROM itr_template_items_backup_pre_split b WHERE i.id=b.id;
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/split-itr-bilingual.ts --dry-run --limit 20
 *
 *   npx tsx scripts/split-itr-bilingual.ts --apply
 */
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const MODEL = 'claude-haiku-4-5'
const BATCH_SIZE = 50
const MAX_TOKENS = 16000

type Args = { dryRun: boolean; limit: number | null; apply: boolean }

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const apply = args.includes('--apply')
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? '', 10) : null
  if (!dryRun && !apply) {
    console.error('Pasá --dry-run o --apply (o ambos: --dry-run --limit 20 primero).')
    process.exit(1)
  }
  return { dryRun, apply, limit: Number.isFinite(limit) ? limit : null }
}

const SYSTEM_PROMPT = `You are an expert technical translator for industrial commissioning documents (oil & gas, petrochemical, instrumentation). The items come from ITR (Inspection & Test Record) templates.

Each input item is a description that may contain ONE of:
1. English + Spanish concatenated (most common — usually English first, then Spanish, with no separator)
2. Only English text (no Spanish translation)
3. Only Spanish text (rare)
4. A non-translatable string (numbers like "8-13", labels like "Description", codes like "Protection [A]")

For each item, return:
- english: the English portion, or null if no English is present
- spanish: the Spanish portion, or null if no Spanish is present (or if the text is identical to the English)

Rules:
- If both languages are present, split them cleanly. Do NOT include Spanish words in english, or vice versa.
- If only English (technical labels, codes, references that have no Spanish translation), return english=<text>, spanish=null.
- For form-label items like "Extinguisher Type: Tipo de extinguidor:", split: english="Extinguisher Type:", spanish="Tipo de extinguidor:".
- Preserve original punctuation, units, and reference numbers in BOTH languages.
- The split point is where Spanish words begin (look for: el, la, los, las, que, se, está, debe, confirmar, verificar, instalación, sistema, etc., or words with diacritics).

Examples:

Input: "Confirm dust blind removed. (As required) Confirmar el retiro de las persianas de polvo (si es requerido)."
Output: english="Confirm dust blind removed. (As required)", spanish="Confirmar el retiro de las persianas de polvo (si es requerido)."

Input: "Perform Loop Checks. Realice chequeos de los Lazos."
Output: english="Perform Loop Checks.", spanish="Realice chequeos de los Lazos."

Input: "Extinguisher Type: Tipo de extinguidor:"
Output: english="Extinguisher Type:", spanish="Tipo de extinguidor:"

Input: "Check Lube Oil filters are installed correctly and clean."
Output: english="Check Lube Oil filters are installed correctly and clean.", spanish=null

Input: "8-13"
Output: english="8-13", spanish=null

Input: "Protection [A]"
Output: english="Protection [A]", spanish=null

Input: "Design lubricants and levels correct. Confirm with Commissioning Los lubricantes y los niveles de diseño están correctos. Confirmar con el equipo de comisionamiento."
Output: english="Design lubricants and levels correct. Confirm with Commissioning", spanish="Los lubricantes y los niveles de diseño están correctos. Confirmar con el equipo de comisionamiento."

Input: "Red Rojo"
Output: english="Red", spanish="Rojo"

Return a JSON object with a "items" array; each entry must have id, english, spanish — preserving the input order.`

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          english: { type: ['string', 'null'] },
          spanish: { type: ['string', 'null'] },
        },
        required: ['id', 'english', 'spanish'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
}

type SourceRow = { id: string; description: string }
type SplitResult = { id: string; english: string | null; spanish: string | null }

async function callClaude(client: Anthropic, batch: SourceRow[]): Promise<SplitResult[]> {
  const userPayload = batch.map(r => ({ id: r.id, text: r.description }))

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Split each of these ITR description items. Return one entry per input id.\n\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
  })

  const block = response.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('No text block in response')

  const parsed = JSON.parse(block.text) as { items: SplitResult[] }
  return parsed.items
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function main() {
  const { dryRun, apply, limit } = parseArgs()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!supabaseUrl || !serviceKey) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  if (!anthropicKey) throw new Error('Falta ANTHROPIC_API_KEY')

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const claude = new Anthropic({ apiKey: anthropicKey })

  console.log(`Modo: ${apply ? 'APPLY (escribe a BD)' : 'DRY-RUN (no escribe)'}${limit ? ` · limit=${limit}` : ''}`)
  console.log(`Modelo: ${MODEL} · batch=${BATCH_SIZE}\n`)

  // Fetch pending items in pages (Supabase caps at 1000 per .range())
  const PAGE = 1000
  const all: SourceRow[] = []
  let from = 0
  while (true) {
    const q = supabase
      .from('itr_template_items')
      .select('id, description, description_es')
      .or('description_es.is.null,description_es.eq.')
      .order('id')
      .range(from, from + PAGE - 1)
    const { data, error } = await q
    if (error) throw new Error(`Supabase fetch: ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data) {
      if (r.description && r.description.trim().length > 0) {
        all.push({ id: r.id as string, description: r.description as string })
      }
    }
    if (data.length < PAGE) break
    from += PAGE
    if (limit && all.length >= limit) break
  }

  const items = limit ? all.slice(0, limit) : all
  console.log(`Items pendientes: ${items.length}\n`)
  if (items.length === 0) {
    console.log('Nada que hacer.')
    return
  }

  const batches = chunks(items, BATCH_SIZE)
  let processed = 0
  let written = 0
  let errors = 0
  const samples: Array<{ source: string; english: string | null; spanish: string | null }> = []

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    process.stdout.write(`Batch ${i + 1}/${batches.length} (${batch.length} items)... `)
    let results: SplitResult[]
    try {
      results = await callClaude(claude, batch)
    } catch (e) {
      console.log(`ERROR — ${(e as Error).message}`)
      errors++
      continue
    }

    // Index by id; flag items missing from response
    const resultMap = new Map(results.map(r => [r.id, r]))
    const missing = batch.filter(b => !resultMap.has(b.id))
    if (missing.length > 0) {
      console.log(`(${missing.length} sin respuesta)`)
    }

    for (const src of batch) {
      const r = resultMap.get(src.id)
      if (!r) { errors++; continue }

      // Capture samples for dry-run preview (first batch)
      if (samples.length < 30) {
        samples.push({ source: src.description, english: r.english, spanish: r.spanish })
      }

      if (apply) {
        const englishOut = (r.english?.trim() || src.description).slice(0, 10000)
        const spanishOut = r.spanish?.trim() ? r.spanish.trim() : null
        const { error: updErr } = await supabase
          .from('itr_template_items')
          .update({ description: englishOut, description_es: spanishOut })
          .eq('id', src.id)
        if (updErr) {
          console.log(`\n  fallo update ${src.id}: ${updErr.message}`)
          errors++
        } else {
          written++
        }
      }
      processed++
    }
    console.log('OK')
  }

  console.log(`\n── Resumen ──`)
  console.log(`Procesados:  ${processed}`)
  console.log(`Escritos:    ${written}${apply ? '' : ' (dry-run, no se escribió)'}`)
  console.log(`Errores:     ${errors}`)

  if (dryRun || !apply) {
    console.log(`\n── Muestra de splits (primeros ${samples.length}) ──`)
    for (const s of samples) {
      console.log(`\nORIG: ${s.source.slice(0, 200)}`)
      console.log(`EN:   ${s.english ?? '(null)'}`)
      console.log(`ES:   ${s.spanish ?? '(null)'}`)
    }
  }
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
