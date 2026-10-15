/**
 * Guía de levantamiento de pendientes (fase 4 · bloque A, decisiones §6.1 y §10.5–10.8 del plan
 * readiness). La categoría se decide por IMPACTO FUNCIONAL y de seguridad, no por tamaño físico
 * (Process Commissioning Guide Book 9.19–9.20, 16.36). Cat C nunca bloquea un gate, por eso la
 * categorización tiene que ser buena desde que se levanta.
 *
 * Contenido bilingüe (es/en) porque lo usan el formulario (cliente) y el PDF del procedimiento
 * (servidor). Las etiquetas cortas de impacto viven en i18n (PunchGuide.impact.*).
 */

export type PunchCategory = 'A' | 'B' | 'C'
export type PunchImpact = 'safety' | 'process' | 'equipment' | 'operability' | 'environment'
export type StartupDisposition = 'close_before_startup' | 'controls' | 'long_term'
type Lang = 'es' | 'en'
type Text = Record<Lang, string>

export const PUNCH_IMPACTS: PunchImpact[] = ['safety', 'environment', 'process', 'equipment', 'operability']
export const STARTUP_DISPOSITIONS: StartupDisposition[] = ['close_before_startup', 'controls', 'long_term']

/** Categoría sugerida por impacto (§10.6). */
export const SUGGESTED_CATEGORY: Record<PunchImpact, PunchCategory> = {
  safety: 'A',
  environment: 'A',
  process: 'B',
  equipment: 'B',
  operability: 'C',
}

/** ¿La categoría elegida difiere de la sugerida por el impacto? (aviso, no bloqueo) */
export function categoryMismatch(impact: PunchImpact | null | undefined, category: PunchCategory): PunchCategory | null {
  if (!impact) return null
  const suggested = SUGGESTED_CATEGORY[impact]
  return suggested === category ? null : suggested
}

export const CATEGORY_CRITERIA: Record<PunchCategory, { title: Text; rule: Text; blocks: Text }> = {
  A: {
    title: { es: 'Cat A — impide avanzar con seguridad', en: 'Cat A — prevents safe progress' },
    rule: {
      es: 'Afecta la seguridad de las personas, la integridad de la contención (presión, fuego, tóxicos) o el ambiente, o impide la prueba, el pre-comisionamiento o el arranque del sistema.',
      en: 'Affects personnel safety, containment integrity (pressure, fire, toxics) or the environment, or prevents testing, pre-commissioning or start-up of the system.',
    },
    blocks: { es: 'Bloquea el certificado y el gate hasta cerrarse.', en: 'Blocks the certificate and the gate until closed.' },
  },
  B: {
    title: { es: 'Cat B — se cierra antes de la entrega', en: 'Cat B — closed before handover' },
    rule: {
      es: 'No impide arrancar con seguridad, pero afecta el desempeño del proceso, la confiabilidad del equipo o la documentación, y debe cerrarse antes de entregar a operaciones.',
      en: 'Does not prevent a safe start-up, but affects process performance, equipment reliability or documentation, and must be closed before handover to operations.',
    },
    blocks: {
      es: 'Puede pasar el gate con excepción justificada, dentro del límite de Cat B abiertos por subsistema.',
      en: 'May pass the gate with a justified exception, within the open Cat B limit per subsystem.',
    },
  },
  C: {
    title: { es: 'Cat C — menor, sin impacto funcional', en: 'Cat C — minor, no functional impact' },
    rule: {
      es: 'Estético o de terminación, sin efecto en la seguridad, el proceso ni la operación (pintura, rotulado menor, limpieza). Se puede cerrar después del arranque.',
      en: 'Cosmetic or finishing, with no effect on safety, process or operation (paint, minor labelling, housekeeping). It can be closed after start-up.',
    },
    blocks: { es: 'Nunca bloquea un gate.', en: 'Never blocks a gate.' },
  },
}

