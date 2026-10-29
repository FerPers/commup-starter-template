// Ubicación por P&ID de los equipos que la lista no ubica (decisión de Luis, 2026-10-29): las listas mecánicas de
// CPF Orotoy solo traen «EQUIPO ESTÁTICO / ROTATIVO / PAQUETE», pero cada equipo cita su P&ID y cada hoja de P&ID
// ya está en un sistema por los instrumentos cargados. Puro: lo prueba pid-place.test.ts.

/**
 * Hoja de P&ID de una referencia: el número que sigue a «PID» («ECP-ULL-17004-GDA-IE01-0-PRO-PID-133_2-2-B» → «133»).
 * Ignora contratista (GDA/GLC), hoja (_2-2) y revisión, que cambian entre listas del mismo plano.
 */
export function pidSheetKey(ref: string | null | undefined): string | null {
  const m = /P\s*&?\s*ID[-_\s]*(\d+)/i.exec(ref ?? '')
  return m ? m[1] : null
}

/** Por hoja de P&ID, el subsistema con más tags cargados (empate: el primero por id, estable). */
export function dominantSubsystemByPid(tags: { pid_drawing: string | null; subsystem_id: string }[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const t of tags) {
    const key = pidSheetKey(t.pid_drawing)
    if (!key) continue
    const bySub = counts.get(key) ?? new Map<string, number>()
    bySub.set(t.subsystem_id, (bySub.get(t.subsystem_id) ?? 0) + 1)
    counts.set(key, bySub)
  }
  const out = new Map<string, string>()
  for (const [key, bySub] of counts) {
    const [best] = [...bySub].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    out.set(key, best[0])
  }
  return out
}
