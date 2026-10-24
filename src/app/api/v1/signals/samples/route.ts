/**
 * POST /api/v1/signals/samples — Bulk IIoT signal sample ingestion.
 *
 * Required scope: signals:write
 *
 * Body:
 *   {
 *     "source":        "PI" | "OPC_UA" | "MODBUS" | "MQTT" | "MANUAL",
 *     "source_system": "ALPHA-PI",        // optional free-text identifier
 *     "batch_id":      "uuid",            // optional client-supplied idempotency key
 *     "project_code":  "DEMO-GLP",        // optional (S12): resolve signal names inside this project
 *     "upsert":        false,             // optional (S12): true overwrites an existing sample (corrections)
 *     "samples": [
 *       { "signal_name": "PT-3001.PV", "sampled_at": "ISO-8601", "value": 48.7, "quality": 0 },
 *       { "signal_id": "uuid", "sampled_at": "ISO-8601", "value": 12.1 },
 *       ...
 *     ]
 *   }
 *
 * Each sample is validated on its own (S12, E-24): an invalid one is rejected with a reason in errors[]
 * (invalid_timestamp, invalid_value — NaN/Infinity —, invalid_quality, future_timestamp — more than 5 min
 * ahead —, too_old — beyond the 90-day retention —, signal_not_registered, ambiguous_signal — the name exists
 * in more than one project of the org: send project_code or signal_id).
 *
 * Response 200 (all accepted) / 207 (some rejected):
 *   { data: { batch_id, accepted, rejected, duplicates, total, errors[], idempotent_replay } }
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders } from '@/lib/api/auth'
import { sqlArg } from '@/lib/supabase/casts'

const MAX_SAMPLES_PER_BATCH = 5000

type Sample = {
  signal_name?: string
  signal_id?:   string
  sampled_at:  string
  value:       number | null
  quality?:    number
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['signals:write'])
  if (!auth.ok) return auth.response

  let body: { source?: string; source_system?: string; batch_id?: string; project_code?: string; upsert?: boolean; samples?: Sample[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: apiHeaders() })
  }

  const source       = body.source ?? 'MANUAL'
  const sourceSystem = body.source_system ?? null
  const batchKey     = body.batch_id ?? null
  const samples      = Array.isArray(body.samples) ? body.samples : []

  if (samples.length === 0) {
    return NextResponse.json({ error: 'samples[] must not be empty' }, { status: 422, headers: apiHeaders() })
  }
  if (samples.length > MAX_SAMPLES_PER_BATCH) {
    return NextResponse.json(
      { error: `Too many samples in one batch (max ${MAX_SAMPLES_PER_BATCH})` },
      { status: 413, headers: apiHeaders() },
    )
  }

  // Basic shape validation — keep cheap, let the SQL do the heavy lifting
  for (const s of samples) {
    if (!s || (!s.signal_name && !s.signal_id) || !s.sampled_at) {
      return NextResponse.json(
        { error: 'Each sample requires signal_name (or signal_id) and sampled_at' },
        { status: 422, headers: apiHeaders() },
      )
    }
  }

  const admin = createAdminClient()

  // S12 (E-04): con project_code las señales se buscan dentro de ese proyecto de la org de la key.
  let projectId: string | null = null
  if (body.project_code) {
    const { data: project } = await admin.from('projects').select('id')
      .eq('org_id', auth.orgId).eq('code', String(body.project_code)).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Unknown project_code' }, { status: 422, headers: apiHeaders() })
    projectId = project.id
  }

  const { data, error } = await admin.rpc('ingest_signal_samples', {
    p_org_id:          auth.orgId,
    p_source:          source,
    // los args text del RPC aceptan SQL NULL aunque el tipo generado diga string
    p_source_system:   sqlArg<string>(sourceSystem),
    p_idempotency_key: sqlArg<string>(batchKey),
    p_api_key_id:      auth.keyId,
    p_samples:         samples,
    p_project_id:      sqlArg<string>(projectId),
    p_upsert:          body.upsert === true,
  })

  if (error) {
    // S12 (E-24): sin detalles internos de Postgres hacia el cliente.
    console.error('[api/v1/signals/samples]', error)
    return NextResponse.json({ error: 'The batch could not be ingested' }, { status: 500, headers: apiHeaders() })
  }

  const result = data as {
    batch_id: string
    accepted: number
    rejected: number
    duplicates?: number
    total:    number
    errors:   { index: number; signal_name: string | null; reason: string }[]
    idempotent_replay: boolean
  }

  const status = result.rejected > 0 ? 207 : 200
  return NextResponse.json({ data: result }, { status, headers: apiHeaders() })
}
