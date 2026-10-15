'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import GenerateSourceItrsModal, { type GenerationMember, type GenerationTemplate } from '@/components/itr/GenerateSourceItrsModal'
import { ITR_STATUS_LABELS } from '@/lib/ce/test-status'
import type { SourceItrInfo } from '@/lib/itr/source-itrs-server'

const STATUS_COLORS: Record<string, string> = {
  not_started: 'var(--gray-400)',
  in_progress:  '#3b82f6',
  completed:    '#10b981',
  approved:     '#7c3aed',
}

type LoopTag = {
  id: string
  role_in_loop: string | null
  tags: { id: string; tag_number: string } | null
}

// Cadena del loop check (fase 4-D): campo → JB → marshalling → tarjeta/canal I/O → tag DCS → HMI.
type LoopSignal = {
  id: string
  signal_tag: string
  signal_type: string
  origin: string | null
  junction_box: string | null
  marshalling: string | null
  io_card: string | null
  io_channel: string | null
  dcs_tag: string | null
  hmi_display: string | null
  tags: { tag_number: string } | null
}

const CHAIN: { key: keyof LoopSignal; label: string }[] = [
  { key: 'junction_box', label: 'JB' },
  { key: 'marshalling', label: 'Marshalling' },
  { key: 'io_card', label: 'Tarjeta I/O' },
  { key: 'io_channel', label: 'Canal' },
  { key: 'dcs_tag', label: 'Tag DCS' },
  { key: 'hmi_display', label: 'HMI' },
]

type LoopRow = {
  id: string
  loop_number: string
  description: string | null
  status: string
  disciplines: { id: string; code: string; name: string; color: string } | null
  subsystems: {
    id: string; code: string; name: string
    systems: { id: string; code: string; name: string; areas: { id: string; code: string; name: string } }
  } | null
  loop_tags: LoopTag[]
  signals: LoopSignal[]
}

