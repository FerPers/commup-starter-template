export default function ItrMockup() {
  const rows = [
    { tag: 'PV-101', template: 'MECH-001 — Pressure Vessel Inspection', phase: 'A', status: 'completed', pct: 100, assignee: 'R. Torres' },
    { tag: 'FCV-205', template: 'INST-003 — Control Valve Calibration', phase: 'B', status: 'in_progress', pct: 67, assignee: 'M. López' },
    { tag: 'LT-330', template: 'INST-001 — Level Transmitter Loop Check', phase: 'B', status: 'in_progress', pct: 40, assignee: 'J. García' },
    { tag: 'MOV-440', template: 'ELEC-002 — Motor Operated Valve Test', phase: 'A', status: 'pending', pct: 0, assignee: 'Unassigned' },
    { tag: 'TE-512', template: 'INST-005 — Temperature Element Calibration', phase: 'C', status: 'pending', pct: 0, assignee: 'Unassigned' },
  ]

  const statusStyle = (s: string): React.CSSProperties => ({
    fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
    background: s === 'completed' ? '#10b98122' : s === 'in_progress' ? '#7c3aed22' : '#ffffff10',
    color: s === 'completed' ? '#10b981' : s === 'in_progress' ? '#a78bfa' : '#64748b',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{
          flex: 1, minWidth: 160, background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
          padding: '6px 12px', fontSize: 12, color: '#475569',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          🔍 Search ITRs...
        </div>
        {['All phases', 'In progress', 'Completed'].map(f => (
          <div key={f} style={{
            padding: '5px 10px', borderRadius: 6,
            background: f === 'All phases' ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${f === 'All phases' ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.08)'}`,
            fontSize: 11, color: f === 'All phases' ? '#a78bfa' : '#64748b', cursor: 'pointer',
          }}>
            {f}
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Tag', 'Template', 'Phase', 'Status', 'Progress', 'Assignee'].map(h => (
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
            {rows.map((r, i) => (
              <tr key={r.tag} style={{
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
              }}>
                <td style={{ padding: '9px 10px', color: '#7c3aed', fontWeight: 600 }}>{r.tag}</td>
                <td style={{ padding: '9px 10px', color: '#94a3b8', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.template}</td>
                <td style={{ padding: '9px 10px' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    background: 'rgba(124,58,237,0.15)', color: '#a78bfa',
                  }}>{r.phase}</span>
                </td>
                <td style={{ padding: '9px 10px' }}>
                  <span style={statusStyle(r.status)}>
                    {r.status === 'completed' ? '✓ Done' : r.status === 'in_progress' ? '● In Progress' : '○ Pending'}
                  </span>
                </td>
                <td style={{ padding: '9px 10px', minWidth: 90 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                      <div style={{
                        width: `${r.pct}%`, height: '100%', borderRadius: 2,
                        background: r.pct === 100 ? '#10b981' : '#7c3aed',
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: '#64748b', minWidth: 26, textAlign: 'right' }}>{r.pct}%</span>
                  </div>
                </td>
                <td style={{ padding: '9px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>{r.assignee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
