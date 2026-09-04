'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { Button, Input, Card } from '@/components/ui'

export default function LoginPage() {
  const router = useRouter()
  const t = useTranslations('Login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(t('error'))
      setLoading(false)
      return
    }

    router.push('/home')
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--gray-100)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
    }}>
      {/* Language selector — top right */}
      <div style={{
        position: 'absolute', top: 20, right: 24,
        background: 'var(--card-bg)',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid var(--border)',
        padding: '4px 10px',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <LocaleSwitcher variant="light" />
      </div>

      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo & Brand */}
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
            {t('title')}
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 'var(--text-base)' }}>
            {t('subtitle')}
          </p>
        </div>

        {/* Card */}
        <Card padding="lg" elevation="md" style={{ borderRadius: 20 }}>
          <h2 style={{
            fontSize: 'var(--text-lg)', fontWeight: 700,
            color: 'var(--text-strong)', marginBottom: 6,
          }}>
            {t('heading')}
          </h2>
          <p style={{
            color: 'var(--text-muted)', fontSize: 'var(--text-base)', marginBottom: 28,
          }}>
            {t('description')}
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Email */}
            <div>
              <label htmlFor="login-email" style={{
                display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600,
                color: 'var(--gray-700)', marginBottom: 7,
              }}>
                {t('email')}
              </label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder={t('emailPlaceholder')}
                inputSize="lg"
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" style={{
                display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600,
                color: 'var(--gray-700)', marginBottom: 7,
              }}>
                {t('password')}
              </label>
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={t('passwordPlaceholder')}
                inputSize="lg"
                autoComplete="current-password"
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: 4, color: 'var(--gray-400)',
                      display: 'inline-flex', alignItems: 'center',
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />
            </div>

            <div style={{ textAlign: 'right', marginTop: -8 }}>
              <a href="/forgot-password" style={{
                fontSize: 'var(--text-sm)', color: 'var(--primary-500)',
                fontWeight: 600, textDecoration: 'none',
              }}>
                {t('forgotPassword')}
              </a>
            </div>

            {/* Error */}
            {error && (
              <div role="alert" style={{
                padding: '12px 16px', borderRadius: 'var(--radius-md)',
                background: 'var(--danger-50)',
                border: '1px solid var(--danger-500)',
                color: 'var(--danger-700)',
                fontSize: 'var(--text-base)', fontWeight: 500,
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
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
                boxShadow: loading ? 'none' : '0 4px 16px rgba(59,130,246,0.4)',
              }}
            >
              {loading ? t('loading') : t('submit')}
            </Button>
          </form>
        </Card>

        <p style={{
          textAlign: 'center', marginTop: 20,
          color: 'var(--gray-400)', fontSize: 'var(--text-sm)',
        }}>
          {t('footer')}
        </p>
      </div>
    </div>
  )
}
