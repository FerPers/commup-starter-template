'use client'

// Captura de un ítem `table`: columnas declaradas en la plantilla, filas fijas
// (se muestran de inmediato) o variables (el inspector declara la cantidad).
// Cada cambio envía la captura completa como JSON; la evaluación local es el
// espejo de evaluate_itr_table en SQL. v2 (fase 4-C): la desviación y el resultado
// automático se muestran calculados (solo lectura); as found fuera de tolerancia se
// marca en ámbar y la serie muestra si cumple el criterio de estabilidad.
// Fase 4-D: con filas `source` las filas salen de la foto del ITR (señales del lazo / efectos de la
// causa) y las columnas de referencia se muestran en gris, sin edición.

import { useEffect, useRef, useState } from 'react'
import { evaluateTable, reshapeTable, sourceRefText, type SourceRow, type TableCapture as Capture, type TableCellValue, type TableConfig } from '@/lib/itr/table'

/** Captura inicial cuando aún no hay registro: filas fijas o las de la foto; las variables esperan la cantidad. */
function blank(config: TableConfig | null, sourceRows: SourceRow[] | null): Capture | null {
  if (!config) return null
  if (config.rows.mode === 'fixed') return reshapeTable(config, null, config.rows.labels.length)
  if (config.rows.mode === 'source' && sourceRows?.length) return reshapeTable(config, null, sourceRows.length, sourceRows)
  return null
}

