// QR de registros controlados (fase 3, §8.9): el QR lleva `<origen>/r/<uuid>`. Se usa el UUID y no
// el número (CIE-0001 se repite entre proyectos). `/r/[id]` resuelve el proyecto y redirige al detalle.
// Puro: compartido por el PDF de etiquetas (servidor) y el escáner (cliente).

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const REGISTER_URL = new RegExp(`/r/(${UUID})(?:[/?#]|$)`, 'i')

export function registerQrUrl(origin: string, id: string): string {
  return `${origin.replace(/\/+$/, '')}/r/${id}`
}

/** UUID del registro si el texto escaneado es una URL de registro de CommUp; si no, null. */
export function parseRegisterQr(raw: string): string | null {
  const m = raw.trim().match(REGISTER_URL)
  return m ? m[1].toLowerCase() : null
}