export const IMPACT_HELP: Record<PunchImpact, Text> = {
  safety: { es: 'Personas, contención, protecciones (SIS, PSV, fuego y gas).', en: 'People, containment, protections (SIS, PSV, fire & gas).' },
  environment: { es: 'Fugas, emisiones, derrames, vertimientos.', en: 'Leaks, emissions, spills, discharges.' },
  process: { es: 'Control, medición o desempeño del proceso.', en: 'Process control, measurement or performance.' },
  equipment: { es: 'Integridad o vida útil del equipo, garantías del fabricante.', en: 'Equipment integrity or life, vendor warranties.' },
  operability: { es: 'Acceso, rotulado, terminación, orden y limpieza.', en: 'Access, labelling, finishing, housekeeping.' },
}

/** Ejemplos por disciplina (códigos por defecto del Catálogo). Sin código conocido → GENERIC. */
type Examples = Record<PunchCategory, Text[]>
const ex = (es: string, en: string): Text => ({ es, en })

export const DISCIPLINE_EXAMPLES: Record<string, Examples> = {
  GENERIC: {
    A: [ex('Fuga en una unión bridada bajo presión', 'Leak at a pressurised flanged joint'), ex('Protección de seguridad faltante o inhibida', 'Missing or inhibited safety protection')],
    B: [ex('Instrumento fuera de calibración sin función de seguridad', 'Out-of-calibration non-safety instrument'), ex('Documentación as-built incompleta', 'Incomplete as-built documentation')],
    C: [ex('Retoque de pintura', 'Paint touch-up'), ex('Placa de identificación suelta', 'Loose nameplate')],
  },
  ELEC: {
    A: [ex('Puesta a tierra faltante o resistencia fuera de norma', 'Missing earthing or out-of-spec resistance'), ex('Protección del interruptor sin ajustar o sin probar', 'Breaker protection not set or not tested'), ex('Equipo en área clasificada sin certificación Ex', 'Equipment in hazardous area without Ex certification')],
    B: [ex('Prensaestopas sin sellar en área no clasificada', 'Unsealed cable gland in non-hazardous area'), ex('Rotulado de circuitos incompleto en tablero', 'Incomplete circuit labelling in panel')],
    C: [ex('Tapa de bandeja portacables faltante en tramo interior', 'Missing cable tray cover in indoor run'), ex('Rótulo de tablero descolorido', 'Faded panel label')],
  },
  INST: {
    A: [ex('Lazo de un SIF sin probar o con transmisor equivocado', 'SIF loop untested or with wrong transmitter'), ex('Válvula ESD que no cierra en el tiempo especificado', 'ESD valve not closing within specified time')],
    B: [ex('Transmisor de control fuera de calibración', 'Control transmitter out of calibration'), ex('Tubing con soporte insuficiente', 'Insufficiently supported tubing')],
    C: [ex('Etiqueta de instrumento ilegible', 'Illegible instrument tag'), ex('Tapón de protección faltante en caja de conexión', 'Missing protective plug on junction box')],
  },
  MECH: {
    A: [ex('Alineación del equipo rotativo fuera de tolerancia', 'Rotating equipment alignment out of tolerance'), ex('Guarda de acople faltante', 'Missing coupling guard')],
    B: [ex('Lubricación inicial no registrada', 'Initial lubrication not recorded'), ex('Pernos de anclaje sin torque documentado', 'Anchor bolts without documented torque')],
    C: [ex('Placa de datos sucia', 'Dirty data plate'), ex('Retoque de pintura en base', 'Paint touch-up on skid')],
  },
  PIPE: {
    A: [ex('Soldadura sin END o con indicaciones rechazables', 'Weld without NDT or with rejectable indications'), ex('Ciega de prueba no retirada', 'Test blind not removed'), ex('Soporte de resorte bloqueado', 'Locked spring hanger')],
    B: [ex('Soporte con holgura fuera de plano', 'Support gap out of drawing'), ex('Venteo o drenaje sin tapón', 'Vent or drain without plug')],
    C: [ex('Identificación de línea faltante', 'Missing line identification'), ex('Pintura de acabado incompleta', 'Incomplete finish painting')],
  },
  HVAC: {
    A: [ex('Presurización de sala de control fuera de diseño', 'Control room pressurisation out of design'), ex('Damper cortafuego sin probar', 'Untested fire damper')],
    B: [ex('Caudal de aire sin balancear', 'Unbalanced airflow'), ex('Filtros de obra sin cambiar', 'Construction filters not replaced')],
    C: [ex('Rejilla desalineada', 'Misaligned grille')],
  },
  INSU: {
    A: [ex('Aislamiento faltante en superficie caliente accesible (riesgo de quemadura)', 'Missing insulation on accessible hot surface (burn risk)')],
    B: [ex('Aislamiento de conservación de calor incompleto', 'Incomplete heat-conservation insulation'), ex('Barrera de vapor dañada en línea fría', 'Damaged vapour barrier on cold line')],
    C: [ex('Chaqueta metálica abollada', 'Dented metal jacketing')],
  },
  PAINT: {
    A: [ex('Protección pasiva contra fuego faltante en estructura crítica', 'Missing passive fire protection on critical steel')],
    B: [ex('Espesor de recubrimiento bajo en zona corrosiva', 'Low coating thickness in corrosive area')],
    C: [ex('Retoque de pintura por golpes de montaje', 'Paint touch-up from erection damage'), ex('Color de seguridad desvanecido', 'Faded safety colour')],
  },
  SAFE: {
    A: [ex('Detector de gas sin calibrar o sin probar', 'Gas detector not calibrated or tested'), ex('Sistema de diluvio sin prueba de flujo', 'Deluge system without flow test'), ex('Ducha de emergencia sin agua', 'Emergency shower without water')],
    B: [ex('Señalización de rutas de evacuación incompleta', 'Incomplete escape-route signage'), ex('Extintor sin inspección registrada', 'Extinguisher without recorded inspection')],
    C: [ex('Soporte de extintor flojo', 'Loose extinguisher bracket')],
  },
  TELE: {
    A: [ex('Megafonía o alarma general inaudible en área de proceso', 'PA / general alarm inaudible in process area')],
    B: [ex('Cámara de CCTV sin enfocar', 'Unfocused CCTV camera'), ex('Enlace de red sin redundancia probada', 'Network link without tested redundancy')],
    C: [ex('Patch cord sin etiquetar', 'Unlabelled patch cord')],
  },
}

export function examplesFor(disciplineCode: string | null | undefined): Examples {
  const code = (disciplineCode ?? '').trim().toUpperCase()
  return DISCIPLINE_EXAMPLES[code] ?? DISCIPLINE_EXAMPLES.GENERIC
}

export const STARTUP_DISPOSITION_HELP: Record<StartupDisposition, Text> = {
  close_before_startup: { es: 'Debe cerrarse antes de arrancar.', en: 'Must be closed before start-up.' },
  controls: { es: 'Puede quedar abierto con controles documentados durante el arranque.', en: 'May remain open with documented controls during start-up.' },
  long_term: { es: 'No afecta el arranque; se atiende como mejora posterior.', en: 'Does not affect start-up; handled as a later improvement.' },
}

/**
 * Bloqueos del PSSR por pendientes del sistema (§10.7): todo punch abierto necesita disposición y
 * ninguno «cerrar antes del arranque» puede seguir abierto. Recibe solo punch abiertos.
 */
export function startupDispositionBlockers<P extends { startup_disposition: string | null }>(openPunches: P[]) {
  return {
    missing: openPunches.filter(p => !p.startup_disposition),
    mustClose: openPunches.filter(p => p.startup_disposition === 'close_before_startup'),
  }
}
