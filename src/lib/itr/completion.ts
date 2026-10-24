import { evaluateContinuity } from './continuity'
import { evaluateTable, type SourceRow } from './table'
import { evaluateSelectionOutcome } from './selection-outcome'
import type { ItrTemplateItem, ItrResponse, ItrAttachment } from '@/types/database'

export type CompletionItem = Pick<ItrTemplateItem, 'id' | 'item_type' | 'is_required' | 'requires_photo' | 'requires_measurement' | 'condition_item_id' | 'condition_value'> & {
  options: unknown; option_outcomes?: unknown; requires_document?: boolean
  /** A29: para el rechazo crítico (= evaluate_itr_capture). */
  is_critical?: boolean; acceptance_min?: number | null; acceptance_max?: number | null
}
export type CompletionResponse = Pick<ItrResponse, 'item_id' | 'value_text' | 'value_numeric' | 'value_bool' | 'value_option'> & { remarks?: string | null; is_passed?: boolean | null }
/**
 * `pending` = foto o PDF tomado sin red que espera en la bandeja del dispositivo (G-17): cuenta para diligenciar,
 * así el inspector puede firmar sin red; el replay sube la foto antes de la firma y el servidor vuelve a validar.
 */
export type CompletionAttachment = Pick<ItrAttachment, 'item_id' | 'file_url' | 'file_type'> & { pending?: boolean }

const hasText = (value: string | null | undefined): value is string => typeof value === 'string' && value.trim().length > 0
const hasNumber = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value)
const stored = (attachment: CompletionAttachment) => hasText(attachment.file_url) || attachment.pending === true

/**
 * A29: aceptación de una medición con límites, la misma regla que evaluate_itr_capture y upsertResponse.
 * null = no es medición, no tiene límites o no tiene valor (vale el `is_passed` guardado).
 */
export function measurementPassed(
  item: Pick<CompletionItem, 'item_type' | 'acceptance_min' | 'acceptance_max'>,
  value: number | null | undefined,
): boolean | null {
  if (item.item_type !== 'measurement' || !hasNumber(value)) return null
  const min = item.acceptance_min ?? null, max = item.acceptance_max ?? null
  if (min === null && max === null) return null
  return (min === null || value >= Number(min)) && (max === null || value <= Number(max))
}

/**
 * Diligenciamiento only. Acceptance, assigned signers and approval remain separate gates.
 * A29: espejo de evaluate_itr_capture (la que usa la firma); la paridad sobre datos reales vive en
 * tests/db/itr-completion-parity.test.ts. Un cambio de regla va en los dos lados y en sus escenarios.
 */
