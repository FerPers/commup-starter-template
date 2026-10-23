'use client'

// Editor de la configuración de un ítem `table` (columnas + filas). Se guarda
// en itr_template_items.options y lo valida checkTableConfig (TS) e
// itr_table_config_valid (SQL). Los presets no fijan tolerancias, span ni límites.
// v2 (fase 4-C): desviación calculada con tolerancia, resultado automático,
// as found / as left, fecha y hora, y criterio de estabilidad para series.
// Fase 4-D: filas desde el lazo (una por señal) o desde la matriz C&E (una por efecto) y
// columnas de referencia que muestran datos de esa foto.

import { SOURCE_REFS, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, TABLE_PRESETS, checkTableConfig, type TableColumn, type TableConfig, type TableSource } from '@/lib/itr/table'
import { useId } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('ItrTemplates.table')
  const uid = useId()
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
      set({ rows: { mode: 'source', source: mode, label: mode === 'loop_signals' ? t('defaultSignal') : t('defaultEffect') }, stability: null,
        // Las referencias del otro origen no aplican: se quitan.
        columns: config.columns.filter(c => c.type !== 'reference' || (c.ref ?? '') in SOURCE_REFS[mode]) })
      return
    }
    const columns = config.columns.filter(c => c.type !== 'reference')
    set({ columns, rows: mode === 'variable' ? { mode: 'variable', min: 1, max: 20, label: t('defaultRow') } : { mode: 'fixed', labels: config.rows.mode === 'fixed' ? config.rows.labels : [] }, stability: mode === 'variable' ? config.stability : null })
  }

  function changeType(index: number, type: TableColumn['type']) {
    const column = config.columns[index]
    const patch: Partial<TableColumn> = { type, options: type === 'select' ? (column.options ?? [t('defaultOption')]) : null, min: null, max: null, auto_from: undefined, formula: undefined, tolerance: undefined, pass: undefined }
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
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#155e75', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>{t('title')}</div>

      <label style={{ ...fieldLabel, marginBottom: '10px' }}>{t('preset')}
        <select style={small} value="" onChange={e => { const preset = TABLE_PRESETS.find(p => p.id === e.target.value); if (preset) onChange(structuredClone(preset.config)) }}>
          <option value="">{t('pick')}</option>
          {TABLE_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '10px', marginBottom: '10px' }}>
        <label style={fieldLabel}>{t('rows')}
          <select style={small} value={source ?? config.rows.mode} onChange={e => changeRows(e.target.value)}>
            <option value="fixed">{t('rowsFixed')}</option>
            <option value="variable">{t('rowsVariable')}</option>
            <option value="loop_signals">{t('rowsLoop')}</option>
            <option value="ce_effects">{t('rowsCe')}</option>
          </select>
        </label>
        {config.rows.mode === 'fixed' ? (
          <label style={fieldLabel}>{t('rowLabels')}
            <textarea rows={3} style={{ ...small, fontFamily: 'monospace' }} value={config.rows.labels.join('\n')} placeholder={'0 %\n25 %\n50 %'} onChange={e => set({ rows: { mode: 'fixed', labels: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } })} />
          </label>
        ) : config.rows.mode === 'source' ? (
          <label style={fieldLabel}>{t(source === 'loop_signals' ? 'rowNameLoop' : 'rowNameCe')}
            <input style={small} value={config.rows.label} onChange={e => set({ rows: { ...config.rows, label: e.target.value } as TableConfig['rows'] })} placeholder={t('defaultSignal')} />
          </label>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: '8px' }}>
            <label style={fieldLabel}>{t('rowName')}<input style={small} value={config.rows.label} onChange={e => set({ rows: { ...config.rows, mode: 'variable', label: e.target.value } as TableConfig['rows'] })} placeholder={t('cyclePlaceholder')} /></label>
            <label style={fieldLabel}>{t('min')}<input style={small} type="number" min={1} max={TABLE_MAX_ROWS} value={config.rows.min} onChange={e => set({ rows: { ...config.rows, mode: 'variable', min: Number(e.target.value) } as TableConfig['rows'] })} /></label>
            <label style={fieldLabel}>{t('max')}<input style={small} type="number" min={1} max={TABLE_MAX_ROWS} value={config.rows.max} onChange={e => set({ rows: { ...config.rows, mode: 'variable', max: Number(e.target.value) } as TableConfig['rows'] })} /></label>
          </div>
        )}
      </div>

      <div style={{ fontSize: '12px', fontWeight: 600, color: '#155e75', margin: '4px 0 6px' }}>{t('columns', { n: config.columns.length, max: TABLE_MAX_COLUMNS })}</div>
      {config.columns.map((column, index) => {
        const numeric = column.type === 'number'
        return (
          <div key={column.key} style={{ marginBottom: '8px', paddingBottom: column.type === 'computed' || column.type === 'result' ? '6px' : 0, borderBottom: column.type === 'computed' || column.type === 'result' ? '1px dashed #a5f3fc' : 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 130px 70px 1fr 70px 70px auto auto', gap: '6px', alignItems: 'end' }}>
              <label style={fieldLabel}>{t('label')}<input style={small} value={column.label} onChange={e => setColumn(index, { label: e.target.value })} /></label>
              <label style={fieldLabel}>{t('type')}
                <select style={small} value={column.type} onChange={e => changeType(index, e.target.value as TableColumn['type'])}>
                  <option value="number">{t('typeNumber')}</option>
                  <option value="text">{t('typeText')}</option>
                  <option value="select">{t('typeSelect')}</option>
                  <option value="result">{t('typeResult')}</option>
                  <option value="computed">{t('typeComputed')}</option>
                  <option value="datetime">{t('typeDatetime')}</option>
                  {source && <option value="reference">{t(source === 'loop_signals' ? 'typeRefLoop' : 'typeRefCe')}</option>}
                </select>
              </label>
              <label style={fieldLabel}>{t('unit')}<input style={small} value={column.unit ?? ''} disabled={!numeric && column.type !== 'computed'} onChange={e => setColumn(index, { unit: e.target.value || null })} /></label>
              <label htmlFor={`${uid}-${column.key}-criterion`} style={fieldLabel}>{column.type === 'select' ? t('options') : t('criterion')}
                {column.type === 'reference' && source
                  ? <select id={`${uid}-${column.key}-criterion`} style={small} value={column.ref ?? ''} onChange={e => setColumn(index, { ref: e.target.value })}>
                      {Object.entries(SOURCE_REFS[source]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  : column.type === 'select'
                  ? <input id={`${uid}-${column.key}-criterion`} style={small} value={(column.options ?? []).join(', ')} onChange={e => setColumn(index, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                  : <input id={`${uid}-${column.key}-criterion`} style={{ ...small, color: 'var(--text-muted)' }} disabled value={numeric ? t('hintNumber') : column.type === 'result' ? (column.auto_from ? t('hintAuto') : t('hintResult')) : column.type === 'computed' ? t('hintComputed') : column.type === 'datetime' ? t('hintDatetime') : t('hintText')} />}
              </label>
              <label style={fieldLabel}>{t('min')}<input style={small} type="number" step="any" disabled={!numeric} value={column.min ?? ''} onChange={e => setColumn(index, { min: num(e.target.value) })} /></label>
              <label style={fieldLabel}>{t('max')}<input style={small} type="number" step="any" disabled={!numeric} value={column.max ?? ''} onChange={e => setColumn(index, { max: num(e.target.value) })} /></label>
              <label style={{ ...fieldLabel, whiteSpace: 'nowrap' }}>{t('required')}<br /><input type="checkbox" checked={column.required} disabled={column.type === 'computed' || column.type === 'reference' || !!column.auto_from} onChange={e => setColumn(index, { required: e.target.checked })} /></label>
              <button type="button" onClick={() => set({ columns: config.columns.filter((_, i) => i !== index) })} title={t('removeColumn')} style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', cursor: 'pointer' }}>×</button>
            </div>

            {column.type === 'computed' && column.formula && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 150px 80px 90px 110px', gap: '6px', marginTop: '6px', alignItems: 'end' }}>
                <label style={fieldLabel}>{t('observed')}
                  <select style={small} value={column.formula.observed} onChange={e => setColumn(index, { formula: { ...column.formula!, observed: e.target.value } })}>
                    <option value="">—</option>{numberCols.map(c => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
                  </select>
                </label>
                <label style={fieldLabel}>{t('reference')}
                  <select style={small} value={column.formula.reference} onChange={e => setColumn(index, { formula: { ...column.formula!, reference: e.target.value } })}>
                    <option value="">—</option>{numberCols.map(c => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
                  </select>
                </label>
                <label style={fieldLabel}>{t('deviation')}
                  <select style={small} value={column.formula.mode} onChange={e => setColumn(index, { formula: { ...column.formula!, mode: e.target.value as 'abs' | 'pct_span' | 'pct_reading', span: e.target.value === 'pct_span' ? column.formula!.span : null } })}>
                    <option value="abs">{t('devAbs')}</option>
                    <option value="pct_span">{t('devSpan')}</option>
                    <option value="pct_reading">{t('devReading')}</option>
                  </select>
                </label>
                <label style={fieldLabel}>Span<input style={small} type="number" step="any" disabled={column.formula.mode !== 'pct_span'} value={column.formula.span ?? ''} placeholder="16" onChange={e => setColumn(index, { formula: { ...column.formula!, span: num(e.target.value) } })} /></label>
                <label style={fieldLabel}>{t('tolerance')}<input style={small} type="number" step="any" min={0} value={column.tolerance ?? ''} onChange={e => setColumn(index, { tolerance: num(e.target.value) })} /></label>
                <label style={fieldLabel}>{t('pass')}
                  <select style={small} value={column.pass ?? ''} onChange={e => setColumn(index, { pass: (e.target.value || null) as TableColumn['pass'] })}>
                    <option value="">{t('passSingle')}</option>
                    <option value="as_found">{t('passFound')}</option>
                    <option value="as_left">{t('passLeft')}</option>
                  </select>
                </label>
              </div>
            )}

            {column.type === 'result' && (
              <label style={{ ...fieldLabel, marginTop: '6px', maxWidth: '360px' }}>{t('result')}
                <select style={small} value={column.auto_from ?? ''} onChange={e => setColumn(index, { auto_from: e.target.value || null, required: e.target.value ? false : true })}>
                  <option value="">{t('resultManual')}</option>
                  {computedCols.filter(c => c.pass !== 'as_found').map(c => <option key={c.key} value={c.key}>{t('resultAuto', { col: c.label || c.key })}</option>)}
                </select>
              </label>
            )}
          </div>
        )
      })}
      <button type="button" disabled={config.columns.length >= TABLE_MAX_COLUMNS} onClick={() => set({ columns: [...config.columns, { key: nextKey(config.columns), label: '', type: 'number', unit: null, options: null, min: null, max: null, required: true }] })} style={{ padding: '6px 12px', border: '1px dashed #67e8f9', borderRadius: '6px', background: 'var(--card-bg)', fontSize: '12px', color: '#0e7490', cursor: 'pointer' }}>{t('addColumn')}</button>

      {config.rows.mode === 'variable' && (
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #a5f3fc' }}>
          <label style={{ ...fieldLabel, flexDirection: 'row', gap: '6px', alignItems: 'center', display: 'flex' }}>
            <input type="checkbox" checked={!!config.stability}
              onChange={e => set({ stability: e.target.checked ? { column: [...numberCols, ...computedCols][0]?.key ?? '', last_n: 3, min: null, max: null } : null })} />
            {t('stability')}
          </label>
          {config.stability && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px', gap: '6px', marginTop: '6px', alignItems: 'end' }}>
              <label style={fieldLabel}>{t('column')}
                <select style={small} value={config.stability.column} onChange={e => set({ stability: { ...config.stability!, column: e.target.value } })}>
                  {[...numberCols, ...computedCols].map(c => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
                </select>
              </label>
              <label style={fieldLabel}>{t('lastN')}<input style={small} type="number" min={1} max={TABLE_MAX_ROWS} value={config.stability.last_n} onChange={e => set({ stability: { ...config.stability!, last_n: Number(e.target.value) } })} /></label>
              <label style={fieldLabel}>{t('min')}<input style={small} type="number" step="any" value={config.stability.min ?? ''} onChange={e => set({ stability: { ...config.stability!, min: num(e.target.value) } })} /></label>
              <label style={fieldLabel}>{t('max')}<input style={small} type="number" step="any" value={config.stability.max ?? ''} onChange={e => set({ stability: { ...config.stability!, max: num(e.target.value) } })} /></label>
            </div>
          )}
        </div>
      )}

      {issue && <p role="status" style={{ fontSize: '12px', color: '#b45309', fontWeight: 600, margin: '10px 0 0' }}>{t('missing', { issue })}</p>}
      <p style={{ fontSize: '11px', color: '#155e75', margin: '8px 0 0' }}>
        {t('footer')}
      </p>
    </div>
  )
}
