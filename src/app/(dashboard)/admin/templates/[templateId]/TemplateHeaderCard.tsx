'use client'

// Header del builder: vista de metadatos + edición de código/título/
// descripción/activo (Q3, extraído de TemplateBuilder.tsx). El estado del
// formulario de header es local; las acciones globales (import, preview,
// export, publish) suben por callbacks.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateTemplateHeader } from '@/app/actions/itr-templates'
import { fieldInput, fieldLabel, type TemplateData } from './template-builder-shared'

export default function TemplateHeaderCard({
  template,
  canEdit,
  totalItems,
  sectionsCount,
  busy,
  publishResult,
  onImportClick,
  onPreviewDoc,
  onExportJson,
  onPublishClick,
}: {
  template: TemplateData
  canEdit: boolean
  totalItems: number
  sectionsCount: number
  /** Pendiente global del builder (export/preview en curso). */
  busy: boolean
  /** Resultado del publish: "ok:msg" | "error:msg" | null. */
  publishResult: string | null
  onImportClick: () => void
  onPreviewDoc: () => void
  onExportJson: () => void
  onPublishClick: () => void
}) {
  const router = useRouter()
  const t = useTranslations('ItrTemplates.builder')
  const [isPending, startTransition] = useTransition()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    code: template.code,
    title: template.title,
    description: template.description ?? '',
    is_active: template.is_active,
  })
  const [error, setError] = useState<string | null>(null)

  function saveHeader() {
    if (!form.code.trim() || !form.title.trim()) {
      setError(t('errCodeTitleRequired'))
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await updateTemplateHeader(template.id, {
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        is_active: form.is_active,
      })
      if (res.error) { setError(res.error); return }
      setEditing(false)
      router.refresh()
    })
  }

  const disc = template.disciplines
  const phase = template.project_phases

  return (
    <div style={{
      background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
      padding: '22px 24px', marginBottom: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '22px', fontWeight: 800, color: 'var(--text-strong)',
                fontFamily: 'monospace', letterSpacing: '-0.5px',
              }}>
                {template.code}
              </span>
              {disc && (
                <span style={{
                  padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                  background: `${disc.color}15`, color: disc.color,
                }}>
                  {disc.code} — {disc.name}
                </span>
              )}
              {phase && (
                <span style={{
                  padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  background: `${phase.color}18`, color: phase.color,
                }}>
                  {t('headerPhaseLabel', { code: phase.code })}
                </span>
              )}
              <span style={{
                padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                background: '#eff6ff', color: '#3b82f6',
                border: '1px solid #bfdbfe',
              }}>
                v{template.version}
              </span>
              <span style={{
                padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                background: template.is_active ? '#10b98115' : '#94a3b815',
                color: template.is_active ? '#10b981' : 'var(--gray-400)',
                border: `1px solid ${template.is_active ? '#10b98130' : 'var(--border)'}`,
              }}>
                {template.is_active ? t('statusActive') : t('statusInactive')}
              </span>
            </div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: '0 0 4px' }}>{template.title}</p>
            {template.description && (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{template.description}</p>
            )}
            <p style={{ fontSize: '12px', color: 'var(--gray-400)', margin: '8px 0 0' }}>
              {t('versionMeta', {
                version: template.version,
                items: totalItems,
                itemsPlural: totalItems !== 1 ? 's' : '',
                sections: sectionsCount,
                sectionsPlural: sectionsCount !== 1 ? 'es' : '',
              })}
            </p>
            {publishResult && (() => {
              const isErr = publishResult.startsWith('error:')
              return (
                <p style={{ fontSize: '12px', margin: '8px 0 0', padding: '6px 10px', borderRadius: '5px',
                  background: isErr ? '#fee2e2' : '#ecfdf5', color: isErr ? '#dc2626' : '#16a34a' }}>
                  {publishResult.slice(6)}
                </p>
              )
            })()}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <a
              href={`/admin/templates/${template.id}/preview`}
              style={{
                padding: '7px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe',
                borderRadius: '8px', fontSize: '12px', color: '#7c3aed', cursor: 'pointer',
                fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px',
              }}
            >
              {t('btnFieldView')}
            </a>
            {canEdit && (
              <>
                <button
                  onClick={onImportClick}
                  style={{
                    padding: '7px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0',
                    borderRadius: '8px', fontSize: '12px', color: '#16a34a', cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {t('btnImportExcel')}
                </button>
                <button
                  onClick={onPreviewDoc}
                  disabled={busy}
                  style={{
                    padding: '7px 14px', background: '#eff6ff', border: '1px solid #bfdbfe',
                    borderRadius: '8px', fontSize: '12px', color: '#1e40af', cursor: busy ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                  title="Renderiza el template como documento imprimible"
                >
                  Ver como documento
                </button>
                <button
                  onClick={onExportJson}
                  disabled={busy}
                  style={{
                    padding: '7px 14px', background: '#fef3c7', border: '1px solid #fde68a',
                    borderRadius: '8px', fontSize: '12px', color: '#a16207', cursor: busy ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                  }}
                  title="Descargar este template como JSON (backup individual)"
                >
                  Exportar JSON
                </button>
                <button
                  onClick={onPublishClick}
                  disabled={busy}
                  style={{
                    padding: '7px 14px', background: '#1e40af', border: 'none',
                    borderRadius: '8px', fontSize: '12px', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer',
                    fontWeight: 600, opacity: busy ? 0.7 : 1,
                  }}
                >
                  {t('btnPublishVersion')}
                </button>
                <button
                  onClick={() => setEditing(true)}
                  style={{
                    padding: '7px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                    borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer',
                  }}
                >
                  {t('btnEditHeader')}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 16px' }}>
            {t('headerEditTitle')}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px', marginBottom: '12px' }}>
            <label style={fieldLabel}>
              {t('fieldCode')} <span style={{ color: '#ef4444' }}>*</span>
              <input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                style={{ ...fieldInput, fontFamily: 'monospace', fontWeight: 700 }}
                maxLength={20}
              />
            </label>
            <label style={fieldLabel}>
              {t('fieldTitle')} <span style={{ color: '#ef4444' }}>*</span>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                style={fieldInput}
              />
            </label>
          </div>
          <label style={{ ...fieldLabel, marginBottom: '12px' }}>
            {t('fieldDescription')}
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder={t('placeholderDescription')}
              style={fieldInput}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '16px' }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              style={{ accentColor: '#10b981', width: '14px', height: '14px' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--gray-700)' }}>{t('flagActiveLabel')}</span>
          </label>
          {error && (
            <p style={{ fontSize: '12px', color: '#ef4444', margin: '0 0 12px', padding: '8px 12px', background: '#fee2e2', borderRadius: '6px' }}>
              {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={saveHeader}
              disabled={isPending}
              style={{ padding: '8px 18px', background: '#3b82f6', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}
            >
              {isPending ? t('btnSaving') : t('btnSave')}
            </button>
            <button
              onClick={() => { setEditing(false); setError(null) }}
              style={{ padding: '8px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              {t('btnCancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
