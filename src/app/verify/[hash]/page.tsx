import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadSigningKey, toBase64 } from '@/lib/handover/sign'
import { formatInZone } from '@/lib/time/zone'
import VerifyFiles from './VerifyFiles'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Verificar paquete de handover', robots: { index: false, follow: false } }

type Verified = {
  package_id: string
  status: string
  version: string | null
  generated_at: string
  organization: string
  project_code: string
  project_name: string
  systems: string[]
  signature_alg: string
  signature: string | null
  key_id: string | null
  files: { path: string; sha256: string; bytes: number }[]
}

const card: React.CSSProperties = { background: 'var(--surface, #fff)', border: '1px solid var(--gray-200, #e2e8f0)', borderRadius: 12, padding: 20 }
const muted: React.CSSProperties = { color: 'var(--gray-500, #64748b)', fontSize: 13 }
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, wordBreak: 'break-all' }

/** Verificación pública de un paquete de handover por su hash (S24, E-31). Solo metadatos, nunca el contenido. */
export default async function VerifyPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params
  const t = await getTranslations('HandoverVerify')
  const locale = await getLocale()
  const valid = /^[0-9a-f]{64}$/.test(hash)
  // Página pública: la RPC es solo service_role (A-19) y devuelve metadatos, nunca el contenido del paquete.
  const admin = createAdminClient()
  const [{ data }, key] = await Promise.all([
    valid ? admin.rpc('verify_handover_package', { p_hash: hash }) : Promise.resolve({ data: null }),
    loadSigningKey().catch(() => null),
  ])
  const pkg = data as unknown as Verified | null
  const ed = pkg?.signature_alg === 'ed25519'
  const sameKey = !!(ed && key && pkg?.key_id === key.keyId)

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '32px 16px', display: 'grid', gap: 16 }}>
      <div>
        <Link href="/" style={{ fontWeight: 800, color: 'var(--primary-600, #7c3aed)', textDecoration: 'none' }}>CommUp</Link>
        <h1 style={{ margin: '8px 0 4px', fontSize: 22 }}>{t('title')}</h1>
        <div style={{ ...mono, ...muted }}>{hash}</div>
      </div>

      {!pkg ? (
        <section style={{ ...card, borderColor: 'var(--danger-200, #fecaca)', background: 'var(--danger-50, #fef2f2)' }}>
          <strong style={{ color: 'var(--danger-700, #b91c1c)' }}>{t('notFound')}</strong>
          <p style={{ ...muted, marginBottom: 0 }}>{t('notFoundHint')}</p>
        </section>
      ) : (
        <>
          <section style={{ ...card, borderColor: 'var(--success-200, #bbf7d0)', background: 'var(--success-50, #f0fdf4)' }}>
            <strong style={{ color: 'var(--success-700, #15803d)' }}>{t('found')}</strong>
            <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', margin: '12px 0 0', fontSize: 14 }}>
              <dt style={muted}>{t('organization')}</dt><dd style={{ margin: 0 }}>{pkg.organization}</dd>
              <dt style={muted}>{t('project')}</dt><dd style={{ margin: 0 }}>{pkg.project_code} — {pkg.project_name}</dd>
              <dt style={muted}>{t('systems')}</dt><dd style={{ margin: 0 }}>{pkg.systems.join(', ') || '—'}</dd>
              <dt style={muted}>{t('generated')}</dt><dd style={{ margin: 0 }}>{formatInZone(pkg.generated_at, 'UTC', locale)}</dd>
              <dt style={muted}>{t('version')}</dt><dd style={{ margin: 0 }}>{pkg.version ?? '—'}</dd>
              <dt style={muted}>{t('signature')}</dt>
              <dd style={{ margin: 0 }}>
                {ed ? t('ed25519', { key: pkg.key_id ?? '—' }) : t('hmac')}
                {ed && key && !sameKey && <div style={muted}>{t('rotated')}</div>}
              </dd>
            </dl>
          </section>

          {ed && (
            <section style={card}>
              <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>{t('filesTitle')}</h2>
              <p style={{ ...muted, marginTop: 0 }}>{t('filesHint')}</p>
              <VerifyFiles
                files={pkg.files}
                signature={pkg.signature}
                publicKey={sameKey && key ? toBase64(key.publicKey) : null}
              />
              <p style={{ ...muted, marginBottom: 0 }}>
                {t('offline')} <a href="/api/v1/handover/public-key?format=pem">{t('publicKey')}</a>
              </p>
            </section>
          )}
        </>
      )}
    </main>
  )
}
