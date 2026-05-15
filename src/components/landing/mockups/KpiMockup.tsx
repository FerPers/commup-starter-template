export default function KpiMockup() {
  const areas = [
    { name: 'Area 1 — Compression', itrs: 187, done: 174, pct: 93, punches: 3 },
    { name: 'Area 2 — Separation', itrs: 142, done: 95, pct: 67, punches: 8 },
    { name: 'Area 3 — Utilities', itrs: 98, done: 31, pct: 32, punches: 7 },
    { name: 'Area 4 — Flare', itrs: 54, done: 12, pct: 22, punches: 0 },
  ]

  const phases = [
    { name: 'Phase A — Mechanical', pct: 94, color: '#10b981', itrs: 280, done: 263 },
    { name: 'Phase B — Instrumentation', pct: 67, color: '#7c3aed', itrs: 196, done: 131 },
    { name: 'Phase C — Electrical', pct: 31, color: '#f59e0b', itrs: 124, done: 38 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Phase KPIs */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10, padding: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Phase Progress
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {phases.map(({ name, pct, color, itrs, done }) => (
            <div key={name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{name}</span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#475569' }}>{done}/{itrs} ITRs</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                </div>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Area table */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10, padding: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          By Area
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {['Area', 'ITRs', '% Done', 'Open Punches'].map(h => (
                <th key={h} style={{ padding: '5px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map(({ name, itrs, done, pct, punches }) => (
              <tr key={name} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '7px 8px', color: '#94a3b8', fontSize: 11 }}>{name}</td>
                <td style={{ padding: '7px 8px', color: '#64748b', fontSize: 11 }}>{done}/{itrs}</td>
                <td style={{ padding: '7px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 50, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                      <div style={{
                        width: `${pct}%`, height: '100%', borderRadius: 2,
                        background: pct > 80 ? '#10b981' : pct > 50 ? '#7c3aed' : '#f59e0b',
                      }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>{pct}%</span>
                  </div>
                </td>
                <td style={{ padding: '7px 8px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: punches > 0 ? '#ef4444' : '#10b981',
                  }}>
                    {punches > 0 ? `${punches} open` : '✓ Clear'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
