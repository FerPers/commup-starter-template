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
 *     "samples": [
 *       { "signal_name": "PT-3001.PV", "sampled_at": "ISO-8601", "value": 48.7, "quality": 0 },
 *       ...
 *     ]
 *   }
 *
 * Response 200:
 *   { data: { batch_id, accepted, rejected, total, errors[], idempotent_replay } }
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders } from '@/lib/api/auth'

const MAX_SAMPLES_PER_BATCH = 5000

type Sample = {
  signal_name: string
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

  let body: { source?: string; source_system?: string; batch_id?: string; samples?: Sample[] }
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
    if (!s.signal_name || !s.sampled_at) {
      return NextResponse.json(
        { error: 'Each sample requires signal_name and sampled_at' },
        { status: 422, headers: apiHeaders() },
      )
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('ingest_signal_samples', {
    p_org_id:          auth.orgId,
    p_source:          source,
    // los args text del RPC aceptan SQL NULL aunque el tipo generado diga string
    p_source_system:   sourceSystem as unknown as string,
    p_idempotency_key: batchKey as unknown as string,
    p_api_key_id:      auth.keyId,
    p_samples:         samples,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: apiHeaders() })
  }

  const result = data as {
    batch_id: string
    accepted: number
    rejected: number
    total:    number
    errors:   { signal_name: string; reason: string }[]
    idempotent_replay: boolean
  }

  const status = result.rejected > 0 ? 207 : 200
  return NextResponse.json({ data: result }, { status, headers: apiHeaders() })
}
