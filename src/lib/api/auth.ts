/**
 * CommUp Public API — API Key Authentication Middleware
 * Stage 13.1
 *
 * Usage in a route handler:
 *   const auth = await authenticateApiKey(req, ['tags:read'])
 *   if (!auth.ok) return auth.response
 *   // auth.orgId, auth.keyId, auth.scopes are available
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Types ────────────────────────────────────────────────────────────────────

export type ApiScope =
  | 'tags:read'   | 'tags:write'
  | 'itrs:read'   | 'itrs:write'
  | 'punches:read'| 'punches:write'
  | 'certificates:read'
  | 'systems:read'
  | 'events:read'
  | 'handover:read' | 'handover:write'
  | 'signals:read'  | 'signals:write'
  | '*'           // superscope — grants everything

export type AuthOk = {
  ok: true
  orgId: string
  keyId: string
  projectId: string | null  // null = all projects in org
  scopes: ApiScope[]
}

export type AuthFail = {
  ok: false
  response: NextResponse
}

export type AuthResult = AuthOk | AuthFail

// ── sha256 helper (edge-compatible, Web Crypto API) ──────────────────────────

async function sha256hex(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── HMAC-SHA256 for webhook signing ─────────────────────────────────────────

export async function hmacSha256(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── scope check helper ───────────────────────────────────────────────────────

export function hasScope(scopes: ApiScope[], required: ApiScope): boolean {
  return scopes.includes('*') || scopes.includes(required)
}

// ── Main auth function ───────────────────────────────────────────────────────

export async function authenticateApiKey(
  req: NextRequest,
  requiredScopes: ApiScope[] = [],
): Promise<AuthResult> {
  // 1. Extract Bearer token
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (!token) {
    return fail(401, 'Missing Authorization header. Use: Authorization: Bearer sk_live_...')
  }

  // 2. Hash the token — never store raw keys
  const hash = await sha256hex(token)

  // 3. Look up in api_keys (admin client bypasses RLS)
  const admin = createAdminClient()
  const { data: key, error } = await admin
    .from('api_keys')
    .select('id, org_id, scopes, expires_at, revoked_at')
    .eq('key_hash', hash)
    .maybeSingle()

  if (error || !key) {
    return fail(401, 'Invalid API key')
  }

  // 4. Check revoked / expired
  if (key.revoked_at) {
    return fail(401, 'API key has been revoked')
  }
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return fail(401, 'API key has expired')
  }

  // 5. Check required scopes
  const scopes = (key.scopes ?? []) as ApiScope[]
  for (const required of requiredScopes) {
    if (!hasScope(scopes, required)) {
      return fail(403, `API key missing required scope: ${required}`)
    }
  }

  // 6. Update last_used_at async (fire-and-forget — don't block the request)
  admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', key.id)
    .then(() => {})

  return {
    ok: true,
    orgId: key.org_id,
    keyId: key.id,
    projectId: null,
    scopes,
  }
}

// ── Error response helper ────────────────────────────────────────────────────

function fail(status: number, message: string): AuthFail {
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: message,
        docs: 'https://docs.commup.app/api',
      },
      {
        status,
        headers: {
          'Content-Type': 'application/json',
          'X-CommUp-Version': '1',
        },
      },
    ),
  }
}

// ── Pagination helper ────────────────────────────────────────────────────────

export function parsePagination(req: NextRequest): { limit: number; offset: number } {
  const { searchParams } = new URL(req.url)
  const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '100'), 500)
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0'),   0)
  return { limit: isNaN(limit) ? 100 : limit, offset: isNaN(offset) ? 0 : offset }
}

// ── Standard API response headers ────────────────────────────────────────────

export function apiHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-CommUp-Version': '1',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  }
}
