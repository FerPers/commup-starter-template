'use client'

// Importar matriz C&E con IA (fase 4-D, sesión 3; §10.20 y §10.25–10.28):
// 1) archivo: hoja de Excel (se envía como CSV) o PDF (≤ 4 MB);
// 2) la IA propone causas, efectos y cruces;
// 3) revisión en pantalla — dudas y tags sin pareja en ámbar, todo editable — y solo al aceptar se crea
//    la matriz. Si se cierra la página antes, la propuesta se pierde (no se guarda nada).

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { useTranslations } from 'next-intl'
import { useAskDialog } from '@/components/ui/AskDialog'
import { createCeMatrixFromReview, extractCeMatrixWithAi } from '@/app/actions/ce-import'
import { MAX_PDF_BYTES, MAX_SHEET_CHARS, reviewErrors, type ReviewState } from '@/lib/ce/import'
import { CE_ACTIONS, CE_VOTINGS, type CeAction, type CeVoting } from '@/lib/ce/matrix'

type Meta = { code: string; title: string; systemId: string; revision: string; sourceDocument: string; fileName: string }

const field = { width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-strong)', fontSize: '12px', boxSizing: 'border-box' } as const
const primary = { padding: '9px 14px', borderRadius: '8px', border: 0, background: 'var(--primary-600, #2563eb)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' } as const
const amber = '#fffbeb'

