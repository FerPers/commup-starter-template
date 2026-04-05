// ── ISA-5.1 Tag Prefix → Equipment Type mapping ─────────────────────────────
// Used for auto-detecting tag type during import and suggesting ITR templates.

export interface TagTypeInfo {
  typeName: string       // Human-readable name (Spanish)
  discipline: string     // Expected discipline code
  keywords: string[]     // Keywords to match against template title/code
}

export const TAG_PREFIX_MAP: Record<string, TagTypeInfo> = {
  // ── Instruments — Transmitters ───────────────────────────────────────────
  'FT':   { typeName: 'Transmisor de Flujo',        discipline: 'INST', keywords: ['flow', 'flujo', 'caudal', 'transmitter'] },
  'FE':   { typeName: 'Elemento de Flujo',           discipline: 'INST', keywords: ['flow', 'flujo', 'orifice', 'placa', 'venturi'] },
  'FIC':  { typeName: 'Control de Flujo',            discipline: 'INST', keywords: ['flow', 'flujo', 'control'] },
  'FCV':  { typeName: 'Válvula Control Flujo',       discipline: 'INST', keywords: ['flow', 'control', 'valve', 'valvula'] },
  'PT':   { typeName: 'Transmisor de Presión',       discipline: 'INST', keywords: ['pressure', 'presion', 'transmitter'] },
  'PI':   { typeName: 'Indicador de Presión',        discipline: 'INST', keywords: ['pressure', 'presion', 'gauge', 'manometro'] },
  'PIC':  { typeName: 'Control de Presión',          discipline: 'INST', keywords: ['pressure', 'presion', 'control'] },
  'PCV':  { typeName: 'Válvula Control Presión',     discipline: 'INST', keywords: ['pressure', 'presion', 'control', 'valve'] },
  'PSV':  { typeName: 'Válvula de Seguridad',        discipline: 'INST', keywords: ['safety', 'seguridad', 'relief', 'alivio', 'PSV'] },
  'PSH':  { typeName: 'Presostato Alto',             discipline: 'INST', keywords: ['pressure', 'presion', 'switch', 'high'] },
  'PSL':  { typeName: 'Presostato Bajo',             discipline: 'INST', keywords: ['pressure', 'presion', 'switch', 'low'] },
  'TT':   { typeName: 'Transmisor de Temperatura',   discipline: 'INST', keywords: ['temperature', 'temperatura', 'transmitter'] },
  'TE':   { typeName: 'Elemento de Temperatura',     discipline: 'INST', keywords: ['temperature', 'temperatura', 'thermocouple', 'RTD', 'termocupla'] },
  'TI':   { typeName: 'Indicador de Temperatura',    discipline: 'INST', keywords: ['temperature', 'temperatura', 'indicator'] },
  'TIC':  { typeName: 'Control de Temperatura',      discipline: 'INST', keywords: ['temperature', 'temperatura', 'control'] },
  'TCV':  { typeName: 'Válvula Control Temperatura', discipline: 'INST', keywords: ['temperature', 'temperatura', 'control', 'valve'] },
  'TSH':  { typeName: 'Termostato Alto',             discipline: 'INST', keywords: ['temperature', 'temperatura', 'switch', 'high'] },
  'TSL':  { typeName: 'Termostato Bajo',             discipline: 'INST', keywords: ['temperature', 'temperatura', 'switch', 'low'] },
  'LT':   { typeName: 'Transmisor de Nivel',         discipline: 'INST', keywords: ['level', 'nivel', 'transmitter'] },
  'LI':   { typeName: 'Indicador de Nivel',          discipline: 'INST', keywords: ['level', 'nivel', 'indicator'] },
  'LIC':  { typeName: 'Control de Nivel',            discipline: 'INST', keywords: ['level', 'nivel', 'control'] },
  'LCV':  { typeName: 'Válvula Control Nivel',       discipline: 'INST', keywords: ['level', 'nivel', 'control', 'valve'] },
  'LSH':  { typeName: 'Switch de Nivel Alto',        discipline: 'INST', keywords: ['level', 'nivel', 'switch', 'high'] },
  'LSL':  { typeName: 'Switch de Nivel Bajo',        discipline: 'INST', keywords: ['level', 'nivel', 'switch', 'low'] },
  'AT':   { typeName: 'Transmisor Analítico',        discipline: 'INST', keywords: ['analyt', 'analitico', 'analyzer', 'analyser'] },
  'AIC':  { typeName: 'Control Analítico',           discipline: 'INST', keywords: ['analyt', 'analitico', 'control'] },
  'ST':   { typeName: 'Transmisor de Velocidad',     discipline: 'INST', keywords: ['speed', 'velocidad', 'rpm', 'rotation'] },
  'VT':   { typeName: 'Transmisor de Vibración',     discipline: 'INST', keywords: ['vibration', 'vibracion', 'vibrato'] },
  'WT':   { typeName: 'Transmisor de Peso',          discipline: 'INST', keywords: ['weight', 'peso', 'load', 'carga'] },
  // ── Instruments — Valves ────────────────────────────────────────────────
  'XV':   { typeName: 'Válvula de Bloqueo / ESD',    discipline: 'INST', keywords: ['valve', 'valvula', 'shutdown', 'block', 'bloqueo', 'ESD', 'XV'] },
  'ESDV': { typeName: 'Válvula ESD',                 discipline: 'INST', keywords: ['ESD', 'shutdown', 'valve', 'valvula', 'ESDV'] },
  'BDV':  { typeName: 'Válvula de Purga',            discipline: 'INST', keywords: ['blowdown', 'purga', 'BDV', 'valve'] },
  'SDV':  { typeName: 'Válvula de Cierre',           discipline: 'INST', keywords: ['shutdown', 'cierre', 'SDV', 'valve'] },
  'HV':   { typeName: 'Válvula Manual',              discipline: 'INST', keywords: ['hand', 'manual', 'valve', 'valvula'] },
  'MOV':  { typeName: 'Válvula Motorizada',          discipline: 'MECH', keywords: ['motor', 'motorized', 'valve', 'valvula', 'MOV'] },
  // ── Instruments — Misc ─────────────────────────────────────────────────
  'JB':   { typeName: 'Caja de Conexiones',          discipline: 'INST', keywords: ['junction', 'caja', 'JB', 'box'] },
  'PLC':  { typeName: 'PLC / Controlador',           discipline: 'INST', keywords: ['PLC', 'controlador', 'controller', 'DCS'] },
  'DCS':  { typeName: 'DCS / Sistema Control',       discipline: 'INST', keywords: ['DCS', 'control', 'system'] },
  'SIS':  { typeName: 'Sistema Instrumentado Seg.',  discipline: 'INST', keywords: ['SIS', 'safety', 'SIL', 'seguridad'] },
  'FG':   { typeName: 'Detector de Gas/Fuego',       discipline: 'INST', keywords: ['gas', 'fire', 'fuego', 'detector', 'FG'] },
  'GD':   { typeName: 'Detector de Gas',             discipline: 'INST', keywords: ['gas', 'detector', 'GD'] },
  'FD':   { typeName: 'Detector de Fuego',           discipline: 'INST', keywords: ['fire', 'fuego', 'detector', 'FD'] },
  // ── Mechanical ─────────────────────────────────────────────────────────
  'P':    { typeName: 'Bomba',                       discipline: 'MECH', keywords: ['pump', 'bomba'] },
  'C':    { typeName: 'Compresor',                   discipline: 'MECH', keywords: ['compressor', 'compresor'] },
  'HE':   { typeName: 'Intercambiador de Calor',     discipline: 'MECH', keywords: ['heat', 'exchanger', 'intercambiador', 'HE'] },
  'E':    { typeName: 'Intercambiador',              discipline: 'MECH', keywords: ['exchanger', 'intercambiador'] },
  'V':    { typeName: 'Recipiente / Vessel',         discipline: 'MECH', keywords: ['vessel', 'recipiente', 'drum', 'tambor'] },
  'TK':   { typeName: 'Tanque',                      discipline: 'MECH', keywords: ['tank', 'tanque', 'TK'] },
  'FIL':  { typeName: 'Filtro',                      discipline: 'MECH', keywords: ['filter', 'filtro', 'FIL'] },
  'STR':  { typeName: 'Colador / Strainer',          discipline: 'MECH', keywords: ['strainer', 'colador', 'STR'] },
  'SEP':  { typeName: 'Separador',                   discipline: 'MECH', keywords: ['separator', 'separador', 'SEP'] },
  'MX':   { typeName: 'Mezclador',                   discipline: 'MECH', keywords: ['mixer', 'mezclador', 'MX'] },
  'AG':   { typeName: 'Agitador',                    discipline: 'MECH', keywords: ['agitator', 'agitador', 'AG'] },
  'CR':   { typeName: 'Compresor Reciprocante',      discipline: 'MECH', keywords: ['compressor', 'compresor', 'reciprocating', 'CR'] },
  // ── Electrical ─────────────────────────────────────────────────────────
  'M':    { typeName: 'Motor Eléctrico',             discipline: 'ELEC', keywords: ['motor', 'electrico', 'electric'] },
  'G':    { typeName: 'Generador',                   discipline: 'ELEC', keywords: ['generator', 'generador'] },
  'T':    { typeName: 'Transformador',               discipline: 'ELEC', keywords: ['transformer', 'transformador'] },
  'SWG':  { typeName: 'Tablero / Switchgear',        discipline: 'ELEC', keywords: ['switchgear', 'tablero', 'SWG', 'panel'] },
  'MCC':  { typeName: 'Centro de Control Motor',     discipline: 'ELEC', keywords: ['MCC', 'motor control', 'centro'] },
  'VFD':  { typeName: 'Variador de Frecuencia',      discipline: 'ELEC', keywords: ['VFD', 'variador', 'inverter', 'drive', 'frecuencia'] },
  'UPS':  { typeName: 'UPS',                         discipline: 'ELEC', keywords: ['UPS', 'uninterruptible', 'baterias'] },
  'LT_ELEC': { typeName: 'Luminaria',               discipline: 'ELEC', keywords: ['light', 'luminaria', 'lighting'] },
  // ── Structural / Piping ────────────────────────────────────────────────
  'PL':   { typeName: 'Tubería / Pipeline',          discipline: 'PIPE', keywords: ['pipe', 'tuberia', 'pipeline', 'PL'] },
  'VLV':  { typeName: 'Válvula Manual (Piping)',     discipline: 'PIPE', keywords: ['valve', 'valvula', 'manual', 'VLV'] },
}