export function evaluateItrCompletion(
  items: readonly CompletionItem[],
  responses: readonly CompletionResponse[],
  attachments: readonly CompletionAttachment[] = [],
  /** Fase 4-D: foto del ITR (itrs.source_rows) para las tablas con filas desde lazo o matriz C&E. */
  sourceRows: SourceRow[] | null = null,
) {
  const byId = new Map(items.map(item => [item.id, item]))
  const answers = new Map(responses.map(response => [response.item_id, response]))
  const invalid = new Set<string>()
  const visibility = new Map<string, boolean>()
  const visiting = new Set<string>()
  function applicable(item: CompletionItem): boolean {
    if (visibility.has(item.id)) return visibility.get(item.id)!
    if (visiting.has(item.id)) {
      for (const id of visiting) invalid.add(id)
      return false
    }
    visiting.add(item.id)
    let result = true
    if (item.condition_item_id) {
      const parent = byId.get(item.condition_item_id)
      if (!parent || item.condition_value === null) {
        invalid.add(item.id)
        result = false
      } else {
        const parentApplicable = applicable(parent)
        if (invalid.has(parent.id)) invalid.add(item.id)
        const answer = answers.get(parent.id)
        // Read only the value matching the parent's type, never a stale value in another column.
        const value = parent.item_type === 'checkbox' || parent.item_type === 'yes_no' ? answer?.value_bool
          : parent.item_type === 'number' || parent.item_type === 'measurement' ? answer?.value_numeric
          : parent.item_type === 'select' ? answer?.value_option : answer?.value_text
        result = parentApplicable && value !== null && value !== undefined && String(value) === item.condition_value
      }
    }
    visiting.delete(item.id)
    visibility.set(item.id, result)
    return result
  }
  function filled(item: CompletionItem): boolean {
    const answer = answers.get(item.id)
    const photo = attachments.some(attachment => attachment.item_id === item.id && stored(attachment) && attachment.file_type.startsWith('image/'))
    if (item.requires_photo && !photo) return false
    // Documentary evidence (certificates, contractor records) is a PDF linked to the item.
    if (item.requires_document && !attachments.some(attachment => attachment.item_id === item.id && stored(attachment) && attachment.file_type === 'application/pdf')) return false
    if (item.requires_measurement && !hasNumber(answer?.value_numeric)) return false
    switch (item.item_type) {
      case 'continuity': return evaluateContinuity(answer?.value_text).isComplete
      case 'table': return evaluateTable(item.options, answer?.value_text, sourceRows).isComplete
      case 'text': return hasText(answer?.value_text)
      case 'number':
      case 'measurement': return hasNumber(answer?.value_numeric)
      // S05 (C-20), espejo de evaluate_itr_capture: la casilla cuenta solo marcada; un «No» pide observación.
      case 'checkbox': return answer?.value_bool === true
      case 'yes_no': return answer?.value_bool === true || (answer?.value_bool === false && hasText(answer.remarks))
      case 'select': return hasText(answer?.value_option) && evaluateSelectionOutcome(item.options, item.option_outcomes ?? {}, answer.value_option, answer.remarks).valid
      case 'date': {
        const value = answer?.value_text
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
        const date = new Date(`${value}T00:00:00.000Z`)
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
      }
      case 'photo': return photo
      // The execution UI has no item-level signature capture; native signatures are separate.
      case 'signature': return false
      default: return false
    }
  }
  const applicableItems = items.filter(applicable)
  const required = applicableItems.filter(item => item.is_required || (item.item_type === 'select' && evaluateSelectionOutcome(item.options, item.option_outcomes ?? {}, answers.get(item.id)?.value_option).requiresJustification))
  const rejectedItemIds = applicableItems.filter(item => (item.item_type === 'continuity' && evaluateContinuity(answers.get(item.id)?.value_text).hasFail) || (item.item_type === 'table' && evaluateTable(item.options, answers.get(item.id)?.value_text, sourceRows).hasFail) || (item.item_type === 'select' && evaluateSelectionOutcome(item.options, item.option_outcomes ?? {}, answers.get(item.id)?.value_option).outcome === 'fail')).map(item => item.id)
  // A29 (= evaluate_itr_capture.has_critical_fail): un crítico no aceptado (medición fuera de límites, selección
  // `fail` o el `is_passed` guardado) o cualquier rechazo de selección, continuidad o tabla.
  const passedOf = (item: CompletionItem): boolean | null => {
    const answer = answers.get(item.id)
    if (item.item_type === 'select') {
      const outcome = evaluateSelectionOutcome(item.options, item.option_outcomes ?? {}, answer?.value_option).outcome
      return outcome === 'pass' ? true : outcome === 'fail' ? false : null
    }
    return measurementPassed(item, answer?.value_numeric) ?? answer?.is_passed ?? null
  }
  const hasCriticalFail = rejectedItemIds.length > 0 || applicableItems.some(item => item.is_critical === true && passedOf(item) === false)
  const missingRequiredItemIds = required.filter(item => !filled(item)).map(item => item.id)
  const completedCount = applicableItems.filter(filled).length
  const completedRequiredCount = required.length - missingRequiredItemIds.length
  const isComplete = applicableItems.length > 0 && invalid.size === 0 && missingRequiredItemIds.length === 0
  // This percentage represents satisfaction of required capture, not technical approval.
  const progressPct = isComplete ? 100 : required.length > 0 ? Math.min(99, Math.floor(completedRequiredCount * 100 / required.length)) : 0
  return { isComplete, progressPct, rejectedItemIds, hasCriticalFail, applicableItemIds: applicableItems.map(item => item.id), applicableCount: applicableItems.length, requiredCount: required.length, completedCount, completedRequiredCount, missingRequiredItemIds, invalidConditionItemIds: [...invalid] }
}