export default function ImportCeWizard({ project, systems, aiReady }: {
  project: { id: string; name: string }
  systems: { id: string; code: string; name: string }[]
  aiReady: boolean
}) {
  const tc = useTranslations('CeMatrix')
  const ti = useTranslations('CeMatrix.import')
  const tA = useTranslations('AskDialog')
  const { dialog, ask, confirm } = useAskDialog() // G-08: diálogo propio
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [hint, setHint] = useState('')
  const [review, setReview] = useState<ReviewState | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [error, setError] = useState('')
  const [reading, startReading] = useTransition()
  const [saving, startSaving] = useTransition()

  const isPdf = file?.type === 'application/pdf' || file?.name.toLowerCase().endsWith('.pdf')

  async function pick(f: File | null) {
    setError(''); setReview(null); setWorkbook(null); setFile(f)
    if (!f || f.name.toLowerCase().endsWith('.pdf')) return
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
      setWorkbook(wb); setSheetName(wb.SheetNames[0] ?? '')
    } catch { setError(ti('notExcel')) }
  }

  function read() {
    if (!file) return
    setError('')
    const form = new FormData()
    form.set('projectId', project.id)
    form.set('fileName', file.name)
    form.set('hint', hint)
    if (isPdf) {
      if (file.size > MAX_PDF_BYTES) { setError(ti('pdfTooBig')); return }
      form.set('pdf', file)
    } else {
      const ws = workbook?.Sheets[sheetName]
      if (!ws) { setError(ti('pickSheet')); return }
      const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false })
      if (csv.length > MAX_SHEET_CHARS) { setError(ti('sheetTooBig')); return }
      form.set('sheet', csv)
    }
    startReading(async () => {
      const res = await extractCeMatrixWithAi(form)
      if (res.error || !res.review || !res.meta) { setError(res.error ?? ti('noProposal')); return }
      setReview(res.review)
      setMeta({ code: '', title: res.meta.title, systemId: '', revision: res.meta.revision, sourceDocument: res.meta.sourceDocument, fileName: res.meta.fileName })
    })
  }

  const errors = useMemo(() => (review ? reviewErrors(review) : []), [review])
  const linkMap = useMemo(() => new Map((review?.links ?? []).map((l, i) => [`${l.cause}|${l.effect}`, i])), [review])
  const doubts = review ? review.causes.filter(c => c.uncertain || !c.tagMatched).length + review.effects.filter(e => e.uncertain || !e.tagMatched).length + review.links.filter(l => l.uncertain).length : 0

  function setCause(i: number, patch: Partial<ReviewState['causes'][number]>) {
    setReview(r => r && { ...r, causes: r.causes.map((c, j) => j === i ? { ...c, ...patch, uncertain: false } : c) })
  }
  function setEffect(i: number, patch: Partial<ReviewState['effects'][number]>) {
    setReview(r => r && { ...r, effects: r.effects.map((e, j) => j === i ? { ...e, ...patch, uncertain: false } : e) })
  }
  function removeRow(kind: 'causes' | 'effects', key: string) {
    setReview(r => r && { ...r, [kind]: r[kind].filter(x => x.key !== key), links: r.links.filter(l => (kind === 'causes' ? l.cause : l.effect) !== key) })
  }
  /** Celda: sin cruce → directo → con retardo (pide segundos) → sin cruce. */
  async function cycle(cause: string, effect: string) {
    // El retardo se pide antes de actualizar el estado (el diálogo es asíncrono).
    const current = review?.links.find(l => l.cause === cause && l.effect === effect)
    let delay: string | null = null
    if (current && current.delay === '') {
      delay = await ask({ title: ti('delayTitle'), confirmLabel: tA('confirm'), input: { label: ti('delayPrompt'), initial: '5', multiline: false } })
      if (delay === null) return
    }
    setReview(r => {
      if (!r) return r
      const idx = r.links.findIndex(l => l.cause === cause && l.effect === effect)
      if (idx < 0) return { ...r, links: [...r.links, { cause, effect, delay: '', uncertain: false }] }
      const link = r.links[idx]
      if (link.delay === '') {
        if (delay === null) return r
        if (delay.trim() === '') return { ...r, links: r.links.filter((_, i) => i !== idx) }
        return { ...r, links: r.links.map((l, i) => i === idx ? { ...l, delay: delay.trim(), uncertain: false } : l) }
      }
      return { ...r, links: r.links.filter((_, i) => i !== idx) }
    })
  }

  function save() {
    if (!review || !meta) return
    setError('')
    startSaving(async () => {
      const res = await createCeMatrixFromReview({ projectId: project.id, systemId: meta.systemId || null, code: meta.code, title: meta.title, revision: meta.revision, sourceDocument: meta.sourceDocument, fileName: meta.fileName, review })
      if (res.error || !res.id) { setError(res.error ?? ti('createError')); return }
      router.push(`/projects/${project.id}/ce-matrices/${res.id}`)
    })
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1400px' }}>
      {dialog}
      <Link href={`/projects/${project.id}/ce-matrices`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>← {project.name} · {tc('back')}</Link>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: '12px 0 4px' }}>{ti('title')}</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px', maxWidth: '760px' }}>
        {ti.rich('intro', { strong: c => <strong>{c}</strong> })}
      </p>
      {!aiReady && <p role="alert" style={{ color: '#b45309', fontSize: '13px' }}>{ti('aiOff')}</p>}

      {!review && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'grid', gap: '12px', maxWidth: '640px' }}>
          <label style={{ fontSize: '12px' }}>{ti('file')}
            <input type="file" accept=".xlsx,.xls,.csv,.pdf,application/pdf" style={field} onChange={e => void pick(e.target.files?.[0] ?? null)} />
          </label>
          {workbook && (
            <label style={{ fontSize: '12px' }}>{ti('sheet')}
              <select style={field} value={sheetName} onChange={e => setSheetName(e.target.value)}>
                {workbook.SheetNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          <label style={{ fontSize: '12px' }}>{ti('hint')}
            <input style={field} maxLength={300} value={hint} onChange={e => setHint(e.target.value)} placeholder={ti('hintPlaceholder')} />
          </label>
          <div>
            <button type="button" style={primary} disabled={!file || reading || !aiReady || (!isPdf && !workbook)} onClick={read}>{reading ? ti('reading') : ti('read')}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" style={{ color: '#b91c1c', fontSize: '13px' }}>{error}</p>}

      {review && meta && (
        <>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '12px' }}>
            <label style={{ fontSize: '12px' }}>{ti('code')}<input style={field} maxLength={60} value={meta.code} onChange={e => setMeta({ ...meta, code: e.target.value })} placeholder="CE-A100-S02" /></label>
            <label style={{ fontSize: '12px', gridColumn: 'span 2' }}>{ti('titleField')}<input style={field} maxLength={200} value={meta.title} onChange={e => setMeta({ ...meta, title: e.target.value })} /></label>
            <label style={{ fontSize: '12px' }}>{ti('system')}
              <select style={field} value={meta.systemId} onChange={e => setMeta({ ...meta, systemId: e.target.value })}>
                <option value="">—</option>{systems.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '12px' }}>{ti('revision')}<input style={field} maxLength={30} value={meta.revision} onChange={e => setMeta({ ...meta, revision: e.target.value })} /></label>
            <label style={{ fontSize: '12px' }}>{ti('sourceDocument')}<input style={field} maxLength={200} value={meta.sourceDocument} onChange={e => setMeta({ ...meta, sourceDocument: e.target.value })} /></label>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px' }}>
            {ti('summary', { causes: review.causes.length, effects: review.effects.length, links: review.links.length, doubts })}
          </p>
          {review.warnings.length > 0 && (
            <ul style={{ fontSize: '12px', color: '#92400e', background: amber, border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 12px 8px 28px', margin: '0 0 12px' }}>
              {review.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}

          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', alignItems: 'start' }}>
            <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'auto', maxHeight: '60vh' }}>
              <h2 style={{ fontSize: '13px', margin: 0, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>{ti('causes')}</h2>
              <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>
                <thead><tr>{[ti('col.code'), ti('col.description'), 'Tag', ti('col.condition'), 'Set point', tc('voting'), ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px', color: 'var(--text-muted)' }}>{h}</th>)}</tr></thead>
                <tbody>{review.causes.map((c, i) => (
                  <tr key={c.key} style={{ background: c.uncertain ? amber : undefined }} title={c.note || undefined}>
                    <td style={{ padding: '4px', width: '80px' }}><input aria-label={ti('aria.causeCode', { n: i + 1 })} style={field} value={c.code} onChange={e => setCause(i, { code: e.target.value })} /></td>
                    <td style={{ padding: '4px', minWidth: '180px' }}><input aria-label={ti('aria.causeDescription', { n: i + 1 })} style={field} value={c.description} onChange={e => setCause(i, { description: e.target.value })} /></td>
                    <td style={{ padding: '4px', width: '120px' }}><input aria-label={ti('aria.causeTag', { n: i + 1 })} style={{ ...field, background: c.tagMatched ? field.background : amber }} title={c.tagMatched ? undefined : ti('tagMissing')} value={c.tag} onChange={e => setCause(i, { tag: e.target.value, tagMatched: c.tagMatched && e.target.value === c.tag })} /></td>
                    <td style={{ padding: '4px', width: '70px' }}><input aria-label={ti('aria.causeCondition', { n: i + 1 })} style={field} value={c.condition} onChange={e => setCause(i, { condition: e.target.value })} /></td>
                    <td style={{ padding: '4px', width: '100px' }}><input aria-label={ti('aria.causeSetpoint', { n: i + 1 })} style={field} value={c.setpoint} onChange={e => setCause(i, { setpoint: e.target.value })} /></td>
                    <td style={{ padding: '4px', width: '90px' }}>
                      <select aria-label={ti('aria.causeVoting', { n: i + 1 })} style={field} value={c.voting ?? ''} onChange={e => setCause(i, { voting: (e.target.value || null) as CeVoting | null })}>
                        <option value="">—</option>{CE_VOTINGS.map(v => <option key={v} value={v}>{tc(`votingOpt.${v}`)}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px' }}><button type="button" aria-label={ti('aria.removeCause', { code: c.code })} onClick={() => removeRow('causes', c.key)} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#b91c1c' }}>×</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </section>

            <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'auto', maxHeight: '60vh' }}>
              <h2 style={{ fontSize: '13px', margin: 0, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>{ti('effects')}</h2>
              <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>
                <thead><tr>{[ti('col.code'), ti('col.description'), 'Tag', tc('actionLabel'), ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px', color: 'var(--text-muted)' }}>{h}</th>)}</tr></thead>
                <tbody>{review.effects.map((e, i) => (
                  <tr key={e.key} style={{ background: e.uncertain ? amber : undefined }} title={e.note || undefined}>
                    <td style={{ padding: '4px', width: '80px' }}><input aria-label={ti('aria.effectCode', { n: i + 1 })} style={field} value={e.code} onChange={ev => setEffect(i, { code: ev.target.value })} /></td>
                    <td style={{ padding: '4px', minWidth: '180px' }}><input aria-label={ti('aria.effectDescription', { n: i + 1 })} style={field} value={e.description} onChange={ev => setEffect(i, { description: ev.target.value })} /></td>
                    <td style={{ padding: '4px', width: '130px' }}><input aria-label={ti('aria.effectTag', { n: i + 1 })} style={{ ...field, background: e.tagMatched ? field.background : amber }} title={e.tagMatched ? undefined : ti('tagMissing')} value={e.tag} onChange={ev => setEffect(i, { tag: ev.target.value, tagMatched: e.tagMatched && ev.target.value === e.tag })} /></td>
                    <td style={{ padding: '4px', width: '110px' }}>
                      <select aria-label={ti('aria.effectAction', { n: i + 1 })} style={field} value={e.action} onChange={ev => setEffect(i, { action: ev.target.value as CeAction })}>
                        {CE_ACTIONS.map(a => <option key={a} value={a}>{tc(`action.${a}`)}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px' }}><button type="button" aria-label={ti('aria.removeEffect', { code: e.code })} onClick={() => removeRow('effects', e.key)} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#b91c1c' }}>×</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </section>
          </div>

          <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'auto', maxHeight: '60vh', marginTop: '16px' }}>
            <h2 style={{ fontSize: '13px', margin: 0, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>{ti('links')}</h2>
            <table style={{ borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead><tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--gray-50)', padding: '6px 10px', textAlign: 'left', minWidth: '200px' }}>{tc('corner')}</th>
                {review.effects.map(e => <th key={e.key} title={e.description} style={{ padding: '6px 4px', background: 'var(--gray-50)', writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', maxHeight: '120px', fontSize: '11px' }}>{e.code}{e.tag ? ` · ${e.tag}` : ''}</th>)}
              </tr></thead>
              <tbody>{review.causes.map(c => (
                <tr key={c.key}>
                  <th scope="row" style={{ position: 'sticky', left: 0, background: 'var(--card-bg)', padding: '6px 10px', textAlign: 'left', fontWeight: 400, borderTop: '1px solid var(--border)' }}><strong>{c.code}</strong> {c.description}</th>
                  {review.effects.map(e => {
                    const idx = linkMap.get(`${c.key}|${e.key}`)
                    const link = idx === undefined ? undefined : review.links[idx]
                    return (
                      <td key={e.key} onClick={() => cycle(c.key, e.key)} aria-label={`${c.code} × ${e.code}: ${link ? (link.delay ? `T${link.delay}s` : 'X') : tc('noLink')}`}
                        style={{ width: '44px', minWidth: '44px', height: '30px', textAlign: 'center', border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 700,
                          background: link?.uncertain ? '#fde68a' : link ? (link.delay ? '#fef3c7' : '#dcfce7') : undefined, color: link?.delay ? '#92400e' : '#166534' }}>
                        {link ? (link.delay ? `T${link.delay}s` : 'X') : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}</tbody>
            </table>
          </section>

          {errors.length > 0 && <ul role="alert" style={{ color: '#b91c1c', fontSize: '12px', margin: '12px 0 0' }}>{errors.map(e => <li key={e}>{e}</li>)}</ul>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
            <button type="button" style={primary} disabled={saving || errors.length > 0 || !meta.code.trim() || !meta.title.trim()} onClick={save}>{saving ? ti('creating') : ti('create')}</button>
            <button type="button" onClick={async () => { if (await confirm({ message: ti('discardConfirm'), confirmLabel: ti('discard'), danger: true })) { setReview(null); setMeta(null) } }} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontSize: '13px' }}>{ti('discard')}</button>
          </div>
        </>
      )}
    </div>
  )
}
