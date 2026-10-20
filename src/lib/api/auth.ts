/**
 * CommUp Public API — API Key Authentication Middleware
 * Stage 13.1
 *
 * Usage in a route handler:
 *   const auth = await authenticateApiKey(req, ['tags:read'])
 *   if (!auth.ok) return auth.response
 *   // auth.orgId, auth.keyId, auth.scopes are available
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isRateLimited } from './rate-limit'

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
    // S15 (A-13): frena la fuerza bruta de claves por IP.
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    if (await isRateLimited(`ip:${ip}`)) return fail(429, 'Too many requests')
    return fail(401, 'Invalid API key')
  }

  // 4. Check revoked / expired
  if (key.revoked_at) {
    return fail(401, 'API key has been revoked')
  }
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return fail(401, 'API key has expired')
  }

  // S15 (A-13): 600 peticiones por minuto por API key.
  if (await isRateLimited(`key:${key.id}`)) {
    const res = fail(429, 'Rate limit exceeded: 600 requests per minute per API key')
    res.response.headers.set('Retry-After', '60')
    return res
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

/** S15 (A-25): limit ∈ [1, 500] (antes un negativo pasaba), offset ≥ 0; valores no numéricos → por defecto. */
export function parsePagination(req: NextRequest): { limit: number; offset: number } {
  const { searchParams } = new URL(req.url)
  const rawLimit = parseInt(searchParams.get('limit') ?? '100', 10)
  const rawOffset = parseInt(searchParams.get('offset') ?? '0', 10)
  return {
    limit: Number.isNaN(rawLimit) ? 100 : Math.min(Math.max(rawLimit, 1), 500),
    offset: Number.isNaN(rawOffset) ? 0 : Math.max(rawOffset, 0),
  }
}

/**
 * S15 (A-25): error genérico con id de correlación; el detalle de Postgres va al log, no al integrador.
 */
export function apiDbError(status: number, error: { message: string; code?: string }): NextResponse {
  // Reglas de negocio de las RPC (P0001, 22xxx validación, 23xxx unicidad/FK, 42501 permiso) se informan tal cual;
  // el resto (esquema, SQL) se oculta tras un id de correlación.
  const code = error.code ?? ''
  if (/^(P0|22|23|42501)/.test(code)) {
    return NextResponse.json({ error: error.message, code }, { status: code === '42501' ? 403 : status === 500 ? 400 : status, headers: apiHeaders() })
  }
  return apiError(status === 400 ? 400 : 500, status === 400 ? 'Invalid request' : 'Internal error', error)
}

export function apiError(status: number, publicMessage: string, detail?: unknown): NextResponse {
  const id = crypto.randomUUID()
  if (detail) console.error(`[api v1] ${id}`, detail)
  return NextResponse.json({ error: publicMessage, request_id: id }, { status, headers: apiHeaders() })
}

// ── Standard API response headers ────────────────────────────────────────────

// CORS `*` is intentional for /api/v1: machine-to-machine API authenticated via
// `Authorization: Bearer <api_key>` (no cookies, no implicit credentials), so
// CSRF does not apply. Any browser origin is allowed to script against the API
// as long as it presents a valid key. Audited 2026-05-15 (SEC-002, F3).
export function apiHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-CommUp-Version': '1',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  }
}
