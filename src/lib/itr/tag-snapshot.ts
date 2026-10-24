/**
 * A44 (parte): datos del tag que muestra y firma un ITR. La primera firma los congela en `itrs.tag_snapshot`
 * (sign_itr_atomic); mientras el ITR no tiene firmas se usan los del tag en vivo. Puro: lo usan la ficha y el PDF.
 */

export const TAG_DATA_FIELDS = [
  'tag_number', 'description', 'manufacturer', 'model', 'serial_number', 'datasheet_number', 'revision',
  'pid_drawing', 'range_min', 'range_max', 'eng_unit', 'junction_box',
] as const

export type TagDataField = typeof TAG_DATA_FIELDS[number]
export type TagData = Partial<Record<TagDataField, string | number | null>>

export type ResolvedTagData<T extends TagData> = {
  /** Lo que se muestra o imprime. */
  data: T | null
  /** true = es la foto de la firma; false = datos en vivo (sin firmar, o firmado antes de A44). */
  frozen: boolean
  /** Campos que el tag cambió después de la firma, con su valor de hoy. */
  changed: Partial<Record<TagDataField, string | number | null>>
}

const norm = (v: unknown) => (v === undefined || v === '' ? null : v)

export function resolveTagData<T extends TagData>(live: T | null, snapshot: unknown, signed: boolean): ResolvedTagData<T> {
  if (!signed || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return { data: live, frozen: false, changed: {} }
  const snap = snapshot as TagData
  const data = { ...(live ?? {}) } as T
  const changed: ResolvedTagData<T>['changed'] = {}
  for (const field of TAG_DATA_FIELDS) {
    if (!(field in snap)) continue
    const signedValue = norm(snap[field]) as T[TagDataField]
    if (live && norm(live[field]) !== signedValue) changed[field] = norm(live[field]) as string | number | null
    data[field] = signedValue
  }
  return { data, frozen: true, changed }
}
