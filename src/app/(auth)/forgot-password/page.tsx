'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button, Input, Card } from '@/components/ui'

export default function ForgotPasswordPage() {
  const t = useTranslations('AuthFlow')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    // Respuesta idéntica exista o no el correo — evita enumeración de cuentas
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/set-password`,
    })
    setSent(true)
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--gray-100)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/isotipo-color.png"
            alt="CommUp"
            style={{ display: 'block', height: 64, width: 'auto', margin: '0 auto 14px' }}
          />
          <h1 style={{
            fontSize: 28, fontWeight: 700, color: 'var(--text-strong)',
            letterSpacing: '-0.5px', margin: 0,
          }}>
            CommUp
          </h1>
        </div>

        <Card padding="lg" elevation="md" style={{ borderRadius: 20 }}>
          <h2 style={{
            fontSize: 'var(--text-lg)', fontWeight: 700,
            color: 'var(--text-strong)', marginBottom: 6,
          }}>
            {t('forgotTitle')}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)', marginBottom: 28 }}>
            {t('forgotDesc')}
          </p>

          {sent ? (
            <div style={{
              padding: '14px 16px', borderRadius: 'var(--radius-md)',
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              color: '#166534', fontSize: 'var(--text-base)', fontWeight: 500,
            }}>
              {t('sentMsg')}
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label htmlFor="forgot-email" style={{
                  display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600,
                  color: 'var(--gray-700)', marginBottom: 7,
                }}>
                  {t('emailLabel')}
                </label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder={t('emailPlaceholder')}
                  inputSize="lg"
                  autoComplete="email"
                />
              </div>

              <Button
                type="submit"
                size="lg"
                variant="primary"
                loading={loading}
                fullWidth
                style={{
                  marginTop: 4,
                  background: loading
                    ? 'var(--primary-300)'
                    : 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                }}
              >
                {loading ? t('sending') : t('sendBtn')}
              </Button>
            </form>
          )}

          <p style={{ textAlign: 'center', margin: '20px 0 0' }}>
            <a href="/login" style={{ color: 'var(--primary-500)', fontSize: 'var(--text-sm)', fontWeight: 600, textDecoration: 'none' }}>
              {t('backToLogin')}
            </a>
          </p>
        </Card>
      </div>
    </div>
  )
}
