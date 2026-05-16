import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import HeroSlideshow from './HeroSlideshow'

export default async function HeroSection() {
  const t = await getTranslations('Landing.hero')

  return (
    <section style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      paddingTop: 80,
      paddingBottom: 80,
      position: 'relative',
      overflow: 'hidden',
      background: '#06040e',
    }}>
      {/* Rotating photo slideshow */}
      <HeroSlideshow />

      {/* Dark gradient over photos — keeps text readable */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
        background: 'linear-gradient(160deg, rgba(6,4,14,0.80) 0%, rgba(10,6,22,0.65) 45%, rgba(6,4,14,0.78) 100%)',
      }} />

      {/* Purple glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
        backgroundImage: 'radial-gradient(ellipse 80% 60% at 60% 40%, rgba(124,58,237,0.18) 0%, transparent 70%)',
      }} />

      {/* Purple grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
        backgroundImage: `linear-gradient(rgba(124,58,237,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', width: '100%', position: 'relative', zIndex: 3 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }} className="hero-grid">

          {/* Left — Copy */}
          <div>
            {/* Badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)',
              borderRadius: 999, padding: '5px 14px', marginBottom: 24,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#a78bfa', display: 'inline-block' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#a78bfa', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {t('badge')}
              </span>
            </div>

            {/* Headline */}
            <h1 style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.08, margin: '0 0 16px', letterSpacing: '-0.03em' }}>
              <span style={{ color: '#f1f5f9' }}>{t('headline')}</span>
              <br />
              <span style={{ background: 'linear-gradient(90deg, #a78bfa, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {t('headlineAccent')}
              </span>
            </h1>

            {/* Subheadline */}
            <p style={{ fontSize: 17, lineHeight: 1.7, color: '#94a3b8', margin: '0 0 36px', maxWidth: 480 }}>
              {t('subheadline')}
            </p>

            {/* CTAs */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Link
                href="/login"
                style={{
                  background: 'linear-gradient(135deg, #ea580c, #dc2626)',
                  color: '#fff', border: 'none', borderRadius: 10,
                  padding: '13px 26px', fontSize: 15, fontWeight: 600,
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
                  boxShadow: '0 4px 24px rgba(234,88,12,0.4)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
              >
                {t('ctaLive')} →
              </Link>
              <a
                href="mailto:contacto@commup.app?subject=Demo CommUp"
                style={{
                  background: 'rgba(15,23,42,0.8)', color: '#e2e8f0',
                  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
                  padding: '13px 26px', fontSize: 15, fontWeight: 600,
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
                  transition: 'background 0.15s',
                }}
              >
                {t('ctaDemo')}
              </a>
            </div>

            {/* Trust indicators */}
            <div style={{ display: 'flex', gap: 28, marginTop: 40, flexWrap: 'wrap' }}>
              {[
                { value: '100%', label: 'Paperless' },
                { value: 'NFC + QR', label: 'Field scanning' },
                { value: 'RLS', label: 'Multi-tenant isolation' },
              ].map(({ value, label }) => (
                <div key={label}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#a78bfa' }}>{value}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Dashboard mockup */}
          <div className="hero-mockup" style={{ display: 'flex', justifyContent: 'center' }}>
            <DashboardMockup t={t} />
          </div>
        </div>
      </div>
    </section>
  )
}

function DashboardMockup({ t }: { t: (key: string) => string }) {
  const phases = [
    { name: 'Phase A', pct: 94, color: '#10b981' },
    { name: 'Phase B', pct: 67, color: '#7c3aed' },
    { name: 'Phase C', pct: 31, color: '#f59e0b' },
  ]

  return (
    <div style={{
      width: '100%', maxWidth: 460,
      background: '#0d0d1a',
      border: '1px solid rgba(124,58,237,0.25)',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.1)',
    }}>
      {/* Browser chrome */}
      <div style={{
        background: '#131320', padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['#ef4444', '#f59e0b', '#22c55e'].map(c => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />
          ))}
        </div>
        <div style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4,
          padding: '3px 10px', fontSize: 11, color: '#475569',
        }}>
          commup.app/dashboard
        </div>
        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: '#10b981',
            display: 'inline-block', boxShadow: '0 0 6px #10b981',
          }} />
          <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>{t('liveTag')}</span>
        </div>
      </div>

      {/* Dashboard content */}
      <div style={{ padding: 20 }}>
        {/* Top stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { val: '1,247', label: t('statItrs'), color: '#7c3aed', icon: '✓' },
            { val: '18', label: t('statPunches'), color: '#f59e0b', icon: '!' },
            { val: '4', label: t('statCerts'), color: '#10b981', icon: '📄' },
          ].map(({ val, label, color, icon }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 10, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 10, color: '#475569', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Phase progress bars */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 10, padding: 16,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('statPhase')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {phases.map(({ name, pct, color }) => (
              <div key={name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color }}>{pct}%</span>
                </div>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 1s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity mini */}
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { tag: 'PV-101', action: 'ITR-MECH-001 completed', time: '2m ago', dot: '#10b981' },
            { tag: 'FCV-205', action: 'Punch A-087 closed', time: '8m ago', dot: '#a78bfa' },
            { tag: 'LT-330', action: 'Certificate MC issued', time: '1h ago', dot: '#f59e0b' },
          ].map(({ tag, action, time, dot }) => (
            <div key={tag} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(255,255,255,0.02)', borderRadius: 7, padding: '7px 10px',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, minWidth: 54 }}>{tag}</span>
              <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>{action}</span>
              <span style={{ fontSize: 10, color: '#334155' }}>{time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