export default function TableCapture({ options, value, disabled, onChange, sourceRows = null }: {
  options: unknown
  value: string | null
  disabled: boolean
  onChange: (value: string) => void
  sourceRows?: SourceRow[] | null
}) {
  const evaluated = evaluateTable(options, value, sourceRows)
  const config = evaluated.config
  const initial = evaluated.data ?? blank(config, sourceRows)
  const [count, setCount] = useState(String(evaluated.data?.count ?? (config?.rows.mode === 'variable' ? config.rows.min : 1)))
  const [error, setError] = useState('')
  const current = useRef<Capture | null>(initial)
  useEffect(() => {
    const next = evaluateTable(options, value, sourceRows)
    current.current = next.data ?? blank(next.config, sourceRows)
  }, [options, value, sourceRows])

  const field = { width: '100%', minWidth: '90px', padding: '7px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: '12px', boxSizing: 'border-box' } as const

  if (!config) return <p role="alert" style={{ color: 'var(--danger-700)', fontSize: '12px' }}>La plantilla no define columnas válidas para esta tabla; corrígela antes de ejecutar.</p>
  if (config.rows.mode === 'source' && !sourceRows?.length) return <p role="alert" style={{ color: 'var(--danger-700)', fontSize: '12px' }}>Esta tabla se arma con las señales del lazo o los efectos de la causa: genera el ITR desde la pantalla de lazos o la matriz C&E.</p>

  // Lo calculado (desviación, resultado automático) no se guarda: CommUp y SQL lo recalculan siempre.
  const serialize = (capture: Capture) => {
    if (!config) return JSON.stringify(capture)
    const derived = config.columns.filter(column => column.type === 'computed' || column.type === 'reference' || column.auto_from).map(column => column.key)
    return JSON.stringify({ ...capture, rows: capture.rows.map(row => ({ ...row, cells: { ...row.cells, ...Object.fromEntries(derived.map(key => [key, null])) } })) })
  }

  function configure() {
    if (!config) return
    const n = Number(count)
    if (config.rows.mode === 'variable' && (!Number.isInteger(n) || n < config.rows.min || n > config.rows.max)) {
      setError(`Indica una cantidad entera entre ${config.rows.min} y ${config.rows.max}.`); return
    }
    const next = reshapeTable(config, current.current, config.rows.mode === 'fixed' ? config.rows.labels.length : n)
    const removed = current.current?.rows.filter(row => !next.rows.some(other => other.id === row.id)) ?? []
    if (removed.some(row => Object.values(row.cells).some(cell => cell !== null && cell !== '')) && !window.confirm('Este cambio retira filas con información. ¿Confirmas cambiar la cantidad?')) return
    setError(''); current.current = next; onChange(serialize(next))
  }

  function changeCell(rowId: string, key: string, cell: TableCellValue) {
    if (!current.current || disabled) return
    const next: Capture = { ...current.current, rows: current.current.rows.map(row => row.id === rowId ? { ...row, cells: { ...row.cells, [key]: cell } } : row) }
    current.current = next; onChange(serialize(next))
  }

  // Render from props (pure); the ref only seeds the next capture inside handlers.
  const data = evaluated.data ?? blank(config, sourceRows)
  const rowsLabel = config.rows.mode === 'fixed' ? 'Fila' : config.rows.label

  return <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
    {config.rows.mode === 'variable' && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end', marginBottom: '10px' }}>
        <label style={{ fontSize: '12px' }}>Cantidad de {config.rows.label.toLowerCase()}s ({config.rows.min}–{config.rows.max})
          <input aria-label="Cantidad de filas" style={{ ...field, width: '110px' }} type="number" min={config.rows.min} max={config.rows.max} step={1} value={count} onChange={e => setCount(e.target.value)} />
        </label>
        <button type="button" onClick={configure} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', cursor: 'pointer' }}>{evaluated.data ? 'Actualizar filas' : 'Crear filas'}</button>
      </div>
    )}
    {error && <p role="alert" style={{ color: 'var(--danger-700)', fontSize: '12px' }}>{error}</p>}
    {data && <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
          <thead><tr>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)' }}>{rowsLabel}</th>
            {config.columns.map(column => (
              <th key={column.key} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {column.label}{column.unit ? ` (${column.unit})` : ''}{column.type === 'reference' ? '' : column.type === 'computed' || column.auto_from ? ' ·calc.' : column.required ? '' : ' ·opc.'}
                {column.type === 'computed' && column.tolerance !== null && column.tolerance !== undefined && <span style={{ fontWeight: 400 }}> ±{column.tolerance}</span>}
              </th>
            ))}
          </tr></thead>
          <tbody>{data.rows.map((row, rowIndex) => {
            const flags = evaluated.rowFlags[row.id]
            const rowFail = flags?.fail || config.columns.some(column => column.type === 'result' && row.cells[column.key] === 'fail')
            return (
              <tr key={row.id} style={{ background: rowFail ? 'var(--danger-50)' : flags?.asFoundOut ? 'var(--warning-50)' : undefined }}>
                <th scope="row" style={{ padding: '6px 8px', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600 }}>{row.label}</th>
                {config.columns.map(column => {
                  const cell = row.cells[column.key]
                  const label = `${row.label} ${column.label}`
                  if (column.type === 'reference') {
                    return <td key={column.key} style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: 'var(--text-muted)', background: 'var(--gray-50)' }} aria-label={label}>{sourceRefText(column.ref ?? '', sourceRows?.[rowIndex]?.refs[column.ref ?? ''])}</td>
                  }
                  if (column.type === 'computed') {
                    const out = typeof cell === 'number' && column.tolerance !== null && column.tolerance !== undefined && Math.abs(cell) > column.tolerance
                    return <td key={column.key} style={{ padding: '6px 8px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: out ? (column.pass === 'as_found' ? 'var(--warning-700)' : 'var(--danger-700)') : 'var(--text-strong)' }} aria-label={label}>
                      {typeof cell === 'number' ? cell.toFixed(3) : '—'}{out && column.pass === 'as_found' ? ' ⚑' : ''}
                    </td>
                  }
                  if (column.type === 'result' && column.auto_from) {
                    return <td key={column.key} style={{ padding: '6px 8px', fontWeight: 700, color: cell === 'fail' ? 'var(--danger-700)' : cell === 'pass' ? 'var(--success-700)' : 'var(--text-muted)' }} aria-label={label}>
                      {cell === 'pass' ? 'Aceptado' : cell === 'fail' ? 'Rechazado' : 'Pendiente'}
                    </td>
                  }
                  if (column.type === 'datetime') return <td key={column.key}><input aria-label={label} style={{ ...field, minWidth: '170px' }} type="datetime-local" value={typeof cell === 'string' ? cell : ''} onChange={e => changeCell(row.id, column.key, e.target.value)} /></td>
                  if (column.type === 'number') return <td key={column.key}><input aria-label={label} style={field} type="number" step="any" value={typeof cell === 'number' ? cell : ''} onChange={e => changeCell(row.id, column.key, e.target.value === '' || !Number.isFinite(e.target.valueAsNumber) ? null : e.target.valueAsNumber)} /></td>
                  if (column.type === 'select') return <td key={column.key}><select aria-label={label} style={field} value={typeof cell === 'string' ? cell : ''} onChange={e => changeCell(row.id, column.key, e.target.value)}><option value="">—</option>{(column.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}</select></td>
                  if (column.type === 'result') return <td key={column.key}><select aria-label={label} style={{ ...field, color: cell === 'fail' ? 'var(--danger-700)' : cell === 'pass' ? 'var(--success-700)' : undefined }} value={typeof cell === 'string' ? cell : ''} onChange={e => changeCell(row.id, column.key, e.target.value)}><option value="">Pendiente</option><option value="pass">Aceptado</option><option value="fail">Rechazado</option><option value="not_applicable">No aplica</option></select></td>
                  return <td key={column.key}><input aria-label={label} style={{ ...field, minWidth: '140px' }} value={typeof cell === 'string' ? cell : ''} onChange={e => changeCell(row.id, column.key, e.target.value)} /></td>
                })}
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      {evaluated.asFoundOut > 0 && (
        <p style={{ fontSize: '12px', margin: '6px 0 0', color: 'var(--warning-700)' }}>⚑ {evaluated.asFoundOut} punto(s) «as found» fuera de tolerancia: queda registrado; la aceptación se evalúa con «as left».</p>
      )}
      {evaluated.stability && config.stability && (
        <p style={{ fontSize: '12px', margin: '6px 0 0', fontWeight: 600, color: evaluated.stability.ok === false ? 'var(--danger-700)' : evaluated.stability.ok ? 'var(--success-700)' : 'var(--text-muted)' }}>
          Estabilidad: últimas {config.stability.last_n} lecturas {config.stability.min !== null ? `≥ ${config.stability.min}` : ''}{config.stability.min !== null && config.stability.max !== null ? ' y ' : ''}{config.stability.max !== null ? `≤ ${config.stability.max}` : ''} —{' '}
          {evaluated.stability.ok === null ? `faltan lecturas (${evaluated.stability.have}/${evaluated.stability.needed})` : evaluated.stability.ok ? 'cumple' : 'no cumple'}
        </p>
      )}
      <p role="status" style={{ fontSize: '12px', margin: '6px 0 0', color: evaluated.hasFail ? 'var(--danger-700)' : 'var(--text-muted)' }}>
        {evaluated.hasFail ? 'Hay resultados rechazados o fuera del rango declarado.' : evaluated.isComplete ? 'Registro diligenciado; pendiente de las aprobaciones que correspondan.' : evaluated.data ? `Registro pendiente: ${evaluated.errors.slice(0, 3).join(' · ')}${evaluated.errors.length > 3 ? ` · +${evaluated.errors.length - 3}` : ''}` : 'Registro pendiente: diligencia las celdas requeridas.'}
      </p>
    </>}
  </fieldset>
}
