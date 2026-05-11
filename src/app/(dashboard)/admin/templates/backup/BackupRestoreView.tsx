'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  exportAllTemplates,
  restoreTemplatesBackup,
  previewRestoreTaxonomy,
  createMissingTaxonomy,
} from '@/app/actions/templates-backup'
import type { TemplatesBackup, RestoreResult, TaxonomyPreview } from '@/lib/constants/templates-backup'
import BackupDocumentView from '@/components/templates/BackupDocumentView'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [taxonomyPreview, setTaxonomyPreview] = useState<TaxonomyPreview | null>(null)
  const [isCheckingTaxonomy, startTaxonomyCheck] = useTransition()
  const [isCreatingTaxonomy, startCreateTaxonomy] = useTransition()
  const [taxonomyMsg, setTaxonomyMsg] = useState<string | null>(null)

  function handleExportAll() {
    setExportError(null)
    startExport(async () => {
      const res = await exportAllTemplates()
      if (res.error || !res.backup) {
        setExportError(res.error ?? 'Error al exportar')
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
        setParseError('Este archivo no es un backup de CommUp Templates (campo "format" inválido)')
        setParsed(null)
        return
      }
      if (typeof obj.version !== 'number') {
        setParseError('Backup sin versión')
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
      setParseError(`JSON inválido: ${e instanceof Error ? e.message : 'parse error'}`)
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
      if (res.errors.length > 0) {
        setTaxonomyMsg(`Errores: ${res.errors.join(' · ')}`)
      } else {
        setTaxonomyMsg(
          `Creadas: ${res.created.disciplines} disciplinas · ${res.created.phases} fases · ${res.created.equipmentTypes} tipos de equipo`
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
        setParseError(res.error ?? 'Error al restaurar')
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
            <h2 style={cardTitle}>Exportar todo</h2>
            <p style={cardSubtitle}>
              Descarga un único JSON con todos tus templates ITR, procedimientos de preservación y templates PSSR de la org activa.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleExportAll}
            disabled={isExporting}
            style={primaryButton(isExporting)}
          >
            {isExporting ? 'Exportando…' : 'Descargar backup completo'}
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
            <h2 style={cardTitle}>Restaurar desde JSON</h2>
            <p style={cardSubtitle}>
              Sube un backup. Verás un resumen del contenido antes de confirmar la restauración.
            </p>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
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
            {filename ? `Archivo cargado: ${filename}` : 'Arrastra el JSON o haz clic para seleccionar'}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
            Solo archivos generados por CommUp (formato &quot;commup.templates.backup&quot;)
          </p>
          <input
            ref={fileInputRef}
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
              <SummaryCell label="Formato" value={`v${parsed.version}`} mono />
              <SummaryCell
                label="Org origen"
                value={parsed.org?.name ?? '—'}
              />
              <SummaryCell
                label="Exportado"
                value={parsed.exported_at ? new Date(parsed.exported_at).toLocaleString('es-ES') : '—'}
              />
              <SummaryCell
                label="Total"
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
              color="#3b82f6"
              entries={parsed.itr_templates.map(t => ({
                code: t.code,
                title: t.title,
                meta: `${t.discipline_code ?? '—'} · ${t.phase_code ?? '—'} · ${t.sections.reduce((a, s) => a + s.items.length, 0)} ítems`,
              }))}
              checked={includeItr}
              onCheck={setIncludeItr}
            />
            <ModuleSummary
              title={`Preservación (${parsed.preservation_procedures.length})`}
              color="#10b981"
              entries={parsed.preservation_procedures.map(p => ({
                code: p.code,
                title: p.title,
                meta: `${p.frequency} · ${p.interval_days}d · ${p.items.length} ítems`,
              }))}
              checked={includePreservation}
              onCheck={setIncludePreservation}
            />
            <ModuleSummary
              title={`PSSR (${parsed.pssr_templates.length})`}
              color="#8b5cf6"
              entries={parsed.pssr_templates.map(t => ({
                code: t.name,
                title: t.description ?? '',
                meta: `${t.items.length} ítems`,
              }))}
              checked={includePssr}
              onCheck={setIncludePssr}
            />

            {/* Raw JSON toggle + Document view */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowDoc(true)}
                style={{
                  padding: '6px 12px', background: '#eff6ff', border: '1px solid #bfdbfe',
                  borderRadius: '6px', fontSize: '12px', color: '#1e40af', cursor: 'pointer',
                  fontWeight: 600,
                }}
                title="Renderiza el backup como documento imprimible"
              >
                Ver como documento
              </button>
              <button
                onClick={() => setShowRaw(s => !s)}
                style={{
                  padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: '6px', fontSize: '12px', color: 'var(--text-strong)', cursor: 'pointer',
                }}
              >
                {showRaw ? 'Ocultar JSON crudo' : 'Ver JSON crudo'}
              </button>
              {showRaw && (
                <pre style={{
                  marginTop: '12px',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  padding: '16px',
                  borderRadius: '8px',
                  fontSize: '11px',
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
                Opciones de restauración
              </h3>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-strong)' }}>
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={e => setSkipDuplicates(e.target.checked)}
                />
                Omitir si ya existe un template con el mismo código/nombre (recomendado)
              </label>

              {!skipDuplicates && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-strong)' }}>
                  Sufijo para duplicados:
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
                background: '#fef3c7',
                borderRadius: '6px',
                border: '1px solid #fde68a',
              }}>
                ⚠ Las disciplinas, fases y tipos de equipo se mapean por <strong>código</strong> en la org activa. Si falta alguno, ese template se omite con error.
              </p>
            </div>

            <div>
              <button
                onClick={handleRestore}
                disabled={isRestoring || (!includeItr && !includePreservation && !includePssr)}
                style={primaryButton(isRestoring || (!includeItr && !includePreservation && !includePssr))}
              >
                {isRestoring ? 'Restaurando…' : 'Restaurar a la org activa'}
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
              Resultado
            </h3>
            <ResultRow label="ITR" r={restoreResult.itr} />
            <ResultRow label="Preservación" r={restoreResult.preservation} />
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
  if (isChecking && !preview) {
    return (
      <div style={preflightCard('#f3f4f6', '#d1d5db')}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Verificando taxonomía requerida en la org activa…
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
      <div style={preflightCard('#ecfdf5', '#a7f3d0')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>✓</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#065f46' }}>
              Taxonomía completa
            </div>
            <div style={{ fontSize: '12px', color: '#047857' }}>
              Todas las disciplinas, fases y tipos de equipo del backup existen en la org activa.
            </div>
          </div>
        </div>
        {message && <div style={{ marginTop: '8px', fontSize: '12px', color: '#065f46' }}>{message}</div>}
      </div>
    )
  }

  return (
    <div style={preflightCard('#fef3c7', '#fde68a')}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
            ⚠ Faltan {total} elemento{total === 1 ? '' : 's'} de taxonomía en la org activa
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#92400e' }}>
            {preview.missingDisciplines.length > 0 && (
              <div><strong>Disciplinas:</strong> {preview.missingDisciplines.join(', ')}</div>
            )}
            {preview.missingPhases.length > 0 && (
              <div><strong>Fases:</strong> {preview.missingPhases.join(', ')}</div>
            )}
            {preview.missingEquipmentTypes.length > 0 && (
              <div><strong>Tipos de equipo:</strong> {preview.missingEquipmentTypes.join(', ')}</div>
            )}
          </div>
          <div style={{ fontSize: '11px', color: '#a16207', marginTop: '8px' }}>
            Los templates que las referencian se omitirán al restaurar a menos que las crees primero.
          </div>
        </div>
        <button
          onClick={onAutoCreate}
          disabled={isCreating}
          style={{
            padding: '8px 14px',
            background: isCreating ? '#fcd34d' : '#f59e0b',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: isCreating ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
          title="Crear los elementos faltantes con valores por defecto (editables después)"
        >
          {isCreating ? 'Creando…' : 'Crear automáticamente'}
        </button>
      </div>
      {message && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: message.startsWith('Errores') ? '#dc2626' : '#065f46' }}>
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
      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>
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
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 14px',
        background: `${color}10`,
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
              borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            {expanded ? 'Ocultar' : 'Ver lista'}
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
          <span style={{ color: '#10b981' }}>+{r.created} creados</span>
          {' · '}
          <span style={{ color: 'var(--text-muted)' }}>{r.skipped} omitidos</span>
          {r.errors.length > 0 && (
            <>
              {' · '}
              <span style={{ color: '#ef4444' }}>{r.errors.length} errores</span>
            </>
          )}
        </span>
      </div>
      {r.errors.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: '18px', color: '#ef4444', fontSize: '12px' }}>
          {r.errors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
          {r.errors.length > 10 && <li>… y {r.errors.length - 10} más</li>}
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
    background: disabled ? '#93c5fd' : '#3b82f6',
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
  fontSize: '11px',
  fontFamily: 'ui-monospace, monospace',
  color: 'var(--text-strong)',
}

const errorBox: React.CSSProperties = {
  marginTop: '12px',
  padding: '10px 14px',
  background: '#fee2e2',
  border: '1px solid #fecaca',
  borderRadius: '8px',
  color: '#991b1b',
  fontSize: '13px',
}
