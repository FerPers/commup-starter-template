export default function CertMockup() {
  const certs = [
    {
      id: 'MC-001',
      name: 'Mechanical Completion',
      code: 'MC',
      system: 'SYS-01 — HP Compression',
      status: 'issued',
      itrs: 187, itrsDone: 187,
      punchesA: 0, punchesB: 2,
      date: '2026-05-02',
      color: '#10b981',
    },
    {
      id: 'RFPC-001',
      name: 'Ready for Pre-Commissioning',
      code: 'RFPC',
      system: 'SYS-01 — HP Compression',
      status: 'in_progress',
      itrs: 45, itrsDone: 31,
      punchesA: 1, punchesB: 3,
      date: null,
      color: '#7c3aed',
    },
    {
      id: 'MC-002',
      name: 'Mechanical Completion',
      code: 'MC',
      system: 'SYS-02 — Separation Train',
      status: 'blocked',
      itrs: 142, itrsDone: 95,
      punchesA: 2, punchesB: 5,
      date: null,
      color: '#ef4444',
    },
  ]

  const statusLabel = (s: string) => {
    if (s === 'issued') return { label: '✓ Issued', color: '#10b981', bg: '#10b98115' }
    if (s === 'in_progress') return { label: '● In Progress', color: '#a78bfa', bg: '#7c3aed15' }
    return { label: '⊘ Blocked', color: '#ef4444', bg: '#ef444415' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Chain header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
        fontSize: 11, color: '#475569', fontWeight: 600,
      }}>
        <span>MC</span>
        <span style={{ color: '#1e293b' }}>→</span>
        <span>RFPC</span>
        <span style={{ color: '#1e293b' }}>→</span>
        <span>RFC</span>
        <span style={{ color: '#1e293b' }}>→</span>
        <span>RFSU</span>
        <span style={{ color: '#1e293b', flex: 1 }} />
        <span style={{ fontSize: 10, color: '#334155' }}>Auto-blocked until Cat A closed</span>
      </div>

      {certs.map(cert => {
        const sl = statusLabel(cert.status)
        const itrPct = Math.round((cert.itrsDone / cert.itrs) * 100)
        return (
          <div key={cert.id} style={{
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${cert.status === 'issued' ? '#10b98130' : cert.status === 'blocked' ? '#ef444420' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 10, padding: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {/* Badge */}
              <div style={{
                width: 44, height: 44, borderRadius: 8, background: `${cert.color}20`,
                border: `1px solid ${cert.color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, fontSize: 13, fontWeight: 800, color: cert.color,
              }}>
                {cert.code}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{cert.name}</span>
                    <span style={{ fontSize: 11, color: '#475569', marginLeft: 8 }}>{cert.system}</span>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
                    background: sl.bg, color: sl.color, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {sl.label}
                  </span>
                </div>

                {/* ITR progress */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: '#475569' }}>ITRs</span>
                  <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ width: `${itrPct}%`, height: '100%', background: cert.color, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{cert.itrsDone}/{cert.itrs}</span>
                </div>

                {/* Punch blockers */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4,
                    background: cert.punchesA > 0 ? '#ef444420' : '#10b98115',
                    color: cert.punchesA > 0 ? '#ef4444' : '#10b981', fontWeight: 600,
                  }}>
                    Cat A: {cert.punchesA > 0 ? `${cert.punchesA} blocking` : '✓ Clear'}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4,
                    background: '#f59e0b15', color: '#f59e0b', fontWeight: 600,
                  }}>
                    Cat B: {cert.punchesB} (exception)
                  </span>
                  {cert.date && (
                    <span style={{ fontSize: 10, color: '#475569', marginLeft: 'auto' }}>Issued: {cert.date}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
