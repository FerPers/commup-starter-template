'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { copyProcedure, createLineupSheet, createProcedure } from '@/app/actions/startup'
import { LINEUP_PURPOSES, PROCEDURE_KINDS, lineupProgress, type LineupItemState, type LineupPurpose, type ProcedureKind } from '@/lib/startup/catalog'
import { Alert, Chip, Field, SystemSelect, btn, card, grid, input, small } from '../daily/daily-ui'
import StartupTabs from './StartupTabs'

type ProcRow = {
  id: string; number: string; title: string; kind: string; system: string | null
  currentRev: number | null; fieldVerified: boolean; openRev: { id: string; rev: number; status: string } | null; liveRuns: number
}
type SheetRow = { id: string; number: string; title: string; purpose: string; status: string; verifiedAt: string | null; system: string | null; items: unknown[] }

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const mono: React.CSSProperties = { fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none', fontFamily: 'ui-monospace, monospace' }
export const SHEET_TONE: Record<string, 'muted' | 'blue' | 'amber' | 'green' | 'struck'> = { draft: 'muted', issued: 'blue', in_progress: 'amber', verified: 'green', superseded: 'struck' }

// H-18: Procedimientos (`/startup`) y Line-ups (`/startup/lineups`) son pestañas con ruta; la vista recibe cuál.
export default function StartupView({ project, tab, procedures, sheets, systems, otherProcedures, canEdit }: {
  project: { id: string; code: string; name: string }
  tab: 'procedures' | 'lineups'
  procedures: ProcRow[]
  sheets: SheetRow[]
  systems: { id: string; code: string; name: string }[]
  otherProcedures: { id: string; label: string }[]
  canEdit: boolean
}) {
  const t = useTranslations('Startup')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [proc, setProc] = useState({ title: '', kind: 'startup' as ProcedureKind, systemId: '' })
  const [sheet, setSheet] = useState({ title: '', purpose: 'startup' as LineupPurpose, systemId: '', procedureId: '', generate: true })
  const [copyId, setCopyId] = useState('')
  const root = `/projects/${project.id}/startup`

  function go(fn: () => Promise<{ id?: string; error?: string }>, to: (id: string) => string) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error || !res.id) { setError(res.error ?? t('error')); return }
      router.push(to(res.id))
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1300, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <StartupTabs
        projectId={project.id}
        active={tab}
        subtitle={t('subtitle')}
        actions={canEdit && <button type="button" style={btn('primary')} onClick={() => setCreating(!creating)}>+ {t(tab === 'procedures' ? 'newProcedure' : 'newLineup')}</button>}
      />

      {error && <Alert kind="error">{error}</Alert>}

      {creating && tab === 'procedures' && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={grid}>
            <Field text={t('field.title')} wide required><input style={input} value={proc.title} maxLength={200} onChange={e => setProc({ ...proc, title: e.target.value })} /></Field>
            <Field text={t('field.kind')}>
              <select style={input} value={proc.kind} onChange={e => setProc({ ...proc, kind: e.target.value as ProcedureKind })}>
                {PROCEDURE_KINDS.map(k => <option key={k} value={k}>{t(`kind.${k}`)}</option>)}
              </select>
            </Field>
            <Field text={t('field.system')}><SystemSelect value={proc.systemId} onChange={v => setProc({ ...proc, systemId: v })} systems={systems} emptyLabel={t('field.anySystem')} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" style={btn('primary', isPending || !proc.title.trim())} disabled={isPending || !proc.title.trim()}
              onClick={() => go(() => createProcedure({ projectId: project.id, ...proc, systemId: proc.systemId || null }), id => `${root}/procedures/${id}`)}>{t('create')}</button>
            {otherProcedures.length > 0 && (
              <>
                <span style={small}>{t('orCopy')}</span>
                <select aria-label={t('copyFrom')} style={{ ...input, maxWidth: 420 }} value={copyId} onChange={e => setCopyId(e.target.value)}>
                  <option value="">{t('copyFrom')}</option>
                  {otherProcedures.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <button type="button" style={btn('outline', isPending || !copyId)} disabled={isPending || !copyId}
                  onClick={() => go(() => copyProcedure({ projectId: project.id, sourceProcedureId: copyId }), id => `${root}/procedures/${id}`)}>{t('copy')}</button>
              </>
            )}
          </div>
        </section>
      )}

      {creating && tab === 'lineups' && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={grid}>
            <Field text={t('field.system')} required><SystemSelect value={sheet.systemId} onChange={v => setSheet({ ...sheet, systemId: v })} systems={systems} emptyLabel={t('field.pick')} /></Field>
            <Field text={t('field.title')} required><input style={input} value={sheet.title} maxLength={200} onChange={e => setSheet({ ...sheet, title: e.target.value })} /></Field>
            <Field text={t('field.purpose')}>
              <select style={input} value={sheet.purpose} onChange={e => setSheet({ ...sheet, purpose: e.target.value as LineupPurpose })}>
                {LINEUP_PURPOSES.map(p => <option key={p} value={p}>{t(`purpose.${p}`)}</option>)}
              </select>
            </Field>
            <Field text={t('field.procedure')}>
              <select style={input} value={sheet.procedureId} onChange={e => setSheet({ ...sheet, procedureId: e.target.value })}>
                <option value="">—</option>
                {procedures.map(p => <option key={p.id} value={p.id}>{p.number} — {p.title}</option>)}
              </select>
            </Field>
          </div>
          <label style={{ ...small, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={sheet.generate} onChange={e => setSheet({ ...sheet, generate: e.target.checked })} /> {t('generate')}
          </label>
          <div>
            <button type="button" style={btn('primary', isPending || !sheet.title.trim() || !sheet.systemId)} disabled={isPending || !sheet.title.trim() || !sheet.systemId}
              onClick={() => go(() => createLineupSheet({ projectId: project.id, ...sheet, procedureId: sheet.procedureId || null }), id => `${root}/lineups/${id}`)}>{t('create')}</button>
          </div>
        </section>
      )}

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          {tab === 'procedures' ? (
            <>
              <thead><tr>{['number', 'title', 'kind', 'system', 'revision', 'runs'].map(c => <th key={c} style={th}>{t(`col.${c}`)}</th>)}</tr></thead>
              <tbody>
                {procedures.map(p => (
                  <tr key={p.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><Link href={`${root}/procedures/${p.id}`} style={mono}>{p.number}</Link></td>
                    <td style={td}>{p.title}</td>
                    <td style={{ ...td, ...small }}>{t(`kind.${p.kind}`)}</td>
                    <td style={td}>{p.system ?? '—'}</td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        {p.currentRev !== null ? <Chip tone="green">R{p.currentRev} {t('approved')}</Chip> : <Chip tone="muted">{t('notApproved')}</Chip>}
                        {p.currentRev !== null && (p.fieldVerified ? <Chip tone="green">{t('fieldVerified')}</Chip> : <Chip tone="amber">{t('notFieldVerified')}</Chip>)}
                        {p.openRev && <Chip tone="blue">R{p.openRev.rev} {t(`revStatus.${p.openRev.status}`)}</Chip>}
                      </span>
                    </td>
                    <td style={td}>{p.liveRuns > 0 ? <Chip tone="amber">{t('liveRuns', { n: p.liveRuns })}</Chip> : '—'}</td>
                  </tr>
                ))}
                {procedures.length === 0 && <tr><td colSpan={6} style={{ ...td, ...small, textAlign: 'center', padding: 32 }}>{t('emptyProcedures')}</td></tr>}
              </tbody>
            </>
          ) : (
            <>
              <thead><tr>{['number', 'title', 'system', 'purpose', 'progress', 'status'].map(c => <th key={c} style={th}>{t(`col.${c}`)}</th>)}</tr></thead>
              <tbody>
                {sheets.map(s => {
                  const pg = lineupProgress(s.items as LineupItemState[])
                  return (
                    <tr key={s.id} style={s.status === 'superseded' ? { opacity: 0.6 } : undefined}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}><Link href={`${root}/lineups/${s.id}`} style={mono}>{s.number}</Link></td>
                      <td style={td}>{s.title}</td>
                      <td style={td}>{s.system ?? '—'}</td>
                      <td style={{ ...td, ...small }}>{t(`purpose.${s.purpose}`)}</td>
                      <td style={{ ...td, ...small }}>{pg.done}/{pg.total}{pg.toVerify > 0 ? ` · ${t('toVerify', { n: pg.toVerify })}` : ''}{pg.misaligned > 0 ? ` · ${t('misaligned', { n: pg.misaligned })}` : ''}</td>
                      <td style={td}><Chip tone={SHEET_TONE[s.status] ?? 'muted'}>{t(`sheetStatus.${s.status}`)}</Chip></td>
                    </tr>
                  )
                })}
                {sheets.length === 0 && <tr><td colSpan={6} style={{ ...td, ...small, textAlign: 'center', padding: 32 }}>{t('emptyLineups')}</td></tr>}
              </tbody>
            </>
          )}
        </table>
      </div>
    </div>
  )
}
