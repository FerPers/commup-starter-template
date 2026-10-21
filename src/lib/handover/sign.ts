/**
 * Firma asimétrica del paquete de handover (S24, E-31). Ed25519 por WebCrypto (Workers y Node 22+).
 *
 * El secreto `HANDOVER_ED25519_PRIVATE_KEY` es la clave privada PKCS#8 en base64. La pública se deriva de ella
 * (JWK `x`) y se publica en `/api/v1/handover/public-key`; `key_id` = primeros 16 hex del sha256 de la pública,
 * para poder rotar la clave sin invalidar los paquetes ya emitidos.
 */

const enc = new TextEncoder()

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data
  return toHex(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
}

export type SigningKey = { privateKey: CryptoKey; publicKey: Uint8Array; keyId: string }

let cached: { secret: string; key: SigningKey } | null = null

/** Clave de firma desde el entorno; `null` si falta el secreto. */
export async function loadSigningKey(secret = process.env.HANDOVER_ED25519_PRIVATE_KEY): Promise<SigningKey | null> {
  if (!secret) return null
  if (cached?.secret === secret) return cached.key
  const privateKey = await crypto.subtle.importKey('pkcs8', fromBase64(secret) as BufferSource, { name: 'Ed25519' }, true, ['sign'])
  const jwk = await crypto.subtle.exportKey('jwk', privateKey)
  if (!jwk.x) throw new Error('HANDOVER_ED25519_PRIVATE_KEY no es una clave Ed25519 válida')
  const publicKey = fromBase64(jwk.x)
  const key = { privateKey, publicKey, keyId: (await sha256Hex(publicKey)).slice(0, 16) }
  cached = { secret, key }
  return key
}

export async function signBytes(key: SigningKey, data: Uint8Array): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key.privateKey, data as BufferSource)))
}

export async function verifyBytes(publicKey: Uint8Array, signatureB64: string, data: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', publicKey as BufferSource, { name: 'Ed25519' }, false, ['verify'])
  return crypto.subtle.verify({ name: 'Ed25519' }, key, fromBase64(signatureB64) as BufferSource, data as BufferSource)
}

/** Clave pública en PEM (SPKI), para `openssl pkeyutl -verify`. */
export function publicKeyPem(publicKey: Uint8Array): string {
  // SPKI de Ed25519 = prefijo DER fijo de 12 bytes + 32 bytes de la clave.
  const der = new Uint8Array([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00, ...publicKey])
  return `-----BEGIN PUBLIC KEY-----\n${toBase64(der)}\n-----END PUBLIC KEY-----\n`
}
