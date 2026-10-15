'use client'

// Editor de la configuración de un ítem `table` (columnas + filas). Se guarda
// en itr_template_items.options y lo valida checkTableConfig (TS) e
// itr_table_config_valid (SQL). Los presets no fijan tolerancias, span ni límites.
// v2 (fase 4-C): desviación calculada con tolerancia, resultado automático,
// as found / as left, fecha y hora, y criterio de estabilidad para series.
// Fase 4-D: filas desde el lazo (una por señal) o desde la matriz C&E (una por efecto) y
// columnas de referencia que muestran datos de esa foto.

import { SOURCE_REFS, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, TABLE_PRESETS, checkTableConfig, type TableColumn, type TableConfig, type TableSource } from '@/lib/itr/table'
import { fieldInput, fieldLabel } from './template-builder-shared'

const EMPTY: TableConfig = { version: 1, columns: [], rows: { mode: 'fixed', labels: [] } }

function nextKey(columns: TableColumn[]): string {
  let n = columns.length + 1
  while (columns.some(column => column.key === `col${n}`)) n += 1
  return `col${n}`
}

/** La versión 2 solo cuando se usa algo de la v2: las tablas simples siguen siendo v1. */
function withVersion(config: TableConfig): TableConfig {
  const v2 = !!config.stability || config.rows.mode === 'source' || config.columns.some(c => c.type === 'computed' || c.type === 'datetime' || c.type === 'reference' || !!c.auto_from)
  return { ...config, version: v2 ? 2 : 1 }
}

const num = (v: string) => (v === '' ? null : Number(v))

