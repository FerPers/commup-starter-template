/**
 * GET /api/v1/handover/public-key — clave pública Ed25519 con la que se firman los paquetes de handover (S24, E-31).
 * Pública y sin autenticación: es lo que la operadora usa para verificar manifest.sig por su cuenta.
 * `?format=pem` devuelve el PEM (SPKI) para `openssl pkeyutl -verify`.
 */

import { loadSigningKey, publicKeyPem, toBase64 } from '@/lib/handover/sign'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const key = await loadSigningKey()
  if (!key) return Response.json({ error: 'signing key not configured' }, { status: 503 })
  const pem = publicKeyPem(key.publicKey)
  if (new URL(req.url).searchParams.get('format') === 'pem') {
    return new Response(pem, {
      headers: {
        'Content-Type': 'application/x-pem-file',
        'Content-Disposition': `inline; filename="commup-handover-${key.keyId}.pem"`,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  }
  return Response.json(
    { alg: 'Ed25519', key_id: key.keyId, public_key: toBase64(key.publicKey), pem },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  )
}
