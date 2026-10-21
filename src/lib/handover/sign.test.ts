import { describe, expect, it } from 'vitest'
import { createPublicKey, verify as nodeVerify } from 'node:crypto'
import { fromBase64, loadSigningKey, publicKeyPem, sha256Hex, signBytes, toBase64, verifyBytes } from './sign'

async function newSecret(): Promise<string> {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair
  return toBase64(new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey)))
}

describe('firma Ed25519 del handover (S24, E-31)', () => {
  it('sin secreto no hay clave', async () => {
    expect(await loadSigningKey('')).toBeNull()
  })

  it('firma y verifica; un byte cambiado invalida la firma', async () => {
    const key = (await loadSigningKey(await newSecret()))!
    expect(key.keyId).toMatch(/^[0-9a-f]{16}$/)
    expect(key.publicKey).toHaveLength(32)
    const data = new TextEncoder().encode('{"files":[]}')
    const sig = await signBytes(key, data)
    expect(await verifyBytes(key.publicKey, sig, data)).toBe(true)
    expect(await verifyBytes(key.publicKey, sig, new TextEncoder().encode('{"files":[1]}'))).toBe(false)
  })

  it('el PEM publicado verifica con OpenSSL (node:crypto)', async () => {
    const key = (await loadSigningKey(await newSecret()))!
    const data = new TextEncoder().encode('manifest')
    const sig = await signBytes(key, data)
    const pub = createPublicKey(publicKeyPem(key.publicKey))
    expect(nodeVerify(null, data, pub, Buffer.from(fromBase64(sig)))).toBe(true)
  })

  it('sha256 hex estable', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
