import { describe, expect, it } from 'vitest'
import { isAllowedPushEndpoint } from './endpoint'

describe('isAllowedPushEndpoint (A-23)', () => {
  it('acepta los servicios push de los navegadores', () => {
    for (const ok of [
      'https://fcm.googleapis.com/fcm/send/abc:123',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAA',
      'https://web.push.apple.com/QGx',
      'https://wns2-par02p.notify.windows.com/w/?token=x',
    ]) expect(isAllowedPushEndpoint(ok)).toBe(true)
  })
  it('rechaza cualquier otro destino', () => {
    for (const bad of [
      'http://fcm.googleapis.com/fcm/send/x', 'https://evil.tld/x', 'https://fcm.googleapis.com.evil.tld/x',
      'https://evilpush.apple.com.attacker.io/', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x',
      'https://169.254.169.254/latest', 'not a url', 42, null,
    ]) expect(isAllowedPushEndpoint(bad)).toBe(false)
  })
})
