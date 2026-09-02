'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { importMatrixRows, type MatrixImportRow, type MatrixImportResult } from '@/app/actions/itr-matrix'
import { detectHeaderRow, sheetToRows, cellText, type ColumnKeywords } from '@/lib/excel/detect-header'

// Lee la plantilla "CommUp_Matriz_ITR_por_tipo_de_equipo.xlsx" (o cualquier
// Excel con columnas TIPO + CODIGO ITR). También acepta el camino inverso:
// la columna "TIPOS QUE APLICAN" de la hoja Catálogo ITR.

const MATRIX_COLS: ColumnKeywords = {
  tipo:      ['TIPO', 'TIPO EQUIPO', 'EQUIPMENT TYPE', 'CODIGO TIPO'],
  itr:       ['CODIGO ITR', 'CODIGO', 'ITR', 'TEMPLATE', 'PLANTILLA'],
  required:  ['OBLIGATORIO', 'OBLIGATORIO (S/N)', 'REQUIRED'],
  condition: ['CONDICION', 'CONDITION'],
  notes:     ['NOTAS', 'NOTES', 'OBSERVACIONES'],
}
const CATALOG_COLS: ColumnKeywords = {
  code:  ['CODIGO', 'CODE'],
  types: ['TIPOS QUE APLICAN', 'TIPOS', 'EQUIPMENT TYPES'],
}

function parseWorkbook(wb: XLSX.WorkBook): { rows: MatrixImportRow[]; notes: string[] } {
  const rows: MatrixImportRow[] = []
  const notes: string[] = []
  const seen = new Set<string>()
  const push = (r: MatrixImportRow) => {
    const key = `${r.equipment_type_code.toUpperCase()}|${r.template_code.toUpperCase()}`
    if (seen.has(key)) return
    seen.add(key); rows.push(r)
  }

  for (const name of wb.SheetNames) {
    const raw = sheetToRows(wb.Sheets[name])
    if (raw.length < 2) continue
    const m = detectHeaderRow(raw, MATRIX_COLS)
    if (m.colIndex.tipo !== undefined && m.colIndex.itr !== undefined) {
      let n = 0
      for (const row of raw.slice(m.headerRowIdx + 1)) {
        const tipo = cellText(row, m.colIndex.tipo)
        const itr = cellText(row, m.colIndex.itr)
        if (!tipo || !itr) continue
        const req = cellText(row, m.colIndex.required).toUpperCase()
        push({
          equipment_type_code: tipo,
          template_code: itr,
          required: req ? !['N', 'NO', 'FALSE', '0'].includes(req) : undefined,
          condition: cellText(row, m.colIndex.condition) || undefined,
          notes: cellText(row, m.colIndex.notes) || undefined,
        })
        n++
      }
      if (n) notes.push(`Hoja "${name}": ${n} filas tipo → ITR`)
      continue
    }
    const c = detectHeaderRow(raw, CATALOG_COLS)
    if (c.colIndex.code !== undefined && c.colIndex.types !== undefined) {
      let n = 0
      for (const row of raw.slice(c.headerRowIdx + 1)) {
        const code = cellText(row, c.colIndex.code)
        const types = cellText(row, c.colIndex.types)
        if (!code || !types) continue
        for (const t of types.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)) {
          push({ equipment_type_code: t, template_code: code })
          n++
        }
      }
      if (n) notes.push(`Hoja "${name}": ${n} relaciones desde "Tipos que aplican"`)
    }
  }
  return { rows, notes }
}

export default function ImportMatrixModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<MatrixImportRow[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MatrixImportResult | null>(null)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array' })
        const parsed = parseWorkbook(wb)
        if (parsed.rows.length === 0) { setError('No encontré filas con TIPO y CODIGO ITR (ni "Tipos que aplican" en el catálogo).'); return }
        setError(null); setFileName(file.name); setRows(parsed.rows); setNotes(parsed.notes); setResult(null)
      } catch {
        setError('No se pudo leer el archivo. Verifica que sea un .xlsx válido.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    setLoading(true); setError(null)
    const res = await importMatrixRows(rows)
    setLoading(false)
    if (res.error) { setError(res.error); return }
    setResult(res.result ?? null)
    router.refresh()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 14, maxWidth: 640, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>Importar matriz desde Excel</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Tu matriz (plantilla CommUp o cualquier hoja con TIPO y CODIGO ITR). Las filas entran como aceptadas y la IA nunca las pisa.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ border: '2px dashed var(--gray-300)', borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', background: 'var(--gray-50)' }}>
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{fileName ?? 'Selecciona el Excel de la matriz'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>.xlsx · hoja «Matriz» y/o columna «Tipos que aplican» del catálogo</div>
          </label>

          {error && <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {rows.length > 0 && !result && (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {notes.map((n, i) => <div key={i}>{n}</div>)}
                <div style={{ marginTop: 4, fontWeight: 600, color: 'var(--text-strong)' }}>{rows.length} relaciones únicas listas para importar</div>
              </div>
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: 'var(--gray-50)' }}>{['Tipo', 'ITR', 'Oblig.', 'Condición'].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.slice(0, 40).map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '5px 10px', fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{r.equipment_type_code}</td>
                        <td style={{ padding: '5px 10px', fontFamily: 'ui-monospace, monospace' }}>{r.template_code}</td>
                        <td style={{ padding: '5px 10px' }}>{r.required === false ? 'N' : 'S'}</td>
                        <td style={{ padding: '5px 10px', color: 'var(--text-muted)' }}>{r.condition ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 40 && <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--gray-400)' }}>Mostrando 40 de {rows.length}</div>}
              </div>
              <button onClick={handleImport} disabled={loading} style={{ alignSelf: 'flex-end', padding: '9px 18px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}>
                {loading ? 'Importando…' : `✓ Importar ${rows.length} relaciones`}
              </button>
            </>
          )}

          {result && (
            <div style={{ padding: '12px 14px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, fontSize: 13, color: '#065f46' }}>
              <div><strong>{result.imported}</strong> nuevas · <strong>{result.updated}</strong> actualizadas · {result.skipped} omitidas</div>
              {result.errors.length > 0 && (
                <div style={{ marginTop: 8, color: '#991b1b' }}>
                  {result.errors.slice(0, 8).map((e, i) => <div key={i}>Fila {e.row}: {e.reason}</div>)}
                  {result.errors.length > 8 && <div>… y {result.errors.length - 8} más</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
