'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { addDocumentRevision, getDocumentFileUrl, issueDocumentRevision, saveDocument } from '@/app/actions/documents'
import { DOC_TYPES, ISSUED_STATUSES, REVISION_STATUSES, STATUS_TONE, documentPath, isHttpsUrl, type DocType, type RevisionStatus } from '@/lib/documents/catalog'
import { Alert, Chip, Field, btn, card, grid, input, label, linkStyle, small } from '../../daily/daily-ui'

// Ficha del documento (fase 8, sesión 1): datos y sistemas, revisiones con PDF (bucket project-documents,
// inmutable) y/o enlace https al EDMS, emisión de borradores y «dónde se usa» con referencias superadas.

export type RevisionRow = {
  id: string; seq: number; rev: string; status: RevisionStatus; issued_on: string | null; file_path: string | null; file_name: string | null
  external_url: string | null; notes: string | null; created_by: string | null; created_at: string
}
export type UsageRow = {
  id: string; kind: 'itr' | 'procedure_revision'; label: string; detail: string; href: string | null
  usedRev: string; outdated: boolean; revalidated: boolean; reason: string | null
}
type Opt = { id: string; code: string; name: string }
type Doc = { id: string; number: string; title: string; docType: DocType; disciplineId: string; companyId: string; currentRevisionId: string | null; systemIds: string[] }

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', ...label, borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
const MAX_BYTES = 50 * 1024 * 1024

