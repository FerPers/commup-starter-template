// src/app/page.tsx

export default function Home() {
  return (
    <main style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      fontFamily: 'sans-serif' 
    }}>
      <h1 style={{ fontSize: '3rem', color: '#0070f3' }}>CommUp.app</h1>
      <p style={{ fontSize: '1.2rem', color: '#666' }}>
        Plataforma en desarrollo para la gestión y automatización de procesos.
      </p>
      <div style={{ marginTop: '20px', padding: '10px 20px', border: '1px solid #eaeaea', borderRadius: '5px' }}>
        Desarrollado por Luis Fernando Perdomo Soto
      </div>
    </main>
  );
}
