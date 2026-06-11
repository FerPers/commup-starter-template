'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { submitLead } from '@/app/actions/leads'

const PROJECT_TYPES = [
  { value: 'oil_gas', key: 'typeOilGas' },
  { value: 'lng', key: 'typeLng' },
  { value: 'renewables', key: 'typeRenewables' },
  { value: 'mining', key: 'typeMining' },
  { value: 'industrial', key: 'typeIndustrial' },
  { value: 'other', key: 'typeOther' },
] as const

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 10,
  padding: '13px 16px',
  fontSize: 15,
  color: '#f1f5f9',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

export default function LeadForm({ source }: { source: string }) {
  const t = useTranslations('Landing.leadForm')
  const locale = useLocale()
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [errKey, setErrKey] = useState<string | null>(null)
  const mountedAt = useRef(0)
  useEffect(() => {
    mountedAt.current = Date.now()
  }, [])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setErrKey(null)
    startTransition(async () => {
      const { error } = await submitLead({
        name: String(fd.get('name') ?? ''),
        company: String(fd.get('company') ?? ''),
        email: String(fd.get('email') ?? ''),
        projectType: String(fd.get('projectType') ?? '') || undefined,
        message: String(fd.get('message') ?? '') || undefined,
        website: String(fd.get('website') ?? ''),
        elapsedMs: Date.now() - mountedAt.current,
        locale,
        source,
      })
      if (error === 'invalid') setErrKey('errInvalid')
      else if (error === 'rate_limited') setErrKey('errRateLimited')
      else if (error === 'server') setErrKey('errServer')
      else setSent(true)
    })
  }

  if (sent) {
    return (
      <div style={{
        background: 'rgba(0,181,168,0.10)',
        border: '1px solid rgba(0,181,168,0.35)',
        borderRadius: 14,
        padding: '36px 28px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>✓</div>
        <div style={{ fontSize: 19, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>
          {t('successTitle')}
        </div>
        <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.65, margin: 0 }}>
          {t('successBody')}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
      {/* Honeypot: invisible para humanos, los bots lo rellenan */}
      <div aria-hidden="true" style={{ position: 'absolute', left: -9999, top: -9999, height: 0, overflow: 'hidden' }}>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="leadform-grid">
        <input name="name" required minLength={2} maxLength={120} placeholder={t('namePh')} style={inputStyle} />
        <input name="company" required minLength={2} maxLength={120} placeholder={t('companyPh')} style={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="leadform-grid">
        <input name="email" type="email" required maxLength={254} placeholder={t('emailPh')} style={inputStyle} />
        <select name="projectType" defaultValue="" style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
          <option value="" disabled style={{ color: '#0B1D3A' }}>{t('projectTypePh')}</option>
          {PROJECT_TYPES.map(({ value, key }) => (
            <option key={value} value={value} style={{ color: '#0B1D3A' }}>{t(key)}</option>
          ))}
        </select>
      </div>
      <textarea
        name="message"
        rows={3}
        maxLength={2000}
        placeholder={t('messagePh')}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 76 }}
      />

      {errKey && (
        <p role="alert" style={{
          fontSize: 13, color: '#fca5a5', margin: 0, lineHeight: 1.5,
          background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)',
          borderRadius: 8, padding: '10px 14px',
        }}>
          {t(errKey)}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          background: 'linear-gradient(135deg, #ea580c, #dc2626)',
          color: '#fff', border: 'none', borderRadius: 12,
          padding: '15px 32px', fontSize: 16, fontWeight: 700,
          cursor: pending ? 'wait' : 'pointer',
          opacity: pending ? 0.7 : 1,
          boxShadow: '0 4px 28px rgba(234,88,12,0.45)',
          transition: 'opacity 0.15s',
          letterSpacing: '-0.01em',
          fontFamily: 'inherit',
        }}
      >
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
