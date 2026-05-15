interface Props {
  size?: number
  variant?: 'mark' | 'full' | 'full-stacked'
  theme?: 'light' | 'dark'
}

export default function CommUpLogo({ size = 32, variant = 'mark', theme = 'dark' }: Props) {
  const textColor = theme === 'dark' ? '#f1f5f9' : '#0f172a'
  const subColor = theme === 'dark' ? '#64748b' : '#64748b'

  if (variant === 'mark') {
    return <LogoMark size={size} />
  }

  if (variant === 'full-stacked') {
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <LogoMark size={size} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: size * 0.44, fontWeight: 800, color: textColor, letterSpacing: '-0.03em', lineHeight: 1 }}>
            Comm<span style={{ background: 'linear-gradient(90deg, #a78bfa, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Up</span>
          </div>
        </div>
      </div>
    )
  }

  // full — horizontal
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.35) }}>
      <LogoMark size={size} />
      <div>
        <div style={{
          fontSize: size * 0.56, fontWeight: 800, color: textColor,
          letterSpacing: '-0.03em', lineHeight: 1,
        }}>
          Comm<span style={{
            background: 'linear-gradient(90deg, #a78bfa, #7c3aed)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Up</span>
        </div>
        {size >= 36 && (
          <div style={{
            fontSize: size * 0.24, fontWeight: 500, color: subColor,
            letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.2,
            marginTop: 2,
          }}>
            Commissioning Platform
          </div>
        )}
      </div>
    </div>
  )
}

function LogoMark({ size }: { size: number }) {
  const s = size
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="cu-grad-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5b21b6" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="cu-grad-mark" x1="16" y1="16" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="100%" stopColor="#ddd6fe" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="cu-grad-glow" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
        <filter id="cu-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#7c3aed" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Background rounded square */}
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#cu-grad-bg)" filter="url(#cu-shadow)" />

      {/* Top shine */}
      <rect x="2" y="2" width="60" height="30" rx="16" fill="url(#cu-grad-glow)" />

      {/* Border */}
      <rect x="2" y="2" width="60" height="60" rx="16" stroke="rgba(167,139,250,0.3)" strokeWidth="1.5" fill="none" />

      {/* Inner mark: stylized "C" opening right + upward check arrow
          The "C" arc represents commissioning scope
          The arrow through it = completion going UP */}

      {/* C arc — left side open bracket */}
      <path
        d="M38 16 C24 16 16 22 16 32 C16 42 24 48 38 48"
        stroke="url(#cu-grad-mark)"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Upward arrow shaft */}
      <line x1="32" y1="44" x2="32" y2="22" stroke="url(#cu-grad-mark)" strokeWidth="5" strokeLinecap="round" />

      {/* Arrowhead up */}
      <path
        d="M24 30 L32 20 L40 30"
        stroke="url(#cu-grad-mark)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Small dot accent bottom right — NFC/tag reference */}
      <circle cx="46" cy="46" r="4" fill="#a78bfa" opacity="0.8" />
    </svg>
  )
}