export default function DocumentDetail({ project, doc, revisions, usage, systems, disciplines, companies, names, canEdit }: {
  project: { id: string; code: string; name: string }
  doc: Doc
  revisions: RevisionRow[]
  usage: UsageRow[]
  systems: Opt[]
  disciplines: Opt[]
  companies: { id: string; name: string }[]
  names: Record<string, string>
  canEdit: boolean
}) {
  const t = useTranslations('Documents')
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit] = useState<Doc | null>(null)
  const [rev, setRev] = useState<null | { rev: string; status: RevisionStatus; issuedOn: string; url: string; notes: string; file: File | null }>(null)
  const [issueStatus, setIssueStatus] = useState<RevisionStatus>('ifc')

  const current = revisions.find(r => r.id === doc.currentRevisionId) ?? null
  const draft = revisions.find(r => r.status === 'draft') ?? null
  const sysCode = new Map(systems.map(s => [s.id, s.code]))
  const outdated = usage.filter(u => u.outdated)

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.error) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }

  function saveRevision() {
    if (!rev) return
    const url = rev.url.trim()
    if (url && !isHttpsUrl(url)) { setError(t('rev.httpsOnly')); return }
    if (rev.file && rev.file.size > MAX_BYTES) { setError(t('rev.tooBig')); return }
    run(async () => {
      let filePath: string | null = null
      if (rev.file) {
        filePath = documentPath(project.id, doc.id, rev.file.name, crypto.randomUUID())
        const { error: up } = await createClient().storage.from('project-documents').upload(filePath, rev.file, { contentType: rev.file.type || 'application/octet-stream' })
        if (up) return { error: up.message }
      }
      return addDocumentRevision({
        projectId: project.id, documentId: doc.id, rev: rev.rev, status: rev.status, issuedOn: rev.issuedOn || null,
        filePath, fileName: rev.file?.name ?? null, externalUrl: url || null, notes: rev.notes,
      })
    }, () => setRev(null))
  }

  function openFile(revisionId: string) {
    setError(null)
    start(async () => {
      const res = await getDocumentFileUrl({ projectId: project.id, revisionId })
      if (res.error || !res.url) { setError(res.error ?? t('rev.openError')); return }
      window.open(res.url, '_blank', 'noopener')
    })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={`/projects/${project.id}/documents`} style={linkStyle}>← {t('title')}</Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', margin: '8px 0 4px' }}>{doc.number}</h1>
        <p style={{ margin: 0, color: 'var(--text-strong)' }}>{doc.title}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          <Chip tone="muted">{t(`type.${doc.docType}`)}</Chip>
          {current ? <Chip tone={STATUS_TONE[current.status]}>{t('currentRev', { rev: current.rev })} · {t(`status.${current.status}`)}</Chip> : <Chip tone="muted">{t('noRev')}</Chip>}
          {outdated.length > 0 && <Chip tone="red">{t('outdatedN', { n: outdated.length })}</Chip>}
          <span style={small}>{doc.systemIds.map(s => sysCode.get(s)).filter(Boolean).join(', ') || t('noSystems')}</span>
          {canEdit && !edit && <button type="button" style={btn('outline')} onClick={() => setEdit(doc)}>{t('editDoc')}</button>}
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {edit && (
        <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label={t('editDoc')}>
          <div style={grid}>
            <Field text={t('f.number')} required><input style={input} value={edit.number} maxLength={80} onChange={e => setEdit({ ...edit, number: e.target.value })} /></Field>
            <Field text={t('f.type')} required>
              <select style={input} value={edit.docType} onChange={e => setEdit({ ...edit, docType: e.target.value as DocType })}>
                {DOC_TYPES.map(d => <option key={d} value={d}>{t(`type.${d}`)}</option>)}
              </select>
            </Field>
            <Field text={t('f.title')} required wide><input style={input} value={edit.title} maxLength={300} onChange={e => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field text={t('f.discipline')}>
              <select style={input} value={edit.disciplineId} onChange={e => setEdit({ ...edit, disciplineId: e.target.value })}>
                <option value="">—</option>
                {disciplines.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
              </select>
            </Field>
            <Field text={t('f.company')}>
              <select style={input} value={edit.companyId} onChange={e => setEdit({ ...edit, companyId: e.target.value })}>
                <option value="">—</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field text={t('f.systems')} wide>
              <select multiple style={{ ...input, minHeight: 110 }} value={edit.systemIds}
                onChange={e => setEdit({ ...edit, systemIds: Array.from(e.target.selectedOptions).map(o => o.value) })}>
                {systems.map(s => <option key={s.id} value={s.id}>{s.code}{s.name !== s.code ? ` — ${s.name}` : ''}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={isPending} style={btn('primary', isPending)} onClick={() => run(() => saveDocument({
              projectId: project.id, id: doc.id, number: edit.number, title: edit.title, docType: edit.docType,
              disciplineId: edit.disciplineId || null, companyId: edit.companyId || null, systemIds: edit.systemIds,
            }), () => setEdit(null))}>{t('save')}</button>
            <button type="button" style={btn('outline')} onClick={() => setEdit(null)}>{t('cancel')}</button>
          </div>
        </section>
      )}

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }} aria-labelledby="doc-revs">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 id="doc-revs" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{t('rev.title')}</h2>
          {canEdit && !rev && !draft && (
            <button type="button" style={btn('primary')} onClick={() => setRev({ rev: '', status: 'ifc', issuedOn: '', url: '', notes: '', file: null })}>+ {t('rev.new')}</button>
          )}
        </div>
        <p style={{ ...small, margin: 0 }}>{t('rev.help')}</p>

        {rev && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={grid}>
              <Field text={t('rev.rev')} required><input style={input} value={rev.rev} maxLength={20} placeholder="A, B, 0, 1…" onChange={e => setRev({ ...rev, rev: e.target.value })} /></Field>
              <Field text={t('f.status')} required>
                <select style={input} value={rev.status} onChange={e => setRev({ ...rev, status: e.target.value as RevisionStatus })}>
                  {REVISION_STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                </select>
              </Field>
              <Field text={t('rev.issuedOn')}><input type="date" style={input} value={rev.issuedOn} disabled={rev.status === 'draft'} onChange={e => setRev({ ...rev, issuedOn: e.target.value })} /></Field>
              <Field text={t('rev.file')}>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf" aria-label={t('rev.file')} onChange={e => setRev({ ...rev, file: e.target.files?.[0] ?? null })} />
              </Field>
              <Field text={t('rev.url')} wide><input style={input} value={rev.url} placeholder="https://" maxLength={1000} onChange={e => setRev({ ...rev, url: e.target.value })} /></Field>
              <Field text={t('rev.notes')} wide><input style={input} value={rev.notes} maxLength={2000} onChange={e => setRev({ ...rev, notes: e.target.value })} /></Field>
            </div>
            {rev.status !== 'draft' && current && <p style={{ ...small, margin: 0 }}>{t('rev.supersedes', { rev: current.rev, n: usage.length })}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={isPending || !rev.rev.trim()} style={btn('primary', isPending || !rev.rev.trim())} onClick={saveRevision}>{t('rev.save')}</button>
              <button type="button" style={btn('outline')} onClick={() => setRev(null)}>{t('cancel')}</button>
            </div>
          </div>
        )}

        {draft && canEdit && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 8 }}>
            <span style={small}>{t('rev.draftPending', { rev: draft.rev })}</span>
            <select style={{ ...input, width: 'auto' }} aria-label={t('f.status')} value={issueStatus} onChange={e => setIssueStatus(e.target.value as RevisionStatus)}>
              {ISSUED_STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </select>
            <button type="button" disabled={isPending} style={btn('primary', isPending)}
              onClick={() => run(() => issueDocumentRevision({ projectId: project.id, documentId: doc.id, revisionId: draft.id, status: issueStatus }))}>{t('rev.issue')}</button>
            <button type="button" disabled={isPending} style={btn('danger', isPending)}
              onClick={() => { if (window.confirm(t('rev.discardConfirm'))) run(() => issueDocumentRevision({ projectId: project.id, documentId: doc.id, revisionId: draft.id, status: null })) }}>{t('rev.discard')}</button>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>{t('rev.rev')}</th><th style={th}>{t('f.status')}</th><th style={th}>{t('rev.issuedOn')}</th>
              <th style={th}>{t('rev.source')}</th><th style={th}>{t('rev.notes')}</th><th style={th}>{t('rev.by')}</th>
            </tr></thead>
            <tbody>
              {revisions.length === 0 && <tr><td colSpan={6} style={{ ...td, color: 'var(--text-muted)' }}>{t('rev.empty')}</td></tr>}
              {revisions.map(r => {
                const superseded = r.status !== 'draft' && r.id !== doc.currentRevisionId
                return (
                  <tr key={r.id} style={{ opacity: superseded ? 0.65 : 1 }}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.rev}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <Chip tone={STATUS_TONE[r.status]}>{t(`status.${r.status}`)}</Chip>{' '}
                      {r.id === doc.currentRevisionId ? <Chip tone="green">{t('current')}</Chip> : superseded ? <Chip tone="struck">{t('superseded')}</Chip> : null}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.issued_on ?? '—'}</td>
                    <td style={td}>
                      {r.file_path && <button type="button" style={{ ...btn('outline'), padding: '3px 10px' }} onClick={() => openFile(r.id)}>{r.file_name ?? t('rev.pdf')}</button>}
                      {r.external_url && <a href={r.external_url} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, marginLeft: r.file_path ? 8 : 0 }}>{t('rev.edms')} ↗</a>}
                      {!r.file_path && !r.external_url && '—'}
                    </td>
                    <td style={td}>{r.notes ?? ''}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{(r.created_by ? names[r.created_by] : undefined) ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="doc-usage">
        <h2 id="doc-usage" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-strong)' }}>{t('usage.title')}</h2>
        {usage.length === 0 ? <p style={{ ...small, margin: 0 }}>{t('usage.empty')}</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {usage.map(u => (
              <li key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
                <Chip tone="muted">{t(`usage.${u.kind}`)}</Chip>
                {u.href ? <Link href={u.href} style={{ ...linkStyle, fontWeight: 600 }}>{u.label}</Link> : <strong>{u.label}</strong>}
                <span style={small}>{u.detail}</span>
                <Chip tone={u.outdated ? 'red' : 'green'}>{u.outdated ? t('usage.outdated', { rev: u.usedRev }) : t('usage.current', { rev: u.usedRev })}</Chip>
                {u.revalidated && <span style={{ ...small, fontSize: 'var(--text-xs)' }} title={u.reason ?? ''}>{t('usage.revalidated')}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
