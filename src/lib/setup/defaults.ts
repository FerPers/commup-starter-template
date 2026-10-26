/**
 * Fases y disciplinas por defecto del alta de organización, y el color inicial de una fase o disciplina nueva en
 * Configuración. Son DATOS que se guardan en `project_phases.color` / `disciplines.color` (PDF, Excel, API y
 * `ink()`/`alpha()` los leen): siempre hex. G-10 los había pasado a `var(--…)` y `setupInputSchema` rechazaba el
 * alta de toda org nueva («Datos de configuración no válidos»); `defaults.test.ts` lo impide.
 */

export const DEFAULT_PHASES = [
  { code: 'A', name: 'Mechanical Completion', order_index: 1, color: '#3b82f6', certificate_name: 'MC' },
  { code: 'B', name: 'Pre-Commissioning',     order_index: 2, color: '#f59e0b', certificate_name: 'RFPC' },
  { code: 'C', name: 'Commissioning',          order_index: 3, color: '#10b981', certificate_name: 'RFC' },
  // Start-Up no es una 4ª letra de ITR: son pruebas de desempeño ligadas al RFSU.
  // La letra D queda reservada para Decomisionamiento (se crea desde Admin → Config cuando toque).
  { code: 'SU', name: 'Start-Up / Puesta en marcha', order_index: 4, color: '#8b5cf6', certificate_name: 'RFSU' },
]

// All known disciplines from industry reference (ITR catalog)
export const ALL_DISCIPLINES = [
  { code: 'ARCH',   name: 'Architectural',     color: '#a855f7', phases: ['A'] },
  { code: 'DRILL',  name: 'Drilling',           color: '#92400e', phases: ['A'] },
  { code: 'ELEC',   name: 'Electrical',         color: '#f59e0b', phases: ['A','B','C'] },
  { code: 'HVAC',   name: 'HVAC',               color: '#06b6d4', phases: ['A','B','C'] },
  { code: 'INST',   name: 'Instruments',        color: '#10b981', phases: ['A','B','C'] },
  { code: 'MECH',   name: 'Mechanical',         color: '#3b82f6', phases: ['A','B','C'] },
  { code: 'PIPE',   name: 'Piping',             color: '#f97316', phases: ['A'] },
  { code: 'PROC',   name: 'Process',            color: '#14b8a6', phases: ['B','C'] },
  { code: 'SAFE',   name: 'Safety / Fire',      color: '#ef4444', phases: ['A','B','C'] },
  { code: 'STRUCT', name: 'Structural / Civil', color: '#6b7280', phases: ['A'] },
  { code: 'TELE',   name: 'Telecoms',           color: '#8b5cf6', phases: ['A','B','C'] },
]

// Default selected disciplines (most common for O&G projects)
export const DEFAULT_SELECTED_CODES = ['ELEC', 'INST', 'MECH', 'PIPE', 'SAFE']

/** Color inicial de una fase / disciplina nueva en Configuración (el usuario lo cambia con el selector). */
export const NEW_PHASE_COLOR = '#3b82f6'
export const NEW_DISCIPLINE_COLOR = '#10b981'
