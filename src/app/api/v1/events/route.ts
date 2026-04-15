/**
 * GET /api/v1/events — Stream domain_events for a project (audit log)
 *
 * Required scope: events:read
 * Useful for: P6 polling, SAP sync, external dashboards
 *
 * Query params:
 *   project_id    required
 *   since         ISO timestamp — events after this date (default: 24h ago)
 *   aggregate_type  tag | itr | punch | certificate | preservation
 *   event_type    specific event (e.g. punch.created, itr.approved)
 *   limit         max 200
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateApiKey, apiHeaders } from '@/lib/api/auth'

export const runtime = 'edge'

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: apiHeaders() })
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, ['events:read'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const projectId     = searchParams.get('project_id')
  const since         = searchParams.get('since') ?? new Date(Date.now() - 86_400_000).toISOString()
  const aggregateType = searchParams.get('aggregate_type')
  const eventType     = searchParams.get('event_type')
  const limit         = Math.min(parseInt(searchParams.get('limit') ?? '200'), 200)

  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400, headers: apiHeaders() })
  }

  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects').select('id').eq('id', projectId).eq('org_id', auth.orgId).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: apiHeaders() })

  let query = admin
    .from('domain_events')
    .select('id, aggregate_type, aggregate_id, event_type, payload, occurred_at')
    .eq('project_id', projectId)
    .eq('org_id', auth.orgId)
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: true })
    .limit(limit)

  if (aggregateType) query = query.eq('aggregate_type', aggregateType)
  if (eventType)     query = query.eq('event_type', eventType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: apiHeaders() })

  return NextResponse.json(
    {
      data:       data ?? [],
      meta: {
        since,
        limit,
        count:     (data ?? []).length,
        next_since: (data ?? []).length > 0
          ? data![data!.length - 1].occurred_at
          : since,
      },
    },
    { headers: apiHeaders() },
  )
}
