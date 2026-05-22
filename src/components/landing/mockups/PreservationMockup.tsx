export default function PreservationMockup() {
  const rows = [
    { tag: 'PV-101', procedure: 'Monthly N₂ blanket check', freq: 'Monthly', nextDue: '2026-05-18', status: 'upcoming', responsible: 'R. Torres' },
    { tag: 'MOV-440', procedure: 'Weekly actuator stroke test', freq: 'Weekly', nextDue: '2026-05-12', status: 'overdue', responsible: 'J. García' },
    { tag: 'FCV-205', procedure: 'Bi-weekly lubrication — packing gland', freq: 'Bi-weekly', nextDue: '2026-05-20', status: 'upcoming', responsible: 'M. López' },
    { tag: 'LT-330', procedure: 'Monthly instrument desiccant inspection', freq: 'Monthly', nextDue: '2026-05-08', status: 'overdue', responsible: 'J. García' },
    { tag: 'TE-512', procedure: 'Quarterly thermowell inspection', freq: 'Quarterly', nextDue: '2026-07-01', status: 'ok', responsible: 'Unassigned' },
  ]

  const statusBadge = (s: string) => {
    if (s === 'overdue') return { label: '⚠ Overdue', color: '#ef4444', bg: '#ef444415' }
    if (s === 'upcoming') return { label: '↑ Due soon', color: '#f59e0b', bg: '#f59e0b15' }
    return { label: '✓ On track', color: '#10b981', bg: '#10b98115' }
  }

  return (
    <div>
      {/* Summary bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { label: '2 Overdue', color: '#ef4444', bg: '#ef444415' },
          { label: '2 Due this week', color: '#f59e0b', bg: '#f59e0b15' },
          { label: '1 On track', color: '#10b981', bg: '#10b98115' },
        ].map(({ label, color, bg }) => (
          <div key={label} style={{
            padding: '5px 12px', borderRadius: 6, background: bg,
            fontSize: 11, fontWeight: 600, color,
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Tag', 'Procedure', 'Freq.', 'Next Due', 'Status', 'Responsible'].map(h => (
                <th key={h} style={{
                  padding: '8px 10px', textAlign: 'left', fontSize: 10,
                  fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const badge = statusBadge(r.status)
              return (
                <tr key={r.tag + r.procedure} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: r.status === 'overdue' ? 'rgba(239,68,68,0.03)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                }}>
                  <td style={{ padding: '9px 10px', color: '#7c3aed', fontWeight: 600 }}>{r.tag}</td>
                  <td style={{ padding: '9px 10px', color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.procedure}</td>
                  <td style={{ padding: '9px 10px', color: '#475569', whiteSpace: 'nowrap' }}>{r.freq}</td>
                  <td style={{ padding: '9px 10px', color: r.status === 'overdue' ? '#ef4444' : '#64748b', fontWeight: r.status === 'overdue' ? 600 : 400, whiteSpace: 'nowrap' }}>{r.nextDue}</td>
                  <td style={{ padding: '9px 10px' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
                      background: badge.bg, color: badge.color,
                    }}>
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ padding: '9px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>{r.responsible}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
