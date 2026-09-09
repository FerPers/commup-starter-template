'use client'

// Editor de la configuración de un ítem `table` (columnas + filas). Se guarda
// en itr_template_items.options y lo valida parseTableConfig (TS) e
// itr_table_config_valid (SQL). Los presets no fijan tolerancias.

import { TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, TABLE_PRESETS, type TableColumn, type TableConfig } from '@/lib/itr/table'
import { fieldInput, fieldLabel } from './template-builder-shared'

const EMPTY: TableConfig = { version: 1, columns: [], rows: { mode: 'fixed', labels: [] } }

function nextKey(columns: TableColumn[]): string {
  let n = columns.length + 1
  while (columns.some(column => column.key === `col${n}`)) n += 1
  return `col${n}`
}

export default function TableConfigEditor({ value, onChange }: { value: TableConfig | null; onChange: (config: TableConfig) => void }) {
  const config = value ?? EMPTY
  const set = (patch: Partial<TableConfig>) => onChange({ ...config, ...patch, version: 1 })
  const setColumn = (index: number, patch: Partial<TableColumn>) => set({ columns: config.columns.map((column, i) => i === index ? { ...column, ...patch } : column) })
  const small = { ...fieldInput, padding: '6px 8px', fontSize: '12px' } as const

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
          <select style={small} value={config.rows.mode} onChange={e => set({ rows: e.target.value === 'variable' ? { mode: 'variable', min: 1, max: 20, label: 'Fila' } : { mode: 'fixed', labels: config.rows.mode === 'fixed' ? config.rows.labels : [] } })}>
            <option value="fixed">Fijas (una por línea)</option>
            <option value="variable">Variables (el inspector declara la cantidad)</option>
          </select>
        </label>
        {config.rows.mode === 'fixed' ? (
          <label style={fieldLabel}>Etiquetas de fila (máx. 200)
            <textarea rows={3} style={{ ...small, fontFamily: 'monospace' }} value={config.rows.labels.join('\n')} placeholder={'0 %\n25 %\n50 %'} onChange={e => set({ rows: { mode: 'fixed', labels: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } })} />
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
      {config.columns.map((column, index) => (
        <div key={column.key} style={{ display: 'grid', gridTemplateColumns: '1.4fr 110px 70px 1fr 70px 70px auto auto', gap: '6px', alignItems: 'end', marginBottom: '6px' }}>
          <label style={fieldLabel}>Etiqueta<input style={small} value={column.label} onChange={e => setColumn(index, { label: e.target.value })} /></label>
          <label style={fieldLabel}>Tipo
            <select style={small} value={column.type} onChange={e => setColumn(index, { type: e.target.value as TableColumn['type'], options: e.target.value === 'select' ? (column.options ?? ['Opción 1']) : null, min: null, max: null })}>
              <option value="number">Número</option>
              <option value="text">Texto</option>
              <option value="select">Selección</option>
              <option value="result">Resultado</option>
            </select>
          </label>
          <label style={fieldLabel}>Unidad<input style={small} value={column.unit ?? ''} disabled={column.type !== 'number'} onChange={e => setColumn(index, { unit: e.target.value || null })} /></label>
          <label style={fieldLabel}>{column.type === 'select' ? 'Opciones (coma)' : 'Criterio'}
            {column.type === 'select'
              ? <input style={small} value={(column.options ?? []).join(', ')} onChange={e => setColumn(index, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
              : <input style={{ ...small, color: 'var(--text-muted)' }} disabled value={column.type === 'number' ? 'min/max opcionales →' : column.type === 'result' ? 'Aceptado / Rechazado / No aplica' : 'Texto libre'} />}
          </label>
          <label style={fieldLabel}>Mín.<input style={small} type="number" step="any" disabled={column.type !== 'number'} value={column.min ?? ''} onChange={e => setColumn(index, { min: e.target.value === '' ? null : Number(e.target.value) })} /></label>
          <label style={fieldLabel}>Máx.<input style={small} type="number" step="any" disabled={column.type !== 'number'} value={column.max ?? ''} onChange={e => setColumn(index, { max: e.target.value === '' ? null : Number(e.target.value) })} /></label>
          <label style={{ ...fieldLabel, whiteSpace: 'nowrap' }}>Req.<br /><input type="checkbox" checked={column.required} onChange={e => setColumn(index, { required: e.target.checked })} /></label>
          <button type="button" onClick={() => set({ columns: config.columns.filter((_, i) => i !== index) })} title="Quitar columna" style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', cursor: 'pointer' }}>×</button>
        </div>
      ))}
      <button type="button" disabled={config.columns.length >= TABLE_MAX_COLUMNS} onClick={() => set({ columns: [...config.columns, { key: nextKey(config.columns), label: '', type: 'number', unit: null, options: null, min: null, max: null, required: true }] })} style={{ padding: '6px 12px', border: '1px dashed #67e8f9', borderRadius: '6px', background: 'var(--card-bg)', fontSize: '12px', color: '#0e7490', cursor: 'pointer' }}>+ Columna</button>
      <p style={{ fontSize: '11px', color: '#155e75', margin: '8px 0 0' }}>Un «Resultado» rechazado o un número fuera de mín./máx. bloquean la firma. «No aplica» exige un texto en la fila. Sin mín./máx. la tabla no impone tolerancias.</p>
    </div>
  )
}
