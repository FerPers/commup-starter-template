import { getTranslations } from 'next-intl/server'

export default async function SocialProofSection() {
  const t = await getTranslations('Landing.socialProof')

  const testimonials = [
    {
      quote: t('t1Quote'),
      author: t('t1Author'),
      role: t('t1Role'),
      company: t('t1Company'),
      initials: 'CM',
      color: '#7c3aed',
    },
    {
      quote: t('t2Quote'),
      author: t('t2Author'),
      role: t('t2Role'),
      company: t('t2Company'),
      initials: 'AR',
      color: '#10b981',
    },
    {
      quote: t('t3Quote'),
      author: t('t3Author'),
      role: t('t3Role'),
      company: t('t3Company'),
      initials: 'MP',
      color: '#f59e0b',
    },
  ]

  return (
    <section style={{
      background: '#080810',
      padding: '100px 24px',
      borderTop: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{
          fontSize: 36, fontWeight: 800, color: '#f1f5f9',
          textAlign: 'center', margin: '0 0 64px', letterSpacing: '-0.02em',
        }}>
          {t('title')}
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 24,
        }} className="testimonials-grid">
          {testimonials.map(({ quote, author, role, company, initials, color }) => (
            <div key={author} style={{
              background: '#0d0d1a',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16,
              padding: 28,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              position: 'relative',
            }}>
              {/* Quote mark */}
              <div style={{
                fontSize: 56, lineHeight: 1, color: color,
                opacity: 0.25, fontFamily: 'Georgia, serif',
                position: 'absolute', top: 16, right: 20,
                userSelect: 'none', pointerEvents: 'none',
              }}>
                &ldquo;
              </div>

              {/* Stars */}
              <div style={{ display: 'flex', gap: 3 }}>
                {[1, 2, 3, 4, 5].map(s => (
                  <span key={s} style={{ color: '#f59e0b', fontSize: 14 }}>★</span>
                ))}
              </div>

              {/* Quote text */}
              <p style={{
                fontSize: 14, color: '#94a3b8', lineHeight: 1.7,
                margin: 0, flex: 1, fontStyle: 'italic',
              }}>
                &ldquo;{quote}&rdquo;
              </p>

              {/* Author */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: `${color}20`,
                  border: `1px solid ${color}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color,
                  flexShrink: 0,
                }}>
                  {initials}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{author}</div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{role}</div>
                  <div style={{ fontSize: 12, color: '#334155', marginTop: 1 }}>{company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
