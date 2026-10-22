'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useUrlFilters } from '@/lib/list/useUrlFilters'

// N2a: filtros de Readiness en la URL que se aplican al cambiar (sin botón «Cargar»), para guardar la vista
// como enlace (la fila de una fase del Resumen abre `?gate=<código>`).

const select: React.CSSProperties = {
  minHeight: 40, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 'var(--text-sm)', background: 'var(--card-bg)', color: 'var(--text-strong)', fontFamily: 'inherit',
}
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }
const chip = (on: boolean, tone: 'dark' | 'danger' = 'dark'): React.CSSProperties => ({
  minHeight: 40, padding: '0 14px', borderRadius: 999, fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${on ? (tone === 'danger' ? 'var(--danger-500)' : 'var(--text-strong)') : 'var(--border)'}`,
  background: on ? (tone === 'danger' ? 'var(--danger-50)' : 'var(--text-strong)') : 'var(--card-bg)',
  color: on ? (tone === 'danger' ? 'var(--danger-700)' : 'var(--card-bg)') : 'var(--text-strong)',
})

export default function ReadinessFilters({ gates, areas, states }: {
  gates: string[]
  areas: { code: string; name: string }[]
  states: { value: string; label: string }[]
}) {
  const t = useTranslations('ControlTower')
  const url = useUrlFilters()
  const [q, setQ] = useState(url.get('q'))
  useEffect(() => {
    const h = setTimeout(() => { if (q !== url.get('q')) url.set({ q }) }, 350)
    return () => clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe disparar cuando cambia lo que escribe el usuario
  }, [q])

  const gate = url.get('gate')
  const toggle = (key: string) => url.set({ [key]: url.get(key) === '1' ? null : '1' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: url.isPending ? 0.7 : 1 }}>
      <div role="group" aria-label={t('filter.nextGate')} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" aria-pressed={!gate} onClick={() => url.set({ gate: null })} style={chip(!gate)}>{t('filter.allGates')}</button>
        {gates.map(code => (
          <button key={code} type="button" aria-pressed={gate === code} onClick={() => url.set({ gate: gate === code ? null : code })} style={chip(gate === code)}>
            {t('filter.nextIs', { gate: code })}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
        <label style={label}>{t('filter.area')}
          <select style={select} value={url.get('area')} onChange={e => url.set({ area: e.target.value })}>
            <option value="">{t('filter.allAreas')}</option>
            {areas.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
          </select>
        </label>
        <label style={label}>{t('filter.state')}
          <select style={select} value={url.get('state')} onChange={e => url.set({ state: e.target.value })}>
            <option value="">{t('filter.allStates')}</option>
            {states.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label style={label}>{t('filter.committed')}
          <select style={select} value={url.get('committed')} onChange={e => url.set({ committed: e.target.value })}>
            <option value="">{t('filter.anyCommitment')}</option>
            {[7, 30, 90].map(d => <option key={d} value={d}>{t('filter.committedIn', { days: d })}</option>)}
          </select>
        </label>
        <label style={label}>{t('filter.sort')}
          <select style={select} value={url.get('sort') || 'risk'} onChange={e => url.set({ sort: e.target.value === 'risk' ? null : e.target.value })}>
            <option value="risk">{t('filter.sortRisk')}</option>
            <option value="code">{t('filter.sortCode')}</option>
            <option value="commitment">{t('filter.sortCommitment')}</option>
          </select>
        </label>
        <button type="button" aria-pressed={url.get('blocked') === '1'} onClick={() => toggle('blocked')} style={chip(url.get('blocked') === '1', 'danger')}>{t('filter.blocked')}</button>
        <button type="button" aria-pressed={url.get('changed') === '1'} onClick={() => toggle('changed')} style={chip(url.get('changed') === '1')}>{t('filter.changed')}</button>
        <span style={{ flex: 1 }} />
        <label style={label}>{t('filter.search')}
          <input type="search" value={q} onChange={e => setQ(e.target.value)} style={{ ...select, width: 200 }} />
        </label>
      </div>
    </div>
  )
}
