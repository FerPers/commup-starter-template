import type { PidTagHit } from '@/app/actions/tag-search'
import type { PageSize, Rotation } from '@/lib/pid/geometry'
import type { Markup } from '@/lib/pid/markups'
import type { RowState } from '@/lib/readiness/matrix'

/** P1: el sistema trae su color estable del proyecto (`systems.color`). */
export type SystemRef = { id: string; code: string; name: string; color: string }

export type Discipline = { id: string; code: string; name: string; color: string }

export type Hotspot = {
  id: string; tag_id: string; page_num: number; x_pct: number; y_pct: number
  /** N2d: copiado de la revisión anterior; falta confirmar que quedó en su lugar. */
  needs_review: boolean
  tag: { id: string; tag_number: string; description: string; status: string }
  discipline: Discipline
  system: SystemRef | null
  open_punches_a: number
  open_punches_b: number
  itr_completion_pct: number
}

export type TagItem = PidTagHit

export type ColorBy = 'status' | 'system'

/** P2: marca LOSH de la revisión abierta (pid_markups). */
export type MarkupView = Markup

/** Herramientas del visor (maqueta P2): elegir, mover, resaltar línea, límite, etiqueta, conector (P4), pin de tag. */
export type Tool = 'select' | 'pan' | 'line' | 'limit' | 'label' | 'connector' | 'pin'

/** P4: P&ID del proyecto (destino de un conector). */
export type PidDoc = { id: string; number: string; title: string | null }

/** P4: conector de otra hoja vigente que apunta a este documento (para saber si los de aquí tienen par). */
export type IncomingConnector = {
  id: string; document_id: string; page_num: number; system_id: string; target_document_id: string; target_page: number | null
}

/** Hoja abierta: tamaño en puntos PDF ya rotada y su rotación (las marcas se guardan con esto). */
export type PageInfo = PageSize & { rotation: Rotation }

/** Liberaciones aprobadas (sin revocar) por sistema: editar sus marcas queda registrado. */
export type ApprovedGates = Record<string, string[]>

/** P3: liberación siguiente de cada sistema (de compute_project_gates) para colorear «Por estado». */
export type SystemStates = Record<string, { state: RowState; gate: string | null }>
