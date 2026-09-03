// Glosario EN → ES para la traducción de plantillas ITR. Cada org puede
// sobreescribirlo en Admin → Configuración (texto "en = es" por línea, guardado
// en organizations.settings.itr_glossary). Este es el punto de partida O&G.

export const DEFAULT_ITR_GLOSSARY = `check sheet = hoja de verificación
completion form = formato de completación
construction completion = completación de construcción
mechanical completion = completación mecánica
pre-commissioning = pre-comisionamiento
commissioning = comisionamiento
punch list = lista de pendientes
punch item = pendiente
walkdown = recorrido de verificación
box-up = cierre final
tie-in = interconexión
hydrotest = prueba hidrostática
flushing = lavado (flushing)
loop check = prueba de lazo
loop test = prueba de lazo
megger test = prueba de resistencia de aislamiento
insulation resistance = resistencia de aislamiento
continuity test = prueba de continuidad
setpoint = punto de ajuste
set point = punto de ajuste
skid = patín (skid)
vendor = fabricante
datasheet = hoja de datos
as-built = como construido
energize = energizar
de-energize = desenergizar
lockout / tagout = bloqueo y etiquetado
gasket = empaque
bolt torque = torque de pernos
alignment = alineación
grounding = puesta a tierra
earthing = puesta a tierra
cable gland = prensaestopas
junction box = caja de conexiones
nameplate = placa de identificación
tag number = número de tag
P&ID = P&ID
ITR = ITR`

export type GlossaryEntry = { en: string; es: string }

/** Parsea el texto "en = es" por línea; ignora líneas vacías o sin "=". */
export function parseGlossary(text: string | null | undefined): GlossaryEntry[] {
  const out: GlossaryEntry[] = []
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i <= 0) continue
    const en = line.slice(0, i).trim()
    const es = line.slice(i + 1).trim()
    if (en && es) out.push({ en, es })
  }
  return out
}
