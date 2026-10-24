'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  exportAllTemplates,
  restoreTemplatesBackup,
  previewRestoreTaxonomy,
  createMissingTaxonomy,
} from '@/app/actions/templates-backup'
import type { TemplatesBackup, RestoreResult, TaxonomyPreview } from '@/lib/constants/templates-backup'
import BackupDocumentView from '@/components/templates/BackupDocumentView'
import { alpha } from '@/lib/theme'
import { pressable } from '@/lib/a11y/pressable'

interface Props {
  orgName: string
  orgSlug: string | null
}

function todayStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org'
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function BackupRestoreView({ orgName, orgSlug }: Props) {
  // `tb` (no `t`): las plantillas del respaldo se recorren como `t`.
  const tb = useTranslations('TemplatesBackup')
  const router = useRouter()
  const [isExporting, startExport] = useTransition()
  const [isRestoring, startRestore] = useTransition()
  const [exportError, setExportError] = useState<string | null>(null)

  const [parsed, setParsed] = useState<TemplatesBackup | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [rawJson, setRawJson] = useState<string>('')
  const [showDoc, setShowDoc] = useState(false)

  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [duplicateSuffix, setDuplicateSuffix] = useState(' (restaurado)')
  const [includeItr, setIncludeItr] = useState(true)
  const [includePreservation, setIncludePreservation] = useState(true)
  const [includePssr, setIncludePssr] = useState(true)

  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null)

  const [taxonomyPreview, setTaxonomyPreview] = useState<TaxonomyPreview | null>(null)
  const [isCheckingTaxonomy, startTaxonomyCheck] = useTransition()
  const [isCreatingTaxonomy, startCreateTaxonomy] = useTransition()
  const [taxonomyMsg, setTaxonomyMsg] = useState<string | null>(null)

  function handleExportAll() {
    setExportError(null)
    startExport(async () => {
      const res = await exportAllTemplates()
      if (res.error || !res.backup) {
        setExportError(res.error ?? tb('exportError'))
        return
      }
      const slug = orgSlug ? slugify(orgSlug) : slugify(orgName)
      downloadJson(`commup-templates-${slug}-${todayStamp()}.json`, res.backup)
    })
  }

  function runPreflight(payload: TemplatesBackup) {
    setTaxonomyMsg(null)
    startTaxonomyCheck(async () => {
      const res = await previewRestoreTaxonomy(payload)
      if (res.error || !res.preview) {
        setTaxonomyPreview(null)
        return
      }
      setTaxonomyPreview(res.preview)
    })
  }

  function parseAndValidate(text: string, name: string | null) {
    try {
      const obj = JSON.parse(text) as TemplatesBackup
      if (obj?.format !== 'commup.templates.backup') {
        setParseError(tb('badFormat'))
        setParsed(null)
        return
      }
      if (typeof obj.version !== 'number') {
        setParseError(tb('noVersion'))
        setParsed(null)
        return
      }
      setParsed(obj)
      setRawJson(text)
      setFilename(name)
      setParseError(null)
      setRestoreResult(null)
      setTaxonomyPreview(null)
      runPreflight(obj)
    } catch (e) {
      setParseError(tb('badJson', { msg: e instanceof Error ? e.message : 'parse error' }))
      setParsed(null)
    }
  }

  function handleAutoCreateTaxonomy() {
    if (!taxonomyPreview || !parsed) return
    setTaxonomyMsg(null)
    startCreateTaxonomy(async () => {
      const res = await createMissingTaxonomy({
        disciplines: taxonomyPreview.missingDisciplines,
        phases: taxonomyPreview.missingPhases,
        equipmentTypes: taxonomyPreview.missingEquipmentTypes,
      })
      // el wrapper withAuth puede devolver solo { error } — normalizar
      const errs = [...(res.error ? [res.error] : []), ...(res.errors ?? [])]
      if (errs.length > 0) {
        setTaxonomyMsg(`Errores: ${errs.join(' · ')}`)
      } else {
        setTaxonomyMsg(
          tb('created', { disciplines: res.created?.disciplines ?? 0, phases: res.created?.phases ?? 0, types: res.created?.equipmentTypes ?? 0 }),
        )
      }
      // Re-run preflight to confirm everything is now in place.
      runPreflight(parsed)
      router.refresh()
    })
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      parseAndValidate(text, file.name)
    }
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleRestore() {
    if (!parsed) return
    setRestoreResult(null)
    startRestore(async () => {
      const res = await restoreTemplatesBackup(parsed, {
        skipDuplicates,
        duplicateSuffix,
        includeItr,
        includePreservation,
        includePssr,
      })
      if (res.error || !res.result) {
        setParseError(res.error ?? tb('restoreError'))
        return
      }
      setRestoreResult(res.result)
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ───────── EXPORT CARD ───────── */}
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h2 style={cardTitle}>{tb('exportTitle')}</h2>
            <p style={cardSubtitle}>
              {tb('exportHelp')}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleExportAll}
            disabled={isExporting}
            style={primaryButton(isExporting)}
          >
            {isExporting ? tb('exporting') : tb('exportButton')}
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Nombre: <code style={codeStyle}>commup-templates-{orgSlug ? slugify(orgSlug) : slugify(orgName)}-{todayStamp()}.json</code>
          </span>
        </div>
        {exportError && <p style={errorBox}>{exportError}</p>}
      </div>

      {/* ───────── RESTORE CARD ───────── */}
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div>
            <h2 style={cardTitle}>{tb('restoreTitle')}</h2>
            <p style={cardSubtitle}>
              {tb('restoreHelp')}
            </p>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          {...pressable(e => {
            // El input oculto vive dentro de la zona: su propio clic burbujea hasta aquí.
            if (e.target instanceof HTMLInputElement) return
            e.currentTarget.querySelector<HTMLInputElement>('input[type="file"]')?.click()
          })}
          style={{
            border: '2px dashed var(--border)',
            borderRadius: '12px',
            padding: '32px',
            textAlign: 'center',
            cursor: 'pointer',
            background: 'var(--gray-50)',
            transition: 'border-color 0.15s',
          }}
        >
          <div style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.4 }}>↑</div>
          <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-strong)', margin: '0 0 4px' }}>
            {filename ? tb('loaded', { name: filename }) : tb('drop')}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
            {tb('onlyCommup')}
          </p>
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
        </div>

        {parseError && <p style={errorBox}>{parseError}</p>}

        {/* ───── Visor ───── */}
        {parsed && (
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '10px',
            }}>
              <SummaryCell label={tb('format')} value={`v${parsed.version}`} mono />
              <SummaryCell
                label={tb('sourceOrg')}
                value={parsed.org?.name ?? '—'}
              />
              <SummaryCell
                label={tb('exported')}
                value={parsed.exported_at ? new Date(parsed.exported_at).toLocaleString() : '—'}
              />
              <SummaryCell
                label={tb('total')}
                value={`${parsed.itr_templates.length + parsed.preservation_procedures.length + parsed.pssr_templates.length}`}
              />
            </div>

            {/* ───── Pre-flight taxonomy check ───── */}
            <TaxonomyPreflight
              isChecking={isCheckingTaxonomy}
              preview={taxonomyPreview}
              onAutoCreate={handleAutoCreateTaxonomy}
              isCreating={isCreatingTaxonomy}
              message={taxonomyMsg}
            />

            {/* Per-module summaries */}
            <ModuleSummary
              title={`ITR (${parsed.itr_templates.length})`}
              color='var(--primary-700)'
              entries={parsed.itr_templates.map(t => ({
                code: t.code,
                title: t.title,
                meta: `${t.discipline_code ?? '—'} · ${t.phase_code ?? '—'} · ${tb('items', { n: t.sections.reduce((a, s) => a + s.items.length, 0) })}`,
              }))}
              checked={includeItr}
              onCheck={setIncludeItr}
            />
            <ModuleSummary
              title={`${tb('preservation')} (${parsed.preservation_procedures.length})`}
              color='var(--success-700)'
              entries={parsed.preservation_procedures.map(p => ({
                code: p.code,
                title: p.title,
                meta: `${p.frequency} · ${p.interval_days}d · ${tb('items', { n: p.items.length })}`,
              }))}
              checked={includePreservation}
              onCheck={setIncludePreservation}
            />
            <ModuleSummary
              title={`PSSR (${parsed.pssr_templates.length})`}
              color='var(--violet-700)'
              entries={parsed.pssr_templates.map(t => ({
                code: t.name,
                title: t.description ?? '',
                meta: tb('items', { n: t.items.length }),
              }))}
              checked={includePssr}
              onCheck={setIncludePssr}
            />

            {/* Raw JSON toggle + Document view */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowDoc(true)}
                style={{
                  padding: '6px 12px', background: 'var(--primary-50)', border: '1px solid var(--primary-200)',
                  borderRadius: '6px', fontSize: '12px', color: 'var(--primary-800)', cursor: 'pointer',
                  fontWeight: 600,
                }}
                title={tb('viewDocHint')}
              >
                {tb('viewDoc')}
              </button>
              <button
                onClick={() => setShowRaw(s => !s)}
                style={{
                  padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: '6px', fontSize: '12px', color: 'var(--text-strong)', cursor: 'pointer',
                }}
              >
                {showRaw ? tb('hideRaw') : tb('showRaw')}
              </button>
              {showRaw && (
                <pre style={{
                  marginTop: '12px',
                  background: 'var(--gray-900)',
                  color: 'var(--sidebar-text-strong)',
                  padding: '16px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  overflow: 'auto',
                  maxHeight: '400px',
                }}>
                  {rawJson}
                </pre>
              )}
            </div>

            {/* ───── Options + restore button ───── */}
            <div style={{
              background: 'var(--gray-50)',
              padding: '16px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>
                {tb('options')}
              </h3>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-strong)' }}>
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={e => setSkipDuplicates(e.target.checked)}
                />
                {tb('skipDuplicates')}
              </label>

              {!skipDuplicates && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-strong)' }}>
                  {tb('suffix')}
                  <input
                    value={duplicateSuffix}
                    onChange={e => setDuplicateSuffix(e.target.value)}
                    style={{
                      padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px',
                      fontSize: '12px', fontFamily: 'inherit', width: '180px',
                    }}
                  />
                </label>
              )}

              <p style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                margin: 0,
                padding: '8px 12px',
                background: 'var(--warning-100)',
                borderRadius: '6px',
                border: '1px solid var(--warning-200)',
              }}>
                {tb.rich('mapping', { strong: c => <strong>{c}</strong> })}
              </p>
            </div>

            <div>
              <button
                onClick={handleRestore}
                disabled={isRestoring || (!includeItr && !includePreservation && !includePssr)}
                style={primaryButton(isRestoring || (!includeItr && !includePreservation && !includePssr))}
              >
                {isRestoring ? tb('restoring') : tb('restoreButton')}
              </button>
            </div>
          </div>
        )}

        {showDoc && parsed && (
          <BackupDocumentView backup={parsed} onClose={() => setShowDoc(false)} />
        )}

        {/* ───── Result ───── */}
        {restoreResult && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>
              {tb('result')}
            </h3>
            <ResultRow label="ITR" r={restoreResult.itr} />
            <ResultRow label={tb('preservation')} r={restoreResult.preservation} />
            <ResultRow label="PSSR" r={restoreResult.pssr} />
          </div>
        )}
      </div>
    </div>
  )
}

