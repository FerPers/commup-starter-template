interface Props {
  size?: number
  variant?: 'mark' | 'full' | 'full-stacked'
  theme?: 'light' | 'dark'
}

export default function CommUpLogo({ size = 32, variant = 'mark', theme = 'dark' }: Props) {
  const markColor = theme === 'dark' ? '#FFFFFF' : '#0B1D3A'
  const tealColor = '#00B5A8'
  const orangeColor = '#FF8A00'
  const textColor = theme === 'dark' ? '#F1F5F9' : '#0B1D3A'
  const subColor = theme === 'dark' ? '#64748B' : '#64707C'

  if (variant === 'mark') {
    return <LogoMark size={size} markColor={markColor} tealColor={tealColor} />
  }

  if (variant === 'full-stacked') {
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <LogoMark size={size} markColor={markColor} tealColor={tealColor} />
        <div style={{ textAlign: 'center', lineHeight: 1 }}>
          <span style={{
            fontFamily: 'Space Grotesk, Inter, Arial, sans-serif',
            fontSize: size * 0.44, fontWeight: 700,
            color: textColor, letterSpacing: '0.03em',
          }}>Comm</span>
          <span style={{
            fontFamily: 'Space Grotesk, Inter, Arial, sans-serif',
            fontSize: size * 0.44, fontWeight: 700,
            color: orangeColor, letterSpacing: '0.03em',
          }}>UP</span>
        </div>
      </div>
    )
  }

  // full — horizontal
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.4) }}>
      <LogoMark size={size} markColor={markColor} tealColor={tealColor} />
      <div>
        <div style={{ lineHeight: 1 }}>
          <span style={{
            fontFamily: 'Space Grotesk, Inter, Arial, sans-serif',
            fontSize: size * 0.52, fontWeight: 700,
            color: textColor, letterSpacing: '0.03em',
          }}>Comm</span>
          <span style={{
            fontFamily: 'Space Grotesk, Inter, Arial, sans-serif',
            fontSize: size * 0.52, fontWeight: 700,
            color: orangeColor, letterSpacing: '0.03em',
          }}>UP</span>
        </div>
        {size >= 36 && (
          <div style={{
            fontSize: size * 0.18, fontWeight: 600, color: subColor,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            lineHeight: 1.2, marginTop: 3,
          }}>
            Commissioning Platform
          </div>
        )}
      </div>
    </div>
  )
}

function LogoMark({ size, markColor, tealColor }: { size: number; markColor: string; tealColor: string }) {
  // viewBox 0 0 74 64 — preserve aspect ratio from the pack
  const w = Math.round(size * 74 / 64)
  return (
    <svg
      width={w}
      height={size}
      viewBox="0 0 74 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g strokeLinecap="round" strokeLinejoin="round" strokeWidth="3">
        {/* Smart tag body */}
        <rect stroke={markColor} x="13" y="9" width="38" height="46" rx="7" />
        {/* Clip / tab at top */}
        <path stroke={markColor} d="M25 9h14v6H25z" />
        {/* ITR grid cells — 3 boxes */}
        <path stroke={markColor} d="M22 24h7v7h-7zM36 24h7v7h-7zM22 38h7v7h-7z" />
        {/* Plus sign in 4th cell */}
        <path stroke={markColor} d="M36 38h3M43 38h3M36 42h10M40 34v12" />
        {/* Check mark — completion signal */}
        <path stroke={tealColor} d="M24 50l7 7 14-17" />
        {/* NFC / signal arcs — traceability */}
        <path stroke={tealColor} d="M53 12c4 2 7 5 9 10M54 3c8 3 14 10 17 18" />
      </g>
    </svg>
  )
}
