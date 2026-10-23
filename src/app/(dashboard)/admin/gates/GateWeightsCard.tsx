'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { setGateWeights } from '@/app/actions/planning'
import { normalizeWeights } from '@/lib/readiness/planning'

// Pesos de los gates en el avance físico ponderado (fase 5, sesión 2). Vacío = partes iguales; solo
// cuentan los gates activos con fase (la BD normaliza igual: compute_system_progress).

type G = { id: string; code: string; name: string; weight: number | null; is_active: boolean; phase_id: string | null }

const card: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }
const small: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }

export default function GateWeightsCard({ gates }: { gates: G[] }) {
  const t = useTranslations('GatesAdmin')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const counted = gates.filter(g => g.is_active && g.phase_id)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(counted.map(g => [g.id, g.weight === null ? '' : String(g.weight)])))

  const parsed = counted.map(g => (values[g.id]?.trim() ? Number(values[g.id]) : null))
  const invalid = parsed.some(w => w !== null && (!Number.isFinite(w) || w < 0 || w > 1000))
  const norm = invalid ? counted.map(() => 0) : normalizeWeights(parsed)
  const dirty = counted.some((g, i) => parsed[i] !== g.weight)

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await setGateWeights({ weights: counted.map((g, i) => ({ gateId: g.id, weight: parsed[i] })) })
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <section style={card} aria-labelledby="gate-weights">
      <h2 id="gate-weights" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('weights.title')}</h2>
      <p style={{ ...small, margin: '0 0 12px', lineHeight: 1.5 }}>{t('weights.help')}</p>
      {counted.length === 0 ? <p style={small}>{t('weights.none')}</p> : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {counted.map((g, i) => (
            <label key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 130 }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-strong)' }} title={g.name}>{g.code}</span>
              <input type="number" min={0} max={1000} step="any" placeholder="1" value={values[g.id] ?? ''}
                onChange={e => setValues(v => ({ ...v, [g.id]: e.target.value }))}
                style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 'var(--text-sm)', background: 'var(--card-bg)', color: 'var(--text-strong)' }} />
              <span style={{ ...small, fontSize: 'var(--text-xs)' }}>{(norm[i] * 100).toFixed(1)} %</span>
            </label>
          ))}
          <button type="button" disabled={isPending || invalid || !dirty} onClick={save}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 'var(--text-sm)', fontWeight: 600, border: 'none', background: 'var(--primary-600)', color: '#fff',
              cursor: isPending || invalid || !dirty ? 'not-allowed' : 'pointer', opacity: isPending || invalid || !dirty ? 0.5 : 1, marginBottom: 20 }}>
            {t('weights.save')}
          </button>
        </div>
      )}
      {invalid && <p role="alert" style={{ ...small, color: 'var(--danger-700)', margin: '8px 0 0' }}>{t('weights.invalid')}</p>}
      {error && <p role="alert" style={{ ...small, color: 'var(--danger-700)', margin: '8px 0 0' }}>{error}</p>}
    </section>
  )
}
