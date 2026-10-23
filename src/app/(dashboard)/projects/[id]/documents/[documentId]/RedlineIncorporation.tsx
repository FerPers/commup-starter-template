'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Modal } from '@/components/ui'
import { incorporateRedlines } from '@/app/actions/pid-redlines'
import { REDLINE_STATUS_STYLE, type RedlineStatus } from '@/lib/pid/redlines'

// F-21c (maqueta aprobada «Nueva revisión C · As-Built»): red-lines abiertos o aceptados de revisiones anteriores de un
// P&ID que la revisión vigente todavía no incorporó. Control documental (Líder en adelante) marca cuáles incorpora (las
// aceptadas vienen marcadas); las demás pasan a la revisión vigente «por revisar».

export type PendingRedline = { id: string; number: string; description: string; status: RedlineStatus; rev: string }

export default function RedlineIncorporation({
  projectId, documentId, current, pending, canEdit,
}: {
  projectId: string
  documentId: string
  current: { id: string; rev: string }
  pending: PendingRedline[]
  canEdit: boolean
}) {
  const t = useTranslations('Documents')
  const ts = useTranslations('PidDocuments')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isPending, start] = useTransition()
  if (pending.length === 0) return null

  function openDialog() {
    setChecked(new Set(pending.filter(p => p.status === 'accepted').map(p => p.id)))
    setError(null)
    setOpen(true)
  }

  function save() {
    start(async () => {
      const res = await incorporateRedlines({ project_id: projectId, document_id: documentId, revision_id: current.id, ids: [...checked] })
      if (res.error) { setError(res.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  const toIncorporate = pending.filter(p => checked.has(p.id))
  const toCarry = pending.filter(p => !checked.has(p.id))
  return (
    <div role="status" style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--danger-50)', border: '1px solid var(--danger-200)', fontSize: 'var(--text-sm)', color: 'var(--danger-700)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ flex: 1, minWidth: 220 }}>{t('redlines.pendingBanner', { count: pending.length, rev: current.rev })}</span>
      {canEdit && (
        <button type="button" onClick={openDialog}
          style={{ minHeight: 40, padding: '0 14px', borderRadius: 8, border: 0, background: 'var(--danger-600)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {t('redlines.incorporateIn', { rev: current.rev })}
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t('redlines.dialogTitle', { rev: current.rev })} size="md"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setOpen(false)} style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-strong)', cursor: 'pointer', fontFamily: 'inherit' }}>{t('cancel')}</button>
            <button type="button" onClick={save} disabled={isPending}
              style={{ minHeight: 44, padding: '0 20px', borderRadius: 10, border: 0, background: 'var(--primary-600)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: isPending ? 0.6 : 1 }}>
              {isPending ? '…' : t('redlines.confirm')}
            </button>
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{t('redlines.dialogHelp', { rev: current.rev })}</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {pending.map((p, i) => {
              const st = REDLINE_STATUS_STYLE[p.status]
              return (
                <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid var(--border)' : 0, background: p.status === 'open' ? 'var(--warning-50)' : 'var(--card-bg)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, fontSize: 14, color: 'var(--text-strong)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={checked.has(p.id)} style={{ width: 22, height: 22 }}
                      onChange={() => setChecked(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })} />
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{p.number}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</span>
                  </label>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('redlines.fromRev', { rev: p.rev })}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: st.chipBg, color: st.chipText, border: `1px solid ${st.chipBorder}`, whiteSpace: 'nowrap' }}>
                    {ts(`redline.status_${p.status}`)}
                  </span>
                </li>
              )
            })}
          </ul>
          <p style={{ margin: 0, padding: '10px 14px', borderRadius: 10, background: 'var(--gray-50)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-body)' }}>
            {t('redlines.summary', { incorporated: toIncorporate.length, carried: toCarry.length, rev: current.rev })}
          </p>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger-700)' }}>{error}</p>}
        </div>
      </Modal>
    </div>
  )
}
