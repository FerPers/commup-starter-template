'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { configureRegisterType } from '@/app/actions/registers'
import type { RegisterKind } from '@/lib/registers/catalog'
import { card, input, small } from '../../projects/[id]/registers/register-ui'

type TypeRow = { id: string; kind: RegisterKind; prefix: string; is_active: boolean; blocks_gate_id: string | null }
type Gate = { id: string; code: string; name: string; is_active: boolean }

export default function RegisterTypesAdmin({ types, gates }: { types: TypeRow[]; gates: Gate[] }) {
  const t = useTranslations('Registers')
  const router = useRouter()
  const [rows, setRows] = useState(types)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save(row: TypeRow, patch: Partial<TypeRow>) {
    const nextRow = { ...row, ...patch }
    setRows(rs => rs.map(r => (r.id === row.id ? nextRow : r)))
    setError(null); setSavedId(null)
    startTransition(async () => {
      const res = await configureRegisterType({ typeId: row.id, isActive: nextRow.is_active, blocksGateId: nextRow.blocks_gate_id })
      if (res.error) {
        setError(res.error)
        setRows(rs => rs.map(r => (r.id === row.id ? row : r)))
        return
      }
      setSavedId(row.id)
      router.refresh()
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>{t('admin.title')}</h1>
        <p style={{ ...small, margin: '4px 0 0', maxWidth: 720 }}>{t('admin.subtitle')}</p>
      </div>
      {error && <div role="alert" style={{ padding: '10px 14px', background: 'var(--danger-50)', border: '1px solid #fecaca', borderRadius: 8, color: 'var(--danger-700)', fontSize: 'var(--text-sm)' }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(row => (
          <section key={row.id} style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', opacity: row.is_active ? 1 : 0.65 }}
            aria-label={t(`kind.${row.kind}`)}>
            <div style={{ flex: '2 1 260px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                {t(`kind.${row.kind}`)} <span style={{ ...small, fontFamily: 'ui-monospace, monospace' }}>{row.prefix}-0001</span>
              </div>
              <div style={{ ...small, fontSize: 'var(--text-xs)', marginTop: 2 }}>{t(`kindHelp.${row.kind}`)}</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={row.is_active} disabled={isPending} onChange={e => save(row, { is_active: e.target.checked })} />
              {t('admin.active')}
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px', minWidth: 0 }}>
              <span style={{ ...small, fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                {t('admin.blocks')}{savedId === row.id && <span style={{ color: 'var(--success-700)' }}> · {t('admin.saved')}</span>}
              </span>
              <select style={input} value={row.blocks_gate_id ?? ''} disabled={isPending || !row.is_active}
                onChange={e => save(row, { blocks_gate_id: e.target.value || null })}>
                <option value="">{t('admin.none')}</option>
                {gates.filter(g => g.is_active || g.id === row.blocks_gate_id).map(g => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
              </select>
            </label>
          </section>
        ))}
      </div>
    </div>
  )
}
