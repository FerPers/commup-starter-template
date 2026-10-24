import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { apiHeaders } from './auth'

/**
 * A05 (revisión 2026-10-23 hallazgo 11): la API v1 valida en tiempo de ejecución lo que entra. Antes el tipado de
 * TypeScript no protegía nada: `null`, arreglos o números donde se esperaba otra cosa terminaban en un 500.
 * Contrato uniforme:
 *   400 = JSON ilegible, o parámetro de ruta / consulta inválido;
 *   413 = cuerpo o colección por encima del límite;
 *   422 = JSON legible con forma equivocada (`issues` dice qué campo y por qué).
 */

/** Tope de un cuerpo JSON de la API (la ingesta de muestras declara el suyo). */
export const MAX_JSON_BYTES = 256 * 1024
/** Máximo de `issues` que se devuelven en un 422. */
const MAX_ISSUES = 20

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

type Issue = { path: string; message: string }

export function apiInvalid(status: 400 | 413 | 422, error: string, issues?: Issue[]): NextResponse {
  return NextResponse.json(issues?.length ? { error, issues } : { error }, { status, headers: apiHeaders() })
}

function toIssues(error: z.ZodError): Issue[] {
  return error.issues.slice(0, MAX_ISSUES).map(i => ({ path: i.path.map(String).join('.') || '(body)', message: i.message }))
}

/** Lee y valida el cuerpo JSON. Nunca lanza: todo error de entrada sale como 400/413/422. */
export async function readJson<S extends z.ZodType>(req: NextRequest, schema: S, maxBytes = MAX_JSON_BYTES): Promise<Parsed<z.infer<S>>> {
  const declared = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, response: apiInvalid(413, `Body too large (max ${maxBytes} bytes)`) }
  let text: string
  try { text = await req.text() } catch { return { ok: false, response: apiInvalid(400, 'Invalid JSON body') } }
  if (new TextEncoder().encode(text).length > maxBytes) return { ok: false, response: apiInvalid(413, `Body too large (max ${maxBytes} bytes)`) }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, response: apiInvalid(400, 'Invalid JSON body') } }
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }
  // Una colección por encima de su tope es «demasiado grande», no «forma equivocada».
  const tooMany = parsed.error.issues.find(i => i.code === 'too_big' && i.origin === 'array')
  if (tooMany) return { ok: false, response: apiInvalid(413, 'Too many items', toIssues(parsed.error)) }
  return { ok: false, response: apiInvalid(422, 'Invalid request body', toIssues(parsed.error)) }
}

/** Valida los parámetros de consulta (todos llegan como texto; ausente = undefined). */
export function readQuery<S extends z.ZodType>(req: NextRequest, schema: S): Parsed<z.infer<S>> {
  const raw = Object.fromEntries(new URL(req.url).searchParams.entries())
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }
  return { ok: false, response: apiInvalid(400, 'Invalid query parameters', toIssues(parsed.error)) }
}

/** Id de la ruta (`/punches/[id]/…`): un texto que no es UUID es 400, no un error de Postgres. */
export function readId(id: string): Parsed<string> {
  return z.guid().safeParse(id).success ? { ok: true, data: id } : { ok: false, response: apiInvalid(400, 'Invalid id: expected a UUID') }
}
