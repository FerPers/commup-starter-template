/**
 * S09 (B-07/B-22): aviso de resultados parciales. Toda lista que no muestra todo lo que coincide (tope
 * de búsqueda, tope de filas) lo dice en vez de cortar en silencio.
 */
export default function PartialNote({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" style={{
      margin: '0 0 12px', padding: '8px 12px', borderRadius: 8, fontSize: 13,
      background: 'var(--warning-50)', border: '1px solid var(--warning-200)', color: 'var(--warning-800)',
    }}>
      {children}
    </div>
  )
}
