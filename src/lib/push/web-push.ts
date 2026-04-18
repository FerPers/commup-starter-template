/**
 * CommUp — Web Push helper (Workers / Edge compatible)
 *
 * Implementación mínima de:
 *   - VAPID ES256 JWT (RFC 8292)
 *   - Cifrado de payload aes128gcm (RFC 8188 + RFC 8291)
 *
 * Variables de entorno requeridas:
 *   VAPID_PUBLIC_KEY        base64url, P-256 65 bytes uncompressed
 *   VAPID_PRIVATE_KEY       base64url, raw 32 bytes
 *   VAPID_SUBJECT           "mailto:..." o URL del servicio
 *
 * Genera el par localmente:
 *   npx web-push generate-vapid-keys
 *
 * El cliente debe usar VAPID_PUBLIC_KEY (NEXT_PUBLIC_VAPID_PUBLIC_KEY).
 */

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:noreply@commup.app'

// ── Base64url helpers ─────────────────────────────────────────────────
function b64uEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function b64uDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.byteLength }
  return out
}

// ── Import VAPID keys ─────────────────────────────────────────────────
async function importVapidPrivate(): Promise<CryptoKey> {
  const d = b64uDecode(VAPID_PRIVATE)
  const pub = b64uDecode(VAPID_PUBLIC) // 65 bytes, 0x04 || X || Y
  if (pub[0] !== 0x04 || pub.byteLength !== 65) {
    throw new Error('VAPID_PUBLIC_KEY must be 65-byte uncompressed P-256 (base64url)')
  }
  const x = pub.slice(1, 33)
  const y = pub.slice(33, 65)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: b64uEncode(d),
    x: b64uEncode(x),
    y: b64uEncode(y),
    ext: true,
  }
  return crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  )
}

// ── Build VAPID JWT (ES256) ───────────────────────────────────────────
async function buildVapidAuthHeader(audience: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12h
    sub: VAPID_SUBJECT,
  }
  const enc = (o: object) => b64uEncode(new TextEncoder().encode(JSON.stringify(o)))
  const signingInput = `${enc(header)}.${enc(payload)}`

  const key = await importVapidPrivate()
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  )
  const jwt = `${signingInput}.${b64uEncode(sig)}`
  return `vapid t=${jwt}, k=${VAPID_PUBLIC}`
}

// ── HKDF (RFC 5869) ───────────────────────────────────────────────────
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    baseKey,
    length * 8,
  )
  return new Uint8Array(bits)
}

// ── Encrypt payload (aes128gcm — RFC 8188/8291) ──────────────────────
async function encryptAes128Gcm(opts: {
  payload: Uint8Array
  recipientP256dh: Uint8Array
  recipientAuth: Uint8Array
}): Promise<Uint8Array> {
  // 1) Ephemeral keypair
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveBits'],
  ) as CryptoKeyPair

  const ephPubJwk = await crypto.subtle.exportKey('jwk', ephemeral.publicKey)
  const ephPubRaw = concatBytes(
    new Uint8Array([0x04]),
    b64uDecode(ephPubJwk.x!),
    b64uDecode(ephPubJwk.y!),
  ) // 65 bytes

  // 2) Import recipient public key
  if (opts.recipientP256dh[0] !== 0x04 || opts.recipientP256dh.byteLength !== 65) {
    throw new Error('recipient p256dh must be 65-byte uncompressed point')
  }
  const recipJwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256',
    x: b64uEncode(opts.recipientP256dh.slice(1, 33)),
    y: b64uEncode(opts.recipientP256dh.slice(33, 65)),
    ext: true,
  }
  const recipPub = await crypto.subtle.importKey(
    'jwk', recipJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, [],
  )

  // 3) ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipPub }, ephemeral.privateKey, 256,
  )
  const sharedSecret = new Uint8Array(sharedBits)

  // 4) PRK_key = HKDF(salt=auth, ikm=sharedSecret, info="WebPush: info\x00"||recipPub||ephPub, 32)
  const keyInfo = concatBytes(
    new TextEncoder().encode('WebPush: info\0'),
    opts.recipientP256dh,
    ephPubRaw,
  )
  const ikm = await hkdf(opts.recipientAuth, sharedSecret, keyInfo, 32)

  // 5) salt aleatorio
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // 6) CEK = HKDF(salt, ikm, "Content-Encoding: aes128gcm\x00", 16)
  const cek = await hkdf(
    salt, ikm,
    new TextEncoder().encode('Content-Encoding: aes128gcm\0'),
    16,
  )
  // 7) Nonce = HKDF(salt, ikm, "Content-Encoding: nonce\x00", 12)
  const nonce = await hkdf(
    salt, ikm,
    new TextEncoder().encode('Content-Encoding: nonce\0'),
    12,
  )

  // 8) Plaintext = payload || 0x02 (último record)
  const plaintext = concatBytes(opts.payload, new Uint8Array([0x02]))

  // 9) Cifrar AES-128-GCM
  const cekKey = await crypto.subtle.importKey('raw', cek as BufferSource, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource }, cekKey, plaintext as BufferSource,
  )
  const ciphertext = new Uint8Array(ciphertextBuf)

  // 10) Header binario: salt(16) || rs(4 BE) || idlen(1) || keyid (=ephPubRaw)
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096, false) // record size 4096
  const idlen = new Uint8Array([ephPubRaw.byteLength]) // 65

  return concatBytes(salt, rs, idlen, ephPubRaw, ciphertext)
}

// ── Public sender ─────────────────────────────────────────────────────
export type SendResult = { ok: boolean; status: number; body?: string }

export async function sendWebPush(args: {
  endpoint: string
  p256dh: string      // base64url
  auth: string        // base64url
  payload: string
  ttl?: number
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
}): Promise<SendResult> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return { ok: false, status: 500, body: 'VAPID keys not configured' }
  }

  const audience = new URL(args.endpoint).origin
  const authHeader = await buildVapidAuthHeader(audience)

  const body = await encryptAes128Gcm({
    payload: new TextEncoder().encode(args.payload),
    recipientP256dh: b64uDecode(args.p256dh),
    recipientAuth: b64uDecode(args.auth),
  })

  const res = await fetch(args.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': String(args.ttl ?? 60),
      'Urgency': args.urgency ?? 'normal',
    },
    body: body as BodyInit,
  })

  let text = ''
  try { text = await res.text() } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body: text }
}
