'use client'

import { useEffect, useRef, useState } from 'react'
import { evaluateContinuity, type ContinuityCapture as Capture, type ContinuityRow } from '@/lib/itr/continuity'
import { reshapeContinuity } from '@/lib/itr/continuity-editor'

export default function ContinuityCapture({ value, disabled, onChange }: { value: string | null; disabled: boolean; onChange: (value: string) => void }) {
  const evaluated = evaluateContinuity(value)
  const data = evaluated.data
  const [grouping, setGrouping] = useState<Capture['grouping']>(data?.grouping ?? 'pairs')
  const [count, setCount] = useState(String(data?.count ?? 1))
  const [shields, setShields] = useState(data?.shields.join('\n') ?? '')
  const [measurement, setMeasurement] = useState(data?.measurementRequired ?? false)
  const [error, setError] = useState('')
  const current = useRef(data)
  useEffect(() => { current.current = evaluateContinuity(value).data }, [value])
  const field = { width: '100%', minWidth: '95px', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-strong)' } as const
  function configure() {
    const n = Number(count)
    const ids = shields.split('\n').map(s => s.trim()).filter(Boolean)
    if (!Number.isInteger(n) || n < 1 || n > 500 || new Set(ids).size !== ids.length) {
      setError('Indica una cantidad entera de 1 a 500 y pantallas sin identificadores repetidos.'); return
    }
    const next = reshapeContinuity(current.current, grouping, n, ids, measurement)
    const removed = current.current?.rows.filter(row => !next.rows.some(other => other.id === row.id)) ?? []
    if (removed.some(row => [row.result, row.from, row.to, row.remarks, row.unit].some(value => value.length > 0) || row.reading !== null) && !window.confirm('Este cambio retira filas con información. ¿Confirmas cambiar la configuración?')) return
    setError(''); current.current = next; onChange(JSON.stringify(next))
  }
  function changeRow(id: string, patch: Partial<ContinuityRow>) {
    if (!current.current || disabled) return
    const next = { ...current.current, rows: current.current.rows.map(row => row.id === id ? { ...row, ...patch } : row) }
    current.current = next; onChange(JSON.stringify(next))
  }
  return <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
    <legend style={{ fontWeight: 600, marginBottom: '10px' }}>Registro de continuidad por conductor</legend>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end' }}>
      <label>Organización<select aria-label="Organización del cable" style={field} value={grouping} onChange={e => setGrouping(e.target.value as Capture['grouping'])}><option value="pairs">Pares</option><option value="conductors">Conductores</option></select></label>
      <label>{grouping === 'pairs' ? 'Número de pares' : 'Número de conductores'}<input aria-label="Cantidad de pares o conductores" style={field} type="number" min={1} max={500} step={1} value={count} onChange={e => setCount(e.target.value)} /></label>
      <label>Pantallas / blindajes (un identificador por línea)<textarea aria-label="Identificadores de pantallas" style={field} value={shields} onChange={e => setShields(e.target.value)} /></label>
      <label><input type="checkbox" checked={measurement} onChange={e => setMeasurement(e.target.checked)} /> El procedimiento exige lectura y unidad</label>
      <button type="button" onClick={configure} style={{ padding: '9px', borderRadius: '6px', border: '1px solid var(--border)' }}>{data ? 'Actualizar configuración' : 'Crear filas'}</button>
    </div>
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    {data && <>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Cada conductor requiere sus terminales y resultado. “No aplica” exige justificación. Las filas nuevas quedan pendientes.</p>
      <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
        <thead><tr>{['Conductor / pantalla', 'Terminal origen', 'Terminal destino', 'Resultado', 'Lectura', 'Unidad', 'Observación / justificación'].map(title => <th key={title} style={{ padding: '8px', textAlign: 'left' }}>{title}</th>)}</tr></thead>
        <tbody>{data.rows.map(row => <tr key={row.id}>
          <th scope="row" style={{ padding: '8px', textAlign: 'left' }}>{row.id}</th>
          {(['from', 'to'] as const).map(key => <td key={key}><input aria-label={`${row.id} ${key === 'from' ? 'terminal origen' : 'terminal destino'}`} style={field} value={row[key]} onChange={e => changeRow(row.id, { [key]: e.target.value })} /></td>)}
          <td><select aria-label={`${row.id} resultado`} style={field} value={row.result} onChange={e => changeRow(row.id, { result: e.target.value as ContinuityRow['result'] })}><option value="">Pendiente</option><option value="pass">Aceptado</option><option value="fail">Rechazado</option><option value="not_applicable">No aplica</option></select></td>
          <td><input aria-label={`${row.id} lectura`} style={field} type="number" step="any" value={row.reading ?? ''} onChange={e => changeRow(row.id, { reading: e.target.value === '' || !Number.isFinite(e.target.valueAsNumber) ? null : e.target.valueAsNumber })} /></td>
          <td><input aria-label={`${row.id} unidad`} style={field} value={row.unit} onChange={e => changeRow(row.id, { unit: e.target.value })} /></td>
          <td><textarea aria-label={`${row.id} justificación`} style={field} value={row.remarks} onChange={e => changeRow(row.id, { remarks: e.target.value })} /></td>
        </tr>)}</tbody>
      </table></div>
      <p role="status" style={{ fontSize: '12px', color: evaluated.hasFail ? '#b91c1c' : 'var(--text-muted)' }}>{evaluated.hasFail ? 'Hay resultados rechazados.' : evaluated.isComplete ? 'Registro diligenciado; pendiente de las aprobaciones que correspondan.' : 'Registro pendiente: completa terminales, resultados y requisitos del procedimiento.'}</p>
    </>}
  </fieldset>
}
