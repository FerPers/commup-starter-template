import type { Enums } from '@/types/supabase.generated'

/** Tipos de señal (= enum SQL `signal_type`). COMM = comunicación serial / bus de campo (Modbus, Profibus, Ethernet). */
export const SIGNAL_TYPES = ['AI', 'AO', 'DI', 'DO', 'PI', 'PO', 'COMM'] as const satisfies readonly Enums<'signal_type'>[]
export type SignalTypeCode = typeof SIGNAL_TYPES[number]

export const SIGNAL_TYPE_LABELS: Record<SignalTypeCode, string> = {
  AI: 'Analog In', AO: 'Analog Out', DI: 'Digital In', DO: 'Digital Out', PI: 'Pulse In', PO: 'Pulse Out', COMM: 'Comm / Fieldbus',
}

const WORDS: [RegExp, SignalTypeCode][] = [
  [/^(?:ANALOG(?:UE)?\s*(?:INPUT|IN)|ENTRADA\s+ANAL[OÓ]GICA)\b/, 'AI'],
  [/^(?:ANALOG(?:UE)?\s*(?:OUTPUT|OUT)|SALIDA\s+ANAL[OÓ]GICA)\b/, 'AO'],
  [/^(?:DIGITAL\s*(?:INPUT|IN)|DISCRETE\s*INPUT|ENTRADA\s+DIGITAL|ENTRADA\s+DISCRETA)\b/, 'DI'],
  [/^(?:DIGITAL\s*(?:OUTPUT|OUT)|DISCRETE\s*OUTPUT|SALIDA\s+DIGITAL|SALIDA\s+DISCRETA)\b/, 'DO'],
  [/^(?:PULSE\s*(?:INPUT|IN)|ENTRADA\s+DE\s+PULSOS)\b/, 'PI'],
  [/^(?:PULSE\s*(?:OUTPUT|OUT)|SALIDA\s+DE\s+PULSOS)\b/, 'PO'],
  [/^(?:COMM?S?|COMUNICACI[OÓ]N|SERIAL|MODBUS|PROFIBUS|FIELDBUS|FOUNDATION|ETHERNET|RS-?485|RS-?232|OPC)\b/, 'COMM'],
]

/**
 * Tipo de señal tal como lo escriben las listas de ingeniería → código. «AI+ HART», «AI (HART)», «AO + HART» → AI/AO;
 * «Digital Output» → DO; «COMM», «Modbus», «Serial» → COMM. null si no se reconoce (la fila se reporta).
 */
export function normalizeSignalType(raw: string): SignalTypeCode | null {
  const v = raw.trim().toUpperCase()
  if (!v) return null
  const code = v.match(/^(AI|AO|DI|DO|PI|PO)(?![A-Z])/)
  if (code) return code[1] as SignalTypeCode
  for (const [re, type] of WORDS) if (re.test(v)) return type
  return null
}
