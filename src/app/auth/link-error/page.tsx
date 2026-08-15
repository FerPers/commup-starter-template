import { getTranslations } from 'next-intl/server'

export default async function LinkErrorPage() {
  const t = await getTranslations('AuthFlow')

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--gray-100)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 420, textAlign: 'center',
        background: 'var(--card-bg)', borderRadius: 20,
        border: '1px solid var(--border)', padding: '40px 32px',
        boxShadow: 'var(--shadow-md)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/isotipo-color.png"
          alt="CommUp"
          style={{ display: 'block', height: 56, width: 'auto', margin: '0 auto 20px' }}
        />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 8px' }}>
          {t('linkErrorTitle')}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)', margin: '0 0 24px' }}>
          {t('linkErrorDesc')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a href="/forgot-password" style={{
            display: 'block', padding: '11px 16px', borderRadius: 10,
            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
            color: '#fff', fontWeight: 700, fontSize: 'var(--text-base)', textDecoration: 'none',
          }}>
            {t('requestNew')}
          </a>
          <a href="/login" style={{
            display: 'block', padding: '11px 16px', borderRadius: 10,
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            color: 'var(--text-muted)', fontWeight: 600, fontSize: 'var(--text-base)', textDecoration: 'none',
          }}>
            {t('backToLogin')}
          </a>
        </div>
      </div>
    </div>
  )
}
