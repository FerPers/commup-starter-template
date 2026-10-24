import { expectedContinuityIds, type ContinuityCapture, type ContinuityScope } from './continuity'

/** A38: las filas salen del alcance fijado (no las configura el ejecutor); conserva lo ya capturado por id. */
export function reshapeContinuity(previous: ContinuityCapture | null, scope: Pick<ContinuityScope, 'grouping' | 'count' | 'shields'>, measurementRequired: boolean): ContinuityCapture {
  const existing = new Map(previous?.rows.map(row => [row.id, row]) ?? [])
  return {
    version: 1, grouping: scope.grouping, count: scope.count, shields: [...scope.shields], measurementRequired,
    rows: expectedContinuityIds(scope.grouping, scope.count, scope.shields).map(id => existing.get(id) ?? {
      id, from: '', to: '', result: '', remarks: '', reading: null, unit: '',
    }),
  }
}
