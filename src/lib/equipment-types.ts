import { TAG_PREFIX_MAP, extractTagPrefix } from '@/lib/tag-types'

// ── Catálogo estándar de tipos de equipo ─────────────────────────────────────
// Se siembra por organización en `equipment_types` (código = prefijo ISA-5.1,
// que es lo que el ingeniero reconoce en el tag). Cada org puede editar,
// añadir o borrar tipos desde Admin → Configuración. La detección por prefijo
// del tag se usa cuando el Excel no trae la columna TIPO EQUIPO.
//
// "Todo es tag": cables y líneas de tubería también son tags (con su tabla de
// detalle); por eso CBL y LINE viven aquí.

export type EquipmentCategory =
  | 'Instrumentos'
  | 'Válvulas'
  | 'Control y seguridad'
  | 'Rotativos'
  | 'Estáticos'
  | 'Eléctricos'
  | 'Tubería'
  | 'Cables'

export interface EquipmentTypeDefault {
  code: string
  name: string
  category: EquipmentCategory
  discipline: string
}

const VALVE_PREFIXES = new Set(['XV', 'ESDV', 'BDV', 'SDV', 'HV', 'FCV', 'PCV', 'TCV', 'LCV', 'MOV', 'VLV', 'PSV'])
const CONTROL_PREFIXES = new Set(['JB', 'PLC', 'DCS', 'SIS', 'FG', 'GD', 'FD'])
const ROTATING_PREFIXES = new Set(['P', 'C', 'CR', 'MX', 'AG'])

function categoryFor(code: string, discipline: string): EquipmentCategory {
  if (VALVE_PREFIXES.has(code)) return 'Válvulas'
  if (CONTROL_PREFIXES.has(code)) return 'Control y seguridad'
  if (discipline === 'INST') return 'Instrumentos'
  if (discipline === 'ELEC') return 'Eléctricos'
  if (discipline === 'PIPE') return 'Tubería'
  if (ROTATING_PREFIXES.has(code)) return 'Rotativos'
  return 'Estáticos'
}

const EXTRA_TYPES: EquipmentTypeDefault[] = [
  // Válvulas de control con nomenclatura ISA corta (FV/PV/LV/TV), muy comunes en Latinoamérica
  { code: 'FV',   name: 'Válvula de Control de Flujo (FV)',      category: 'Válvulas',   discipline: 'INST' },
  { code: 'PV',   name: 'Válvula de Control de Presión (PV)',    category: 'Válvulas',   discipline: 'INST' },
  { code: 'LV',   name: 'Válvula de Control de Nivel (LV)',      category: 'Válvulas',   discipline: 'INST' },
  { code: 'TV',   name: 'Válvula de Control de Temperatura (TV)', category: 'Válvulas',  discipline: 'INST' },
  { code: 'GEN',  name: 'Generador (GEN)',        category: 'Eléctricos', discipline: 'ELEC' },
  { code: 'K',    name: 'Compresor (K)',          category: 'Rotativos',  discipline: 'MECH' },
  { code: 'HTR',  name: 'Calentador / Horno',     category: 'Estáticos',  discipline: 'MECH' },
  { code: 'AC',   name: 'Aeroenfriador',          category: 'Estáticos',  discipline: 'MECH' },
  { code: 'D',    name: 'Tambor / Drum',          category: 'Estáticos',  discipline: 'MECH' },
  { code: 'BAT',  name: 'Banco de Baterías',      category: 'Eléctricos', discipline: 'ELEC' },
  { code: 'LUM',  name: 'Luminaria',              category: 'Eléctricos', discipline: 'ELEC' },
  { code: 'CBL',  name: 'Cable',                  category: 'Cables',     discipline: 'ELEC' },
  { code: 'LINE', name: 'Línea de tubería',       category: 'Tubería',    discipline: 'PIPE' },
]

export const EQUIPMENT_TYPE_DEFAULTS: EquipmentTypeDefault[] = [
  ...Object.entries(TAG_PREFIX_MAP)
    .filter(([code]) => !code.includes('_')) // LT_ELEC es una clave interna, no un prefijo
    .map(([code, info]) => ({
      code,
      name: info.typeName,
      category: categoryFor(code, info.discipline),
      discipline: info.discipline,
    })),
  ...EXTRA_TYPES,
]

export const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  'Instrumentos', 'Válvulas', 'Control y seguridad', 'Rotativos', 'Estáticos', 'Eléctricos', 'Tubería', 'Cables',
]

const DEFAULT_CODES = new Set(EQUIPMENT_TYPE_DEFAULTS.map(t => t.code))

/**
 * Código de tipo de equipo a partir del prefijo del tag ("ESDV-7621001" → "ESDV",
 * "P-101A" → "P"). Solo devuelve códigos del catálogo estándar; la org puede
 * tener el tipo o no — quien llama decide qué hacer si no existe.
 */
export function detectEquipmentTypeCode(tagNumber: string): string | null {
  const prefix = extractTagPrefix(tagNumber)
  if (!prefix) return null
  if (DEFAULT_CODES.has(prefix)) return prefix
  return isaVariant(prefix)
}

/**
 * Variantes ISA del mismo instrumento que el catálogo estándar no trae como código propio. Las listas de
 * instrumentos (Akacías A2.2: 904 de 1137 tags sin tipo) usan transmisores «indicadores» y medidores locales:
 *   PIT/LIT/TIT/FIT/AIT → PT/LT/TT/FT/AT (transmisor; la «I» es la indicación local)
 *   PDIT/PDT → PT (presión diferencial) · DIT (densidad) → AT
 *   PG/TG/LG → PI/TI/LI (manómetro, termómetro y visor de nivel = indicador local)
 *   PVV/PVSV (presión-vacío) → PSV
 * Solo devuelve códigos del catálogo estándar; lo que no se reconoce queda sin tipo (R3 lo propone por firma).
 */
function isaVariant(prefix: string): string | null {
  const pick = (code: string) => (DEFAULT_CODES.has(code) ? code : null)
  if (prefix === 'PDIT' || prefix === 'PDT') return pick('PT')
  if (prefix === 'DIT' || prefix === 'DT') return pick('AT')
  if (prefix === 'PVV' || prefix === 'PVSV') return pick('PSV')
  const indicating = prefix.match(/^([A-Z])IT$/)
  if (indicating) return pick(`${indicating[1]}T`)
  const gauge = prefix.match(/^([PTL])G$/)
  if (gauge) return pick(`${gauge[1]}I`)
  return null
}

/** Normaliza texto de tipo (código o nombre) para comparar sin acentos ni mayúsculas. */
export function normalizeTypeKey(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

/** S25b (E-29): válvulas de corte / seguridad que el line-up marca como críticas por defecto (= backfill SQL). */
export const CRITICAL_VALVE_CODES = ['ESDV', 'XV', 'SDV', 'BDV', 'PSV', 'HV-ESD'] as const

/** Flags de line-up por defecto para un tipo nuevo o sembrado; luego se ajustan en /admin/config. */
export function defaultLineupFlags(code: string, category: string | null | undefined): { lineup_candidate: boolean; critical_valve: boolean } {
  const critical = (CRITICAL_VALVE_CODES as readonly string[]).includes(code.trim().toUpperCase())
  const cat = (category ?? '').toLowerCase()
  return { lineup_candidate: critical || cat.startsWith('válvula') || cat.startsWith('valvula') || cat.startsWith('valve'), critical_valve: critical }
}