export default function TableConfigEditor({ value, onChange }: { value: TableConfig | null; onChange: (config: TableConfig) => void }) {
  const config = value ?? EMPTY
  const set = (patch: Partial<TableConfig>) => onChange(withVersion({ ...config, ...patch }))
  const setColumn = (index: number, patch: Partial<TableColumn>) => set({ columns: config.columns.map((column, i) => i === index ? { ...column, ...patch } : column) })
  const small = { ...fieldInput, padding: '6px 8px', fontSize: '12px' } as const
  const numberCols = config.columns.filter(c => c.type === 'number')
  const computedCols = config.columns.filter(c => c.type === 'computed')
  const issue = config.columns.length ? checkTableConfig(config).issue : null
  const source: TableSource | null = config.rows.mode === 'source' ? config.rows.source : null

  function changeRows(mode: string) {
    if (mode === 'loop_signals' || mode === 'ce_effects') {
      set({ rows: { mode: 'source', source: mode, label: mode === 'loop_signals' ? 'Señal' : 'Efecto' }, stability: null,
        // Las referencias del otro origen no aplican: se quitan.
        columns: config.columns.filter(c => c.type !== 'reference' || (c.ref ?? '') in SOURCE_REFS[mode]) })
      return
    }
    const columns = config.columns.filter(c => c.type !== 'reference')
    set({ columns, rows: mode === 'variable' ? { mode: 'variable', min: 1, max: 20, label: 'Fila' } : { mode: 'fixed', labels: config.rows.mode === 'fixed' ? config.rows.labels : [] }, stability: mode === 'variable' ? config.stability : null })
  }

  function changeType(index: number, type: TableColumn['type']) {
    const column = config.columns[index]
    const patch: Partial<TableColumn> = { type, options: type === 'select' ? (column.options ?? ['Opción 1']) : null, min: null, max: null, auto_from: undefined, formula: undefined, tolerance: undefined, pass: undefined }
    if (type === 'reference' && config.rows.mode === 'source') {
      patch.ref = Object.keys(SOURCE_REFS[config.rows.source])[0]
      patch.required = false
    }
    if (type === 'computed') {
      patch.formula = { observed: numberCols[1]?.key ?? numberCols[0]?.key ?? '', reference: numberCols[0]?.key ?? '', mode: 'abs', span: null }
      patch.tolerance = null
      patch.pass = null
      patch.required = false
    }
    setColumn(index, patch)
  }

  return (
    <div style={{ padding: '12px 14px', background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: '8px', marginBottom: '12px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#155e75', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>Tabla de registro</div>

      <label style={{ ...fieldLabel, marginBottom: '10px' }}>Partir de un preset
        <select style={small} value="" onChange={e => { const preset = TABLE_PRESETS.find(p => p.id === e.target.value); if (preset) onChange(structuredClone(preset.config)) }}>
          <option value="">— Elegir —</option>
          {TABLE_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '10px', marginBottom: '10px' }}>
        <label style={fieldLabel}>Filas
          <select style={small} value={source ?? config.rows.mode} onChange={e => changeRows(e.target.value)}>
            <option value="fixed">Fijas (una por línea)</option>
            <option value="variable">Variables (el inspector declara la cantidad)</option>
            <option value="loop_signals">Desde el lazo (una por señal)</option>
            <option value="ce_effects">Desde la matriz C&E (una por efecto)</option>
          </select>
        </label>
        {config.rows.mode === 'fixed' ? (
          <label style={fieldLabel}>Etiquetas de fila (máx. 200)
            <textarea rows={3} style={{ ...small, fontFamily: 'monospace' }} value={config.rows.labels.join('\n')} placeholder={'0 %\n25 %\n50 %'} onChange={e => set({ rows: { mode: 'fixed', labels: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } })} />
          </label>
        ) : config.rows.mode === 'source' ? (
          <label style={fieldLabel}>Nombre de fila (se arma al generar el ITR desde {source === 'loop_signals' ? 'el lazo' : 'la causa'})
            <input style={small} value={config.rows.label} onChange={e => set({ rows: { ...config.rows, label: e.target.value } as TableConfig['rows'] })} placeholder="Señal" />
          </label>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: '8px' }}>
            <label style={fieldLabel}>Nombre de fila<input style={small} value={config.rows.label} onChange={e => set({ rows: { ...config.rows, mode: 'variable', label: e.target.value } as TableConfig['rows'] })} placeholder="Ciclo" /></label>
            <label style={fieldLabel}>Mín.<input style={small} type="number" min={1} max={TABLE_MAX_ROWS} value={config.rows.min} onChange={e => set({ rows: { ...config.rows, mode: 'variable', min: Number(e.target.value) } as TableConfig['rows'] })} /></label>
            <label style={fieldLabel}>Máx.<input style={small} type="number" min={1} max={TABLE_MAX_ROWS} value={config.rows.max} onChange={e => set({ rows: { ...config.rows, mode: 'variable', max: Number(e.target.value) } as TableConfig['rows'] })} /></label>
          </div>
        )}
      </div>

      <div style={{ fontSize: '12px', fontWeight: 600, color: '#155e75', margin: '4px 0 6px' }}>Columnas ({config.columns.length}/{TABLE_MAX_COLUMNS})</div>
      {config.columns.map((column, index) => {
        const numeric = column.type === 'number'
        return (
          <div key={column.key} style={{ marginBottom: '8px', paddingBottom: column.type === 'computed' || column.type === 'result' ? '6px' : 0, borderBottom: column.type === 'computed' || column.type === 'result' ? '1px dashed #a5f3fc' : 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 130px 70px 1fr 70px 70px auto auto', gap: '6px', alignItems: 'end' }}>
              <label style={fieldLabel}>Etiqueta<input style={small} value={column.label} onChange={e => setColumn(index, { label: e.target.value })} /></label>
              <label style={fieldLabel}>Tipo
                <select style={small} value={column.type} onChange={e => changeType(index, e.target.value as TableColumn['type'])}>
                  <option value="number">Número</option>
                  <option value="text">Texto</option>
                  <option value="select">Selección</option>
                  <option value="result">Resultado</option>
                  <option value="computed">Desviación calculada</option>
                  <option value="datetime">Fecha y hora</option>
                  {source && <option value="reference">Dato del {source === 'loop_signals' ? 'lazo' : 'efecto'} (solo lectura)</option>}
                </select>
              </label>
              <label style={fieldLabel}>Unidad<input style={small} value={column.unit ?? ''} disabled={!numeric && column.type !== 'computed'} onChange={e => setColumn(index, { unit: e.target.value || null })} /></label>
              <label style={fieldLabel}>{column.type === 'select' ? 'Opciones (coma)' : 'Criterio'}
                {column.type === 'reference' && source
                  ? <select style={small} value={column.ref ?? ''} onChange={e => setColumn(index, { ref: e.target.value })}>
                      {Object.entries(SOURCE_REFS[source]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  : column.type === 'select'
                  ? <input style={small} value={(column.options ?? []).join(', ')} onChange={e => setColumn(index, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                  : <input style={{ ...small, color: 'var(--text-muted)' }} disabled value={numeric ? 'min/max opcionales →' : column.type === 'result' ? (column.auto_from ? 'Automático ↓' : 'Aceptado / Rechazado / No aplica') : column.type === 'computed' ? 'Se calcula ↓' : column.type === 'datetime' ? 'AAAA-MM-DD hh:mm' : 'Texto libre'} />}
              </label>
              <label style={fieldLabel}>Mín.<input style={small} type="number" step="any" disabled={!numeric} value={column.min ?? ''} onChange={e => setColumn(index, { min: num(e.target.value) })} /></label>
              <label style={fieldLabel}>Máx.<input style={small} type="number" step="any" disabled={!numeric} value={column.max ?? ''} onChange={e => setColumn(index, { max: num(e.target.value) })} /></label>
              <label style={{ ...fieldLabel, whiteSpace: 'nowrap' }}>Req.<br /><input type="checkbox" checked={column.required} disabled={column.type === 'computed' || column.type === 'reference' || !!column.auto_from} onChange={e => setColumn(index, { required: e.target.checked })} /></label>
              <button type="button" onClick={() => set({ columns: config.columns.filter((_, i) => i !== index) })} title="Quitar columna" style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', cursor: 'pointer' }}>×</button>
            </div>

            {column.type === 'computed' && column.formula && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 150px 80px 90px 110px', gap: '6px', marginTop: '6px', alignItems: 'end' }}>
                <label style={fieldLabel}>Observado
                  <select style={small} value={column.formula.observed} onChange={e => setColumn(index, { formula: { ...column.formula!, observed: e.target.value } })}>
                    <option value="">—</option>{numberCols.map(c => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
                  </select>
                </label>
                <label style={fieldLabel}>Referencia (esperado)
                  <select style={small} value={column.formula.reference} onChange={e => setColumn(index, { formula: { ...column.formula!, reference: e.target.value } })}>
                    <option value="">—</option>{numberCols.map(c => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
                  </select>
                </label>
                <label style={fieldLabel}>Desviación
                  <select style={small} value={column.formula.mode} onChange={e => setColumn(index, { formula: { ...column.formula!, mode: e.target.value as 'abs' | 'pct_span' | 'pct_reading', span: e.target.value === 'pct_span' ? column.formula!.span : null } })}>
                    <option value="abs">Absoluta (obs − ref)</option>
                    <option value="pct_span">% del span</option>
                    <option value="pct_reading">% de la lectura</option>
                  </select>
                </label>
                <label style={fieldLabel}>Span<input style={small} type="number" step="any" disabled={column.formula.mode !== 'pct_span'} value={column.formula.span ?? ''} placeholder="16" onChange={e => setColumn(index, { formula: { ...column.formula!, span: num(e.target.value) } })} /></label>
                <label style={fieldLabel}>Tolerancia ±<input style={small} type="number" step="any" min={0} value={column.tolerance ?? ''} onChange={e => setColumn(index, { tolerance: num(e.target.value) })} /></label>
                <label style={fieldLabel}>Pasada
                  <select style={small} value={column.pass ?? ''} onChange={e => setColumn(index, { pass: (e.target.value || null) as TableColumn['pass'] })}>
                    <option value="">Única</option>
                    <option value="as_found">As found (solo marca)</option>
                    <option value="as_left">As left (acepta/rechaza)</option>
                  </select>
                </label>
              </div>
            )}

            {column.type === 'result' && (
              <label style={{ ...fieldLabel, marginTop: '6px', maxWidth: '360px' }}>Resultado
                <select style={small} value={column.auto_from ?? ''} onChange={e => setColumn(index, { auto_from: e.target.value || null, required: e.target.value ? false : true })}>
                  <option value="">Manual (lo marca el inspector)</option>
                  {computedCols.filter(c => c.pass !== 'as_found').map(c => <option key={c.key} value={c.key}>Automático según «{c.label || c.key}»</option>)}
                </select>
              </label>
            )}
          </div>
        )
      })}
      <button type="button" disabled={config.columns.length >= TABLE_MAX_COLUMNS} onClick={() => set({ columns: [...config.columns, { key: nextKey(config.columns), label: '', type: 'number', unit: null, options: null, min: null, max: null, required: true }] })} style={{ padding: '6px 12px', border: '1px dashed #67e8f9', borderRadius: '6px', background: 'var(--card-bg)', fontSize: '12px', color: '#0e7490', cursor: 'pointer' }}>+ Columna</button>

      {config.rows.mode === 'variable' && (
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #a5f3fc' }}>
          <label style={{ ...fieldLabel, flexDirection: 'row', gap: '6px', alignItems: 'center', display: 'flex' }}>
            <input type="checkbox" checked={!!config.stability}
              onChange={e => set({ stability: e.target.checked ? { column: [...numberCols, ...computedCols][0]?.key ?? '', last_n: 3, min: null, max: null } : null })} />
            Criterio de estabilidad (serie de lecturas): las últimas N lecturas dentro de los límites
          </label>
          {config.stability && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px', gap: '6px', marginTop: '6px', alignItems: 'end' }}>
              <label style={fieldLabel}>Columna
                <select style={small} value={config.stability.column} onChange={e => set({ stability: { ...config.stability!, column: e.target.value } })}>
                  {[...numberCols, ...computedCols].map(c => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
                </select>
              </label>
              <label style={fieldLabel}>Últimas N<input style={small} type="number" min={1} max={TABLE_MAX_ROWS} value={config.stability.last_n} onChange={e => set({ stability: { ...config.stability!, last_n: Number(e.target.value) } })} /></label>
              <label style={fieldLabel}>Mín.<input style={small} type="number" step="any" value={config.stability.min ?? ''} onChange={e => set({ stability: { ...config.stability!, min: num(e.target.value) } })} /></label>
              <label style={fieldLabel}>Máx.<input style={small} type="number" step="any" value={config.stability.max ?? ''} onChange={e => set({ stability: { ...config.stability!, max: num(e.target.value) } })} /></label>
            </div>
          )}
        </div>
      )}

      {issue && <p role="status" style={{ fontSize: '12px', color: '#b45309', fontWeight: 600, margin: '10px 0 0' }}>Falta: {issue}</p>}
      <p style={{ fontSize: '11px', color: '#155e75', margin: '8px 0 0' }}>
        Un «Resultado» rechazado, un número fuera de mín./máx. o una desviación fuera de tolerancia bloquean la firma; «as found» fuera de tolerancia solo se marca.
        La desviación y el resultado automático los calcula CommUp: el inspector no los edita. «No aplica» exige un texto en la fila. Sin tolerancias declaradas la tabla no impone criterios.
      </p>
    </div>
  )
}