// ── Utility functions ────────────────────────────────────────────────────────

/** Extracts the letter prefix from a tag number. E.g. "XV-1001A" → "XV" */
export function extractTagPrefix(tagNumber: string): string {
  const match = tagNumber.match(/^([A-Za-z]+)/)
  return match ? match[1].toUpperCase() : ''
}

/**
 * Detects the tag type from a tag number using longest-prefix matching.
 * E.g. "ESDV-7621001" → ESDV entry (not E entry)
 */
export function detectTagType(tagNumber: string): TagTypeInfo | null {
  const prefix = extractTagPrefix(tagNumber)
  if (!prefix) return null

  // Sort keys longest-first so "ESDV" wins over "E", "FIC" wins over "FT", etc.
  const sortedKeys = Object.keys(TAG_PREFIX_MAP).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (prefix === key) return TAG_PREFIX_MAP[key]
  }
  return null
}

/**
 * Given a tag type and a list of templates, returns the templates sorted so
 * that matching ones come first, with a `recommended` flag on each.
 */
export function sortTemplatesByRelevance<T extends { title: string; code: string }>(
  templates: T[],
  tagType: TagTypeInfo | null,
): (T & { recommended: boolean })[] {
  if (!tagType) return templates.map(t => ({ ...t, recommended: false }))

  const kws = tagType.keywords.map(k => k.toLowerCase())
  return templates
    .map(t => {
      const haystack = `${t.title} ${t.code}`.toLowerCase()
      const recommended = kws.some(kw => haystack.includes(kw))
      return { ...t, recommended }
    })
    .sort((a, b) => {
      if (a.recommended === b.recommended) return 0
      return a.recommended ? -1 : 1
    })
}
