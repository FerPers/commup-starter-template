import { expectedContinuityIds, type ContinuityCapture } from './continuity'

export function reshapeContinuity(previous: ContinuityCapture | null, grouping: ContinuityCapture['grouping'], count: number, shields: string[], measurementRequired: boolean): ContinuityCapture {
  const existing = new Map(previous?.rows.map(row => [row.id, row]) ?? [])
  return {
    version: 1, grouping, count, shields, measurementRequired,
    rows: expectedContinuityIds(grouping, count, shields).map(id => existing.get(id) ?? {
      id, from: '', to: '', result: '', remarks: '', reading: null, unit: '',
    }),
  }
}
