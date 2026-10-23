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
import { normalizeRequired, type SigningRole } from '@/lib/itr/signatures'
import { alpha, ink } from '@/lib/theme'

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
    required_signatures: normalizeRequired(template.required_signatures) as SigningRole[],
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
        required_signatures: form.required_signatures,
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
                  background: alpha(disc.color, 8), color: ink(disc.color),
                }}>
                  {disc.code} — {disc.name}
                </span>
              )}
              {phase && (
                <span style={{
                  padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                  background: alpha(phase.color, 9), color: ink(phase.color),
                }}>
                  {t('headerPhaseLabel', { code: phase.code })}
                </span>
              )}
              <span style={{
                padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                background: 'var(--primary-50)', color: 'var(--primary-700)',
                border: '1px solid var(--primary-200)',
              }}>
                v{template.version}
              </span>
              <span style={{
                padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                background: template.is_active ? '#10b98115' : '#94a3b815',
                color: template.is_active ? 'var(--success-700)' : 'var(--text-muted)',
                border: `1px solid ${template.is_active ? '#10b98130' : 'var(--border)'}`,
              }}>
                {template.is_active ? t('statusActive') : t('statusInactive')}
              </span>
            </div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 4px' }}>{template.title}</p>
            {template.description && (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>{template.description}</p>
            )}
            <p style={{ fontSize: '12px', color: 'var(--text-body)', margin: '8px 0 0' }}>
              <strong>{t('signaturesLabel')}</strong>{' '}
              {normalizeRequired(template.required_signatures).map(r => t(`signatureRole.${r}`)).join(' → ')}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '8px 0 0' }}>
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
                  background: isErr ? 'var(--danger-100)' : 'var(--success-50)', color: isErr ? 'var(--danger-700)' : 'var(--success-700)' }}>
                  {publishResult.slice(6)}
                </p>
              )
            })()}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <a
              href={`/admin/templates/${template.id}/preview`}
              style={{
                padding: '7px 14px', background: 'var(--violet-50)', border: '1px solid var(--violet-200)',
                borderRadius: '8px', fontSize: '12px', color: 'var(--violet-700)', cursor: 'pointer',
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
                    padding: '7px 14px', background: 'var(--success-50)', border: '1px solid var(--success-200)',
                    borderRadius: '8px', fontSize: '12px', color: 'var(--success-700)', cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {t('btnImportExcel')}
                </button>
                <button
                  onClick={onPreviewDoc}
                  disabled={busy}
                  style={{
                    padding: '7px 14px', background: 'var(--primary-50)', border: '1px solid var(--primary-200)',
                    borderRadius: '8px', fontSize: '12px', color: 'var(--primary-800)', cursor: busy ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                  title={t('viewDocHint')}
                >
                  {t('viewDoc')}
                </button>
                <button
                  onClick={onExportJson}
                  disabled={busy}
                  style={{
                    padding: '7px 14px', background: 'var(--warning-100)', border: '1px solid var(--warning-200)',
                    borderRadius: '8px', fontSize: '12px', color: 'var(--warning-700)', cursor: busy ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                  }}
                  title={t('exportJsonHint')}
                >
                  {t('exportJson')}
                </button>
                <button
                  onClick={onPublishClick}
                  disabled={busy}
                  style={{
                    padding: '7px 14px', background: 'var(--solid-primary-800)', border: 'none',
                    borderRadius: '8px', fontSize: '12px', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer',
                    fontWeight: 600, opacity: busy ? 0.7 : 1,
                  }}
                >
                  {template.is_active ? t('btnCreateRevision') : t('btnActivateRevision')}
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
              {t('fieldCode')} <span style={{ color: 'var(--danger-700)' }}>*</span>
              <input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                style={{ ...fieldInput, fontFamily: 'monospace', fontWeight: 700 }}
                maxLength={20}
              />
            </label>
            <label style={fieldLabel}>
              {t('fieldTitle')} <span style={{ color: 'var(--danger-700)' }}>*</span>
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
              style={{ accentColor: 'var(--success-500)', width: '14px', height: '14px' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text-body)' }}>{t('flagActiveLabel')}</span>
          </label>
          {/* S04 (D4): firmas requeridas del ITR. El ejecutor siempre firma; la fase puede sumar al cliente. */}
          <fieldset style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', margin: '0 0 16px' }}>
            <legend style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-body)', padding: '0 4px' }}>{t('signaturesLabel')}</legend>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {(['executor', 'supervisor', 'client'] as const).map(role => (
                <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-body)', cursor: role === 'executor' ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.required_signatures.includes(role)}
                    disabled={role === 'executor'}
                    onChange={e => setForm(f => ({ ...f, required_signatures: normalizeRequired(e.target.checked ? [...f.required_signatures, role] : f.required_signatures.filter(r => r !== role)) }))}
                    style={{ accentColor: 'var(--violet-600)', width: '14px', height: '14px' }}
                  />
                  {t(`signatureRole.${role}`)}
                </label>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0' }}>{t('signaturesHint')}</p>
          </fieldset>
          {error && (
            <p style={{ fontSize: '12px', color: 'var(--danger-700)', margin: '0 0 12px', padding: '8px 12px', background: 'var(--danger-100)', borderRadius: '6px' }}>
              {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={saveHeader}
              disabled={isPending}
              style={{ padding: '8px 18px', background: 'var(--primary-600)', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}
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