function TaxonomyPreflight({
  isChecking, preview, onAutoCreate, isCreating, message,
}: {
  isChecking: boolean
  preview: TaxonomyPreview | null
  onAutoCreate: () => void
  isCreating: boolean
  message: string | null
}) {
  const tb = useTranslations('TemplatesBackup')
  if (isChecking && !preview) {
    return (
      <div style={preflightCard('var(--gray-100)', 'var(--gray-300)')}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          {tb('checking')}
        </span>
      </div>
    )
  }
  if (!preview) return null

  const total =
    preview.missingDisciplines.length +
    preview.missingPhases.length +
    preview.missingEquipmentTypes.length

  if (total === 0) {
    return (
      <div style={preflightCard('var(--success-50)', 'var(--success-200)')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>✓</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--success-800)' }}>
              {tb('taxonomyOk')}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--success-700)' }}>
              {tb('taxonomyOkHelp')}
            </div>
          </div>
        </div>
        {message && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--success-800)' }}>{message}</div>}
      </div>
    )
  }

  return (
    <div style={preflightCard('var(--warning-100)', 'var(--warning-200)')}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--warning-800)', marginBottom: '6px' }}>
            {tb('missing', { n: total })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--warning-800)' }}>
            {preview.missingDisciplines.length > 0 && (
              <div><strong>{tb('disciplines')}</strong> {preview.missingDisciplines.join(', ')}</div>
            )}
            {preview.missingPhases.length > 0 && (
              <div><strong>{tb('phases')}</strong> {preview.missingPhases.join(', ')}</div>
            )}
            {preview.missingEquipmentTypes.length > 0 && (
              <div><strong>{tb('types')}</strong> {preview.missingEquipmentTypes.join(', ')}</div>
            )}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--warning-700)', marginTop: '8px' }}>
            {tb('missingHelp')}
          </div>
        </div>
        <button
          onClick={onAutoCreate}
          disabled={isCreating}
          style={{
            padding: '8px 14px',
            background: isCreating ? 'var(--warning-300)' : 'var(--warning-500)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: isCreating ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
          title={tb('autoCreateHint')}
        >
          {isCreating ? tb('creating') : tb('autoCreate')}
        </button>
      </div>
      {message && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: message.startsWith('Errores') ? 'var(--danger-700)' : 'var(--success-800)' }}>
          {message}
        </div>
      )}
    </div>
  )
}

