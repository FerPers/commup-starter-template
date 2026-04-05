'use client'

export default function OfflinePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>

        <div style={{ fontSize: '64px', marginBottom: '24px' }}>📡</div>

        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f1f5f9', margin: '0 0 12px' }}>
          Sin conexión
        </h1>
        <p style={{ fontSize: '15px', color: '#94a3b8', margin: '0 0 32px', lineHeight: '1.6' }}>
          No hay acceso a internet. Las páginas que visitaste previamente están disponibles desde el caché.
        </p>

        <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', marginBottom: '28px', textAlign: 'left' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
            Puedes hacer mientras tanto
          </p>
          <ul style={{ margin: 0, padding: '0 0 0 16px', color: '#94a3b8', fontSize: '14px', lineHeight: '2' }}>
            <li>Ver ITRs que ya abriste</li>
            <li>Revisar punches cacheados</li>
            <li>Tomar fotos (se sincronizan al reconectar)</li>
          </ul>
        </div>

        <button
          onClick={() => window.location.reload()}
          style={{ padding: '12px 28px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
        >
          Reintentar conexión
        </button>

        <p style={{ marginTop: '20px', fontSize: '12px', color: '#475569' }}>
          CommUp guarda automáticamente tu trabajo al reconectar.
        </p>
      </div>
    </div>
  )
}