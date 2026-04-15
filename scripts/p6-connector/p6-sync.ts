#!/usr/bin/env npx ts-node --esm
/**
 * CommUp — Primavera P6 Activity Sync (POC)
 * Stage 13.4
 *
 * PURPOSE
 * -------
 * Reads a P6 activity export (XER or JSON) and syncs it into CommUp's
 * work_plan_items table, matching P6 activities to ITRs via tag_number
 * or direct activity_id mapping.
 *
 * This is a POC / integration scaffold — not a production P6 API client.
 * For production, replace the file-based input with P6 REST API calls:
 *   GET https://<p6-server>/p6ws/rest/activity?projectObjectId=<id>
 *
 * USAGE
 * -----
 *   # From a P6 XER export (converted to JSON first):
 *   npx ts-node scripts/p6-connector/p6-sync.ts \
 *     --file ./activities.json \
 *     --project-id <commup-project-uuid> \
 *     --api-key sk_live_...
 *
 *   # Dry run (no writes):
 *   npx ts-node scripts/p6-connector/p6-sync.ts \
 *     --file ./activities.json \
 *     --project-id <commup-project-uuid> \
 *     --api-key sk_live_... \
 *     --dry-run
 *
 * INPUT FORMAT (JSON array of P6 activities)
 * ------------------------------------------
 * [
 *   {
 *     "ActivityId":      "A1000",
 *     "ActivityName":    "Install PSV-7621001",
 *     "WBSCode":         "PROC.INST.SV",
 *     "PlannedStartDate": "2024-03-01",
 *     "PlannedFinishDate": "2024-03-15",
 *     "ActualStartDate":  "2024-03-02",
 *     "ActualFinishDate": null,
 *     "DurationHours":    80,
 *     "Status":          "In Progress",  // Not Started | In Progress | Completed
 *     "TagNumber":       "PSV-7621001"   // optional — CommUp tag to link
 *   }
 * ]
 *
 * MAPPING LOGIC
 * -------------
 * 1. If activity has TagNumber → find tag in CommUp → find pending ITR for that tag
 * 2. Upsert work_plan_items with p6_activity_id as the conflict key
 * 3. Publish domain event p6.activity_synced for each upserted row
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync }  from 'node:fs'
import { parseArgs }     from 'node:util'

// ── Types ─────────────────────────────────────────────────────────────────────

interface P6Activity {
  ActivityId:        string
  ActivityName:      string
  WBSCode?:          string
  PlannedStartDate?: string
  PlannedFinishDate?: string
  ActualStartDate?:  string
  ActualFinishDate?: string
  DurationHours?:    number
  Status?:           string
  TagNumber?:        string   // CommUp tag_number if known
  ItrNumber?:        string   // CommUp ITR number if known
}

interface SyncResult {
  upserted:  number
  skipped:   number
  errors:    string[]
  dryRun:    boolean
}

// ── P6 status → CommUp work_plan_item status ─────────────────────────────────

function mapStatus(p6Status: string | undefined): string {
  const s = (p6Status ?? '').toLowerCase()
  if (s.includes('complete') || s.includes('finished'))  return 'completed'
  if (s.includes('progress') || s.includes('started'))   return 'in_progress'
  return 'pending'
}

// ── Duration helpers ──────────────────────────────────────────────────────────

function hoursToDays(hours: number | undefined): number | null {
  if (!hours) return null
  return Math.ceil(hours / 8)
}

function formatDate(d: string | null | undefined): string | null {
  if (!d) return null
  try {
    return new Date(d).toISOString().split('T')[0]
  } catch {
    return null
  }
}

// ── CommUp API helper (uses public API v1) ────────────────────────────────────

async function fetchCommUp<T>(
  path: string,
  apiKey: string,
  baseUrl = 'https://commup.app/api/v1',
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`CommUp API ${path}: ${res.status} ${body}`)
  }
  return res.json()
}

// ── Main sync ─────────────────────────────────────────────────────────────────

async function sync(opts: {
  file:       string
  projectId:  string
  apiKey:     string
  dryRun:     boolean
  baseUrl?:   string
  supabaseUrl?: string
  serviceKey?: string
}): Promise<SyncResult> {
  const result: SyncResult = { upserted: 0, skipped: 0, errors: [], dryRun: opts.dryRun }

  // Parse input file
  let activities: P6Activity[]
  try {
    const raw = readFileSync(opts.file, 'utf-8')
    activities = JSON.parse(raw)
    if (!Array.isArray(activities)) throw new Error('Expected JSON array')
  } catch (err) {
    throw new Error(`Failed to parse input file: ${err}`)
  }

  console.log(`\n📋 Loaded ${activities.length} P6 activities from ${opts.file}`)

  // Fetch CommUp hierarchy for this project
  console.log(`\n🔗 Fetching CommUp project hierarchy...`)
  const sysResp = await fetchCommUp<{ data: { areas: unknown[] } }>(
    `/systems?project_id=${opts.projectId}`,
    opts.apiKey,
    opts.baseUrl,
  )

  // Fetch CommUp tags (with ITR data)
  const tagsResp = await fetchCommUp<{ data: Array<{ id: string; tag_number: string; itr_total: number }> }>(
    `/tags?project_id=${opts.projectId}&limit=500`,
    opts.apiKey,
    opts.baseUrl,
  )

  // Build tag lookup map: tag_number → tag_id
  const tagMap = new Map<string, string>()
  for (const tag of tagsResp.data) {
    tagMap.set(tag.tag_number.toUpperCase(), tag.id)
  }

  console.log(`   Tags loaded: ${tagMap.size}`)
  console.log(`   Systems: ${sysResp.data.areas.length} areas`)

  // For direct DB upsert we need Supabase client (service role)
  // In production use the REST API; here we use direct Supabase for the POC
  const supabaseUrl = opts.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceKey  = opts.serviceKey  ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars')
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Fetch existing work_plan_items with p6_activity_id for this project
  const { data: existingItems } = await supabase
    .from('work_plan_items')
    .select('id, p6_activity_id, work_plan_id')
    .not('p6_activity_id', 'is', null)

  const existingMap = new Map<string, string>()
  for (const item of (existingItems ?? [])) {
    if (item.p6_activity_id) existingMap.set(item.p6_activity_id, item.id)
  }

  // Ensure a default work_plan exists for P6 import
  const { data: workPlan } = await supabase
    .from('work_plans')
    .select('id')
    .eq('project_id', opts.projectId)
    .eq('status', 'in_progress')
    .limit(1)
    .maybeSingle()

  let workPlanId: string
  if (!workPlan) {
    if (opts.dryRun) {
      workPlanId = '00000000-0000-0000-0000-000000000000'  // placeholder for dry run
    } else {
      const { data: newPlan, error } = await supabase
        .from('work_plans')
        .insert({
          project_id: opts.projectId,
          status:     'in_progress',
          notes:      'Auto-created by P6 sync',
          plan_date:  new Date().toISOString().split('T')[0],
        })
        .select('id')
        .single()

      if (error) throw new Error(`Failed to create work_plan: ${error.message}`)
      workPlanId = newPlan.id
      console.log(`\n✅ Created work_plan ${workPlanId} for P6 import`)
    }
  } else {
    workPlanId = workPlan.id
    console.log(`\n📁 Using existing work_plan ${workPlanId}`)
  }

  // Process each activity
  console.log(`\n⚙️  Processing activities...${opts.dryRun ? ' (DRY RUN)' : ''}\n`)

  for (const act of activities) {
    const actId = act.ActivityId?.trim()
    if (!actId) {
      result.errors.push(`Skipped activity with no ActivityId`)
      result.skipped++
      continue
    }

    // Try to resolve a CommUp tag
    let itrId: string | null = null
    if (act.TagNumber) {
      const tagId = tagMap.get(act.TagNumber.toUpperCase())
      if (tagId) {
        // Find any ITR for this tag
        const { data: itrs } = await supabase
          .from('itrs')
          .select('id')
          .eq('tag_id', tagId)
          .eq('project_id', opts.projectId)
          .limit(1)
          .maybeSingle()

        itrId = itrs?.id ?? null
      }
    }

    const itemPayload = {
      work_plan_id:    workPlanId,
      itr_id:          itrId,
      p6_activity_id:  actId,
      p6_wbs_code:     act.WBSCode     ?? null,
      title:           act.ActivityName ?? actId,
      status:          mapStatus(act.Status),
      planned_start:   formatDate(act.PlannedStartDate),
      planned_finish:  formatDate(act.PlannedFinishDate),
      actual_start:    formatDate(act.ActualStartDate),
      actual_finish:   formatDate(act.ActualFinishDate),
      duration_days:   hoursToDays(act.DurationHours),
      p6_sync_at:      new Date().toISOString(),
    }

    const isUpdate = existingMap.has(actId)
    const symbol   = isUpdate ? '↻' : '+'

    console.log(
      `  ${symbol} ${actId.padEnd(12)} ${(act.ActivityName ?? '').slice(0, 40).padEnd(40)}` +
      ` [${mapStatus(act.Status)}]${itrId ? ' → ITR linked' : ''}`,
    )

    if (!opts.dryRun) {
      const { error } = await supabase
        .from('work_plan_items')
        .upsert(itemPayload, { onConflict: 'p6_activity_id' })

      if (error) {
        result.errors.push(`${actId}: ${error.message}`)
        result.skipped++
        continue
      }

      // Publish domain event
      await supabase.from('domain_events').insert({
        org_id:         null,   // will be filled by service — best effort
        project_id:     opts.projectId,
        aggregate_type: 'work_plan_item',
        aggregate_id:   workPlanId,
        event_type:     'p6.activity_synced',
        payload: {
          p6_activity_id: actId,
          activity_name:  act.ActivityName,
          status:         mapStatus(act.Status),
          itr_linked:     !!itrId,
        },
        actor_id: null,
      })
    }

    result.upserted++
  }

  return result
}

// ── CLI entry point ───────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    file:         { type: 'string' },
    'project-id': { type: 'string' },
    'api-key':    { type: 'string' },
    'dry-run':    { type: 'boolean', default: false },
    'base-url':   { type: 'string', default: 'https://commup.app/api/v1' },
    help:         { type: 'boolean', default: false },
  },
  strict: false,
})

if (values.help || !values.file || !values['project-id'] || !values['api-key']) {
  console.log(`
CommUp — P6 Activity Sync (POC) — Stage 13.4

USAGE:
  npx ts-node scripts/p6-connector/p6-sync.ts \\
    --file       <path/to/activities.json> \\
    --project-id <commup-project-uuid> \\
    --api-key    <sk_live_...> \\
    [--dry-run] \\
    [--base-url  https://commup.app/api/v1]

ENV VARS (for direct DB upsert):
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

JSON INPUT FORMAT:
  Array of P6 Activity objects with fields:
    ActivityId, ActivityName, WBSCode?, PlannedStartDate?, PlannedFinishDate?,
    ActualStartDate?, ActualFinishDate?, DurationHours?, Status?, TagNumber?
`)
  process.exit(values.help ? 0 : 1)
}

sync({
  file:      String(values.file!),
  projectId: String(values['project-id']!),
  apiKey:    String(values['api-key']!),
  dryRun:    Boolean(values['dry-run'] ?? false),
  baseUrl:   values['base-url'] ? String(values['base-url']) : undefined,
})
  .then(result => {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Sync ${result.dryRun ? '(DRY RUN) ' : ''}complete
 Upserted : ${result.upserted}
 Skipped  : ${result.skipped}
 Errors   : ${result.errors.length}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    if (result.errors.length > 0) {
      console.error('\nErrors:')
      result.errors.forEach(e => console.error(' •', e))
    }
    process.exit(result.errors.length > 0 ? 1 : 0)
  })
  .catch(err => {
    console.error('\n❌ Fatal error:', err.message)
    process.exit(1)
  })