function preflightCard(bg: string, border: string): React.CSSProperties {
  return {
    padding: '12px 14px',
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: '10px',
  }
}

function SummaryCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--text-strong)',
        marginTop: '4px',
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
      }}>
        {value}
      </div>
    </div>
  )
}

function ModuleSummary({
  title, color, entries, checked, onCheck,
}: {
  title: string
  color: string
  entries: Array<{ code: string; title: string; meta: string }>
  checked: boolean
  onCheck: (v: boolean) => void
}) {
  const tb = useTranslations('TemplatesBackup')
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 14px',
        background: alpha(color, 6),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={e => onCheck(e.target.checked)}
            disabled={entries.length === 0}
          />
          {title}
        </label>
        {entries.length > 0 && (
          <button
            onClick={() => setExpanded(s => !s)}
            style={{
              padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)',
              borderRadius: '6px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            {expanded ? tb('hide') : tb('showList')}
          </button>
        )}
      </div>
      {expanded && entries.length > 0 && (
        <div style={{ maxHeight: '240px', overflow: 'auto' }}>
          {entries.map((e, i) => (
            <div
              key={`${e.code}-${i}`}
              style={{
                padding: '8px 14px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                display: 'grid',
                gridTemplateColumns: '120px 1fr auto',
                gap: '10px',
                fontSize: '12px',
                alignItems: 'center',
              }}
            >
              <span style={{ fontFamily: 'monospace', color: 'var(--text-strong)', fontWeight: 600 }}>{e.code}</span>
              <span style={{ color: 'var(--text-strong)' }}>{e.title}</span>
              <span style={{ color: 'var(--text-muted)' }}>{e.meta}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ResultRow({
  label,
  r,
}: {
  label: string
  r: { created: number; skipped: number; errors: string[] }
}) {
  const tb = useTranslations('TemplatesBackup')
  return (
    <div style={{
      padding: '10px 14px',
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      fontSize: '13px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
        <strong style={{ color: 'var(--text-strong)' }}>{label}</strong>
        <span>
          <span style={{ color: 'var(--success-700)' }}>{tb('createdN', { n: r.created })}</span>
          {' · '}
          <span style={{ color: 'var(--text-muted)' }}>{tb('skippedN', { n: r.skipped })}</span>
          {r.errors.length > 0 && (
            <>
              {' · '}
              <span style={{ color: 'var(--danger-700)' }}>{tb('errorsN', { n: r.errors.length })}</span>
            </>
          )}
        </span>
      </div>
      {r.errors.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: '18px', color: 'var(--danger-700)', fontSize: '12px' }}>
          {r.errors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
          {r.errors.length > 10 && <li>{tb('more', { n: r.errors.length - 10 })}</li>}
        </ul>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: '14px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
}

const cardHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
}

const cardTitle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 700,
  color: 'var(--text-strong)',
  margin: 0,
}

const cardSubtitle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-muted)',
  margin: '4px 0 0',
}

function primaryButton(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 20px',
    background: disabled ? 'var(--primary-300)' : 'var(--primary-600)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

const codeStyle: React.CSSProperties = {
  background: 'var(--gray-50)',
  padding: '2px 6px',
  borderRadius: '4px',
  fontSize: '12px',
  fontFamily: 'ui-monospace, monospace',
  color: 'var(--text-strong)',
}

const errorBox: React.CSSProperties = {
  marginTop: '12px',
  padding: '10px 14px',
  background: 'var(--danger-100)',
  border: '1px solid var(--danger-200)',
  borderRadius: '8px',
  color: 'var(--danger-800)',
  fontSize: '13px',
}
