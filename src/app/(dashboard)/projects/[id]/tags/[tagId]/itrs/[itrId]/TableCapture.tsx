'use client'

// Captura de un ítem `table`: columnas declaradas en la plantilla, filas fijas
// (se muestran de inmediato) o variables (el inspector declara la cantidad).
// Cada cambio envía la captura completa como JSON; la evaluación local es el
// espejo de evaluate_itr_table en SQL.

import { useEffect, useRef, useState } from 'react'
import { evaluateTable, reshapeTable, type TableCapture as Capture, type TableCellValue } from '@/lib/itr/table'

export default function TableCapture({ options, value, disabled, onChange }: {
  options: unknown
  value: string | null
  disabled: boolean
  onChange: (value: string) => void
}) {
  const evaluated = evaluateTable(options, value)
  const config = evaluated.config
  const initial = evaluated.data ?? (config && config.rows.mode === 'fixed' ? reshapeTable(config, null, config.rows.labels.length) : null)
  const [count, setCount] = useState(String(evaluated.data?.count ?? (config?.rows.mode === 'variable' ? config.rows.min : 1)))
  const [error, setError] = useState('')
  const current = useRef<Capture | null>(initial)
  useEffect(() => {
    const next = evaluateTable(options, value)
    current.current = next.data ?? (next.config && next.config.rows.mode === 'fixed' ? reshapeTable(next.config, null, next.config.rows.labels.length) : null)
  }, [options, value])

  const field = { width: '100%', minWidth: '90px', padding: '7px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: '12px', boxSizing: 'border-box' } as const

  if (!config) return <p role="alert" style={{ color: '#b91c1c', fontSize: '12px' }}>La plantilla no define columnas válidas para esta tabla; corrígela antes de ejecutar.</p>

  function configure() {
    if (!config) return
    const n = Number(count)
    if (config.rows.mode === 'variable' && (!Number.isInteger(n) || n < config.rows.min || n > config.rows.max)) {
      setError(`Indica una cantidad entera entre ${config.rows.min} y ${config.rows.max}.`); return
    }
    const next = reshapeTable(config, current.current, config.rows.mode === 'fixed' ? config.rows.labels.length : n)
    const removed = current.current?.rows.filter(row => !next.rows.some(other => other.id === row.id)) ?? []
    if (removed.some(row => Object.values(row.cells).some(cell => cell !== null && cell !== '')) && !window.confirm('Este cambio retira filas con información. ¿Confirmas cambiar la cantidad?')) return
    setError(''); current.current = next; onChange(JSON.stringify(next))
  }

  function changeCell(rowId: string, key: string, cell: TableCellValue) {
    if (!current.current || disabled) return
    const next: Capture = { ...current.current, rows: current.current.rows.map(row => row.id === rowId ? { ...row, cells: { ...row.cells, [key]: cell } } : row) }
    current.current = next; onChange(JSON.stringify(next))
  }

  // Render from props (pure); the ref only seeds the next capture inside handlers.
  const data = evaluated.data ?? (config.rows.mode === 'fixed' ? reshapeTable(config, null, config.rows.labels.length) : null)
  const rowsLabel = config.rows.mode === 'variable' ? config.rows.label : 'Fila'

  return <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
    {config.rows.mode === 'variable' && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end', marginBottom: '10px' }}>
        <label style={{ fontSize: '12px' }}>Cantidad de {config.rows.label.toLowerCase()}s ({config.rows.min}–{config.rows.max})
          <input aria-label="Cantidad de filas" style={{ ...field, width: '110px' }} type="number" min={config.rows.min} max={config.rows.max} step={1} value={count} onChange={e => setCount(e.target.value)} />
        </label>
        <button type="button" onClick={configure} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', cursor: 'pointer' }}>{evaluated.data ? 'Actualizar filas' : 'Crear filas'}</button>
      </div>
    )}
    {error && <p role="alert" style={{ color: '#b91c1c', fontSize: '12px' }}>{error}</p>}
    {data && <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
          <thead><tr>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)' }}>{rowsLabel}</th>
            {config.columns.map(column => (
              <th key={column.key} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {column.label}{column.unit ? ` (${column.unit})` : ''}{column.required ? '' : ' ·opc.'}
              </th>
            ))}
          </tr></thead>
          <tbody>{data.rows.map(row => {
            const rowFail = config.columns.some(column => column.type === 'result' && row.cells[column.key] === 'fail')
            return (
              <tr key={row.id} style={{ background: rowFail ? '#fef2f2' : undefined }}>
                <th scope="row" style={{ padding: '6px 8px', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600 }}>{row.label}</th>
                {config.columns.map(column => {
                  const cell = row.cells[column.key]
                  const label = `${row.label} ${column.label}`
                  if (column.type === 'number') return <td key={column.key}><input aria-label={label} style={field} type="number" step="any" value={typeof cell === 'number' ? cell : ''} onChange={e => changeCell(row.id, column.key, e.target.value === '' || !Number.isFinite(e.target.valueAsNumber) ? null : e.target.valueAsNumber)} /></td>
                  if (column.type === 'select') return <td key={column.key}><select aria-label={label} style={field} value={typeof cell === 'string' ? cell : ''} onChange={e => changeCell(row.id, column.key, e.target.value)}><option value="">—</option>{(column.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}</select></td>
                  if (column.type === 'result') return <td key={column.key}><select aria-label={label} style={{ ...field, color: cell === 'fail' ? '#b91c1c' : cell === 'pass' ? '#047857' : undefined }} value={typeof cell === 'string' ? cell : ''} onChange={e => changeCell(row.id, column.key, e.target.value)}><option value="">Pendiente</option><option value="pass">Aceptado</option><option value="fail">Rechazado</option><option value="not_applicable">No aplica</option></select></td>
                  return <td key={column.key}><input aria-label={label} style={{ ...field, minWidth: '140px' }} value={typeof cell === 'string' ? cell : ''} onChange={e => changeCell(row.id, column.key, e.target.value)} /></td>
                })}
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      <p role="status" style={{ fontSize: '12px', margin: '6px 0 0', color: evaluated.hasFail ? '#b91c1c' : 'var(--text-muted)' }}>
        {evaluated.hasFail ? 'Hay resultados rechazados o fuera del rango declarado.' : evaluated.isComplete ? 'Registro diligenciado; pendiente de las aprobaciones que correspondan.' : evaluated.data ? `Registro pendiente: ${evaluated.errors.slice(0, 3).join(' · ')}${evaluated.errors.length > 3 ? ` · +${evaluated.errors.length - 3}` : ''}` : 'Registro pendiente: diligencia las celdas requeridas.'}
      </p>
    </>}
  </fieldset>
}
