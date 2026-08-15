'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button, Input, Card } from '@/components/ui'

// Vive fuera del grupo (auth) a propósito: el invitado llega AUTENTICADO
// (sesión creada por el enlace del correo) y el layout de (auth) redirige
// a /dashboard a cualquier usuario con sesión.
export default function SetPasswordPage() {
  const router = useRouter()
  const t = useTranslations('AuthFlow')
  const [sessionState, setSessionState] = useState<'checking' | 'ready' | 'missing'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setSessionState('ready')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setSessionState('ready')
    })
    // Margen para que detectSessionInUrl consuma el #access_token del enlace
    const timer = setTimeout(() => {
      setSessionState(s => (s === 'checking' ? 'missing' : s))
    }, 3000)
    return () => { cancelled = true; sub.subscription.unsubscribe(); clearTimeout(timer) }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError(t('errTooShort')); return }
    if (password !== confirm) { setError(t('errMismatch')); return }
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(t('errUpdate'))
      setLoading(false)
      return
    }
    router.push('/dashboard')
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
          {sessionState === 'checking' && (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)', textAlign: 'center', margin: '12px 0' }}>
              {t('checking')}
            </p>
          )}

          {sessionState === 'missing' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text-strong)', fontWeight: 600, fontSize: 'var(--text-lg)', margin: '0 0 8px' }}>
                {t('noSession')}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)', margin: '0 0 20px' }}>
                {t('noSessionHint')}
              </p>
              <a href="/forgot-password" style={{ color: 'var(--primary-500)', fontSize: 'var(--text-base)', fontWeight: 600, textDecoration: 'none' }}>
                {t('requestNew')}
              </a>
            </div>
          )}

          {sessionState === 'ready' && (
            <>
              <h2 style={{
                fontSize: 'var(--text-lg)', fontWeight: 700,
                color: 'var(--text-strong)', marginBottom: 6,
              }}>
                {t('setTitle')}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-base)', marginBottom: 28 }}>
                {t('setDesc')}
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label htmlFor="new-password" style={{
                    display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600,
                    color: 'var(--gray-700)', marginBottom: 7,
                  }}>
                    {t('newPassword')}
                  </label>
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    inputSize="lg"
                    autoComplete="new-password"
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

                <div>
                  <label htmlFor="confirm-password" style={{
                    display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600,
                    color: 'var(--gray-700)', marginBottom: 7,
                  }}>
                    {t('confirmPassword')}
                  </label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    inputSize="lg"
                    autoComplete="new-password"
                  />
                </div>

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
                  {loading ? t('saving') : t('saveBtn')}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
