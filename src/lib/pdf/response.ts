/** Respuesta HTTP de un PDF generado en el servidor (sin caché compartida). */
export function pdfResponse(bytes: Uint8Array, filename: string, disposition: 'inline' | 'attachment'): Response {
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
