export default function PunchMockup() {
  const rows = [
    { id: 'P-087', tag: 'PV-101', desc: 'Safety valve PSV-101A not seat-tested at design pressure', cat: 'A', status: 'open', area: 'Area 3', raised: '12 May' },
    { id: 'P-091', tag: 'FCV-205', desc: 'Control valve actuator air supply line not supported', cat: 'B', status: 'open', area: 'Area 1', raised: '13 May' },
    { id: 'P-094', tag: 'LT-330', desc: 'Impulse tubing heat trace not commissioned', cat: 'A', status: 'open', area: 'Area 2', raised: '13 May' },
    { id: 'P-078', tag: 'MOV-440', desc: 'Missing nameplate — motor operated valve', cat: 'C', status: 'resolved', area: 'Area 1', raised: '10 May' },
    { id: 'P-082', tag: 'TE-512', desc: 'Cable tray cover missing in weather-exposed area', cat: 'B', status: 'open', area: 'Area 4', raised: '11 May' },
  ]

  const catStyle = (cat: string): React.CSSProperties => ({
    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
    background: cat === 'A' ? '#ef444422' : cat === 'B' ? '#f59e0b22' : '#ffffff10',
    color: cat === 'A' ? '#ef4444' : cat === 'B' ? '#f59e0b' : '#94a3b8',
    border: `1px solid ${cat === 'A' ? '#ef444444' : cat === 'B' ? '#f59e0b44' : 'rgba(255,255,255,0.1)'}`,
  })

  const statusStyle = (s: string): React.CSSProperties => ({
    fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
    background: s === 'resolved' ? '#10b98115' : '#ef444415',
    color: s === 'resolved' ? '#10b981' : '#ef4444',
  })

  return (
    <div>
      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'Cat A: 2 open', color: '#ef4444', bg: '#ef444415' },
          { label: 'Cat B: 2 open', color: '#f59e0b', bg: '#f59e0b15' },
          { label: 'Cat C: 1 resolved', color: '#94a3b8', bg: '#ffffff08' },
        ].map(({ label, color, bg }) => (
          <div key={label} style={{
            padding: '5px 12px', borderRadius: 6, background: bg,
            fontSize: 11, fontWeight: 600, color,
          }}>
            {label}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{
          padding: '5px 12px', borderRadius: 6,
          background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)',
          fontSize: 11, color: '#a78bfa', fontWeight: 600, cursor: 'pointer',
        }}>
          + Add punch
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['#', 'Tag', 'Description', 'Cat', 'Status', 'Area'].map(h => (
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
              <tr key={r.id} style={{
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
              }}>
                <td style={{ padding: '9px 10px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{r.id}</td>
                <td style={{ padding: '9px 10px', color: '#7c3aed', fontWeight: 600 }}>{r.tag}</td>
                <td style={{ padding: '9px 10px', color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.desc}</td>
                <td style={{ padding: '9px 10px' }}><span style={catStyle(r.cat)}>Cat {r.cat}</span></td>
                <td style={{ padding: '9px 10px' }}><span style={statusStyle(r.status)}>{r.status === 'resolved' ? '✓ Resolved' : '● Open'}</span></td>
                <td style={{ padding: '9px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>{r.area}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