export default function LoopsView({
  projectId,
  projectName,
  loops,
  loopItrs = {},
  templates = [],
  members = [],
  canEdit = false,
}: {
  projectId: string
  projectName: string
  loops: LoopRow[]
  /** Fase 4-D: ITR de loop check vigente por lazo. */
  loopItrs?: Record<string, SourceItrInfo>
  templates?: GenerationTemplate[]
  members?: GenerationMember[]
  canEdit?: boolean
}) {
  const t = useTranslations('Signals')

  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState<string>('all')
  const [selected, setSelected]     = useState<LoopRow | null>(null)
  const [generate, setGenerate]     = useState<Array<{ id: string; label: string; revision?: boolean }> | null>(null)
  // Lazos con señales y sin ITR de loop check: candidatos a «Generar faltantes».
  const missing = loops.filter(l => l.signals.length > 0 && !loopItrs[l.id])

  const filtered = useMemo(() => {
    return loops.filter(l => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !l.loop_number.toLowerCase().includes(q) &&
          !(l.description ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [loops, search, statusFilter])

  const statuses = ['not_started', 'in_progress', 'completed', 'approved']

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <a href={`/projects/${projectId}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '14px',
        }}>
          ← {projectName}
        </a>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: '0 0 4px' }}>
          {t('loops.title')}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
          {t('loops.subtitle', { count: loops.length })}
        </p>
      </div>

      {canEdit && missing.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
          {missing.length} lazo{missing.length === 1 ? '' : 's'} con señales sin ITR de loop check.
          <button type="button" onClick={() => setGenerate(missing.map(l => ({ id: l.id, label: l.loop_number })))} style={{ padding: '7px 12px', borderRadius: '8px', border: 0, background: 'var(--primary-600, #2563eb)', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Generar faltantes ({missing.length})</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder={t('loops.searchPlaceholder')}
          aria-label={t('loops.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: '1', minWidth: '200px', padding: '8px 12px',
            border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text-strong)',
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatus(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', background: 'var(--card-bg)', cursor: 'pointer' }}
        >
          <option value="all">{t('allStatuses')}</option>
          {statuses.map(s => (
            <option key={s} value={s}>{t(`status.${s}` as Parameters<typeof t>[0])}</option>
          ))}
        </select>
      </div>

      {loops.length === 0 ? (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '64px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }}>⟳</div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-strong)', margin: '0 0 6px' }}>{t('loops.emptyTitle')}</p>
          <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: 0 }}>{t('loops.emptyDesc')}</p>
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--border)' }}>
                  {[t('loops.col.loopNumber'), t('loops.col.description'), t('loops.col.subsystem'), t('loops.col.discipline'), t('loops.col.tags'), 'Señales', 'Loop check', t('col.status'), ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', textAlign: 'left',
                      fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px',
                      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '13px' }}>
                      {t('noResults')}
                    </td>
                  </tr>
                ) : filtered.map((loop, i) => {
                  const statusColor = STATUS_COLORS[loop.status] ?? 'var(--gray-400)'
                  const disc = loop.disciplines
                  const sub = loop.subsystems
                  return (
                    <tr
                      key={loop.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: i % 2 === 0 ? 'var(--card-bg)' : 'var(--gray-50)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelected(selected?.id === loop.id ? null : loop)}
                    >
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {loop.loop_number}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {loop.description ?? '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {sub ? (
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-strong)' }}>{sub.code}</div>
                            <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{sub.systems.areas.code} › {sub.systems.code}</div>
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {disc ? (
                          <span style={{
                            padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                            background: disc.color + '18', color: disc.color,
                          }}>
                            {disc.code}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                        {loop.loop_tags.length}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                        {loop.signals.length}
                        {loop.signals.some(s => CHAIN.some(c => !s[c.key])) && <span title="Cadena incompleta: faltan datos para el loop check" style={{ color: '#b45309', marginLeft: '4px' }}>⚠</span>}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                        <LoopItrCell info={loopItrs[loop.id]} projectId={projectId} />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                          background: statusColor + '18', color: statusColor,
                        }}>
                          {t(`status.${loop.status}` as Parameters<typeof t>[0])}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--gray-400)', fontSize: '12px', textAlign: 'right' }}>
                        {selected?.id === loop.id ? '▲' : '▼'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Tags detail panel */}
          {selected && (
            <div style={{ borderTop: '2px solid var(--border)', padding: '16px 24px', background: 'var(--gray-50)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
                  {selected.loop_number} — {t('loops.tagsInLoop')}
                </span>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: '16px' }}>✕</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '12px' }}>
                <strong style={{ color: 'var(--text-strong)' }}>Loop check:</strong>
                <LoopItrCell info={loopItrs[selected.id]} projectId={projectId} />
                {canEdit && selected.signals.length > 0 && (
                  <button type="button" onClick={() => setGenerate([{ id: selected.id, label: selected.loop_number, revision: !!loopItrs[selected.id] }])} style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--card-bg)', fontSize: '12px', cursor: 'pointer' }}>
                    {loopItrs[selected.id] ? 'Generar revisión (R2…)' : 'Generar ITR de loop check'}
                  </button>
                )}
              </div>
              {selected.loop_tags.length === 0 && <p style={{ fontSize: '12px', color: 'var(--gray-400)', margin: 0 }}>Sin instrumentos asociados.</p>}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selected.loop_tags.map(lt => lt.tags && (
                  <span key={lt.id} style={{
                    padding: '4px 10px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                    borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-strong)',
                  }}>
                    {lt.tags.tag_number}
                    {lt.role_in_loop && <span style={{ color: 'var(--gray-400)', marginLeft: '4px' }}>({lt.role_in_loop})</span>}
                  </span>
                ))}
              </div>

              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', margin: '18px 0 8px' }}>Señales y cadena del loop check</div>
              {selected.signals.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--gray-400)', margin: 0 }}>Sin señales en este lazo. Impórtalas con la columna LAZO en «Importar señales».</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: '12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', minWidth: '100%' }}>
                    <thead><tr>
                      {['Señal', 'Tipo', 'Instrumento', ...CHAIN.map(c => c.label)].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{[...selected.signals].sort((a, b) => a.signal_tag.localeCompare(b.signal_tag)).map(sig => (
                      <tr key={sig.id}>
                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{sig.signal_tag}</td>
                        <td style={{ padding: '7px 10px' }}>{sig.signal_type}</td>
                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{sig.tags?.tag_number ?? '—'}</td>
                        {CHAIN.map(c => {
                          const v = sig[c.key] as string | null
                          return <td key={c.key} style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: v ? 'var(--text-strong)' : '#b45309' }}>{v ?? 'falta'}</td>
                        })}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', background: 'var(--gray-50)', fontSize: '12px', color: 'var(--gray-400)' }}>
            {t('showing', { filtered: filtered.length, total: loops.length })}
          </div>
        </div>
      )}
      {generate && <GenerateSourceItrsModal projectId={projectId} kind="loop" items={generate} templates={templates} members={members} onClose={() => setGenerate(null)} />}
    </div>
  )
}

/** Estado del ITR de loop check de un lazo: número (enlace), estado y aviso si la foto quedó desactualizada. */
function LoopItrCell({ info, projectId }: { info: SourceItrInfo | undefined; projectId: string }) {
  if (!info) return <span style={{ color: 'var(--gray-400)', fontSize: '12px' }}>Sin ITR</span>
  const results = Object.values(info.rows)
  const failed = results.filter(r => r === 'fail').length
  const passed = results.filter(r => r === 'pass').length
  const color = info.status === 'approved' ? '#047857' : failed ? '#b91c1c' : 'var(--text-strong)'
  return (
    <span style={{ fontSize: '12px', display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
      <a href={info.tagId ? `/projects/${projectId}/tags/${info.tagId}/itrs/${info.id}` : '#'} style={{ fontFamily: 'monospace', fontWeight: 600, color }}>{info.itrNumber}</a>
      <span style={{ color: 'var(--text-muted)' }}>{ITR_STATUS_LABELS[info.status] ?? info.status} · {passed}/{results.length}{failed ? ` · ${failed} ✗` : ''}</span>
      {info.outdated && <span title="El lazo cambió (señales o cadena) después de generar el ITR" style={{ color: '#b45309', fontWeight: 600 }}>⚠ desactualizado</span>}
    </span>
  )
}
