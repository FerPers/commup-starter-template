/**
 * Gates opcionales tomados de la Process Commissioning Guide Book (4.6, 6.7) que una org puede
 * activar además de MC/RFPC/RFC/RFSU (decisión 2026-10-12: los de CommUp por defecto, el resto
 * opcional). Nacen con criterios de declaración con evidencia; cuando existan los registros de
 * la fase 3 se podrán reemplazar por criterios automáticos.
 */

export type CatalogCriterion = {
  kind: 'itr_phase_approved' | 'certificates_issued' | 'pssr_approved' | 'critical_tags_ready' | 'manual_attestation'
  label?: string
}

export type CatalogGate = {
  key: string
  code: string
  name: string
  description: string
  criteria: CatalogCriterion[]
}

export const READINESS_GATE_CATALOG: CatalogGate[] = [
  {
    key: 'utility_ready',
    code: 'UTILITY',
    name: 'Utilities disponibles',
    description: 'Utilities requeridas disponibles con calidad, presión, caudal y capacidad aceptables (guía 4.6, gate 3).',
    criteria: [
      { kind: 'manual_attestation', label: 'Utilities habilitantes disponibles y estables (potencia, aire de instrumentos, N₂, agua de enfriamiento)' },
      { kind: 'manual_attestation', label: 'Calidad de utilities verificada (punto de rocío del aire, pureza de N₂)' },
    ],
  },
  {
    key: 'functional_ready',
    code: 'FUNCTIONAL',
    name: 'Pruebas funcionales completas',
    description: 'Equipos, instrumentos, controles y protecciones probados funcionalmente (guía 4.6, gate 4).',
    criteria: [
      { kind: 'critical_tags_ready' },
      { kind: 'manual_attestation', label: 'Lazos, alarmas, disparos, permisivos y matriz C&E probados' },
    ],
  },
  {
    key: 'process_introduction',
    code: 'PROC-INTRO',
    name: 'Listo para introducir proceso / hidrocarburo',
    description: 'El sistema puede recibir inventario de proceso (guía 4.6, gate 5; cap. 17).',
    criteria: [
      { kind: 'pssr_approved' },
      { kind: 'critical_tags_ready' },
      { kind: 'manual_attestation', label: 'Inertización aceptada (O₂ medido en puntos representativos)' },
      { kind: 'manual_attestation', label: 'Line-up verificado de forma independiente y sin bypasses de protección activos' },
    ],
  },
  {
    key: 'performance_ready',
    code: 'PERF-TEST',
    name: 'Listo para prueba de desempeño',
    description: 'Operación estable y sistemas de medición validados (guía 4.6, gate 7; cap. 18).',
    criteria: [
      { kind: 'manual_attestation', label: 'Operación estable dentro de la envolvente durante el periodo definido' },
      { kind: 'manual_attestation', label: 'Instrumentación de la prueba calibrada y procedimiento de prueba aprobado' },
    ],
  },
  {
    key: 'handover_ready',
    code: 'HANDOVER',
    name: 'Listo para traspaso a operaciones',
    description: 'Documentación técnica y operativa completa para el traspaso (guía 4.6, gate 8; cap. 16).',
    criteria: [
      { kind: 'manual_attestation', label: 'Dossier técnico completo y aceptado' },
      { kind: 'manual_attestation', label: 'Operadores entrenados y procedimientos de operación aprobados' },
    ],
  },
]

/** Roles que pueden aprobar un gate (mismo orden que org_member_role). */
export const GATE_APPROVAL_ROLES = ['owner', 'admin', 'architect', 'leader', 'inspector', 'client'] as const
