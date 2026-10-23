'use client'

import { useId, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { createPssrTemplate, seedDefaultPssrTemplate, deletePssrTemplate } from '@/app/actions/pssr'
import { exportPssrTemplate } from '@/app/actions/templates-backup'
import type { TemplatesBackup } from '@/lib/constants/templates-backup'
import BackupDocumentView from '@/components/templates/BackupDocumentView'
import ImportPssrFromOrgModal from './ImportPssrFromOrgModal'
import { DialogSurface } from '@/components/ui/dialog-a11y'

interface Template {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  pssr_template_items: Array<{ id: string }>
}

export default function PssrTemplatesView({ templates, canEdit }: { templates: Template[]; canEdit: boolean }) {
  // `tx` (no `t`): las plantillas se recorren como `t`.
  const tx = useTranslations('PssrTemplates')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)
  const titleId = useId()
  const uid = useId()
  const [showImportFromOrg, setShowImportFromOrg] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [seedingId, setSeedingId] = useState<string | null>(null)
  const [docPreview, setDocPreview] = useState<TemplatesBackup | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  async function handleCreate() {
    if (!form.name.trim()) { setFormError(tx('nameRequired')); return }
    setFormError(null)
    startTransition(async () => {
      const res = await createPssrTemplate({ name: form.name, description: form.description || undefined })
      if (res.error ?? !res.template) {
        setFormError(res.error ?? tx('createError'))
        return
      }
      setShowModal(false)
      setForm({ name: '', description: '' })
      router.push(`/admin/templates/pssr/${res.template.id}`)
    })
  }

  async function handleSeedDefault(templateId: string) {
    setSeedingId(templateId)
    const res = await seedDefaultPssrTemplate(templateId)
    setSeedingId(null)
    if (res.error) { setPreviewError(res.error); return }
    router.refresh()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      const res = await deletePssrTemplate(id)
      setDeletingId(null)
      if (res.error) { setPreviewError(res.error); return }
      router.refresh()
    })
  }

  const card: React.CSSProperties = {
    background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)',
    padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  }

  return (
    <>
      {/* Empty state with seed button */}
      {templates.length === 0 && (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '16px', border: '1.5px dashed var(--border)',
          padding: '48px', textAlign: 'center',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
            <ShieldCheck size={32} color='var(--warning-700)' aria-hidden="true" />
          </div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 6px' }}>
            {tx('emptyTitle')}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
            {tx('emptyHelp')}
          </p>
          {canEdit && (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowImportFromOrg(true)}
                style={{
                  padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  background: 'var(--card-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer',
                }}
              >
                {tx('importFromOrg')}
              </button>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: 'var(--primary-600)', color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >
                {tx('new')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Template list */}
      {templates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px', gap: '8px' }}>
              <button
                onClick={() => setShowImportFromOrg(true)}
                style={{
                  padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                  background: 'var(--card-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer',
                }}
              >
                {tx('importFromOrg')}
              </button>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  background: 'var(--primary-600)', color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >
                {tx('new')}
              </button>
            </div>
          )}
          {templates.map(t => (
            <div key={t.id} style={card}>
              {/* Icon */}
              <div style={{
                width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
                background: 'var(--warning-50)', border: '1px solid var(--warning-500)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ShieldCheck size={20} color="var(--warning-700)" aria-hidden="true" />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-strong)' }}>{t.name}</div>
                {t.description && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{t.description}</div>
                )}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {tx('items', { n: t.pssr_template_items.length })}
                </div>
              </div>

              {/* Status chip */}
              <span style={{
                padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                background: t.is_active ? 'rgba(16,185,129,0.12)' : 'var(--gray-100)',
                color: t.is_active ? 'var(--success-700)' : 'var(--text-muted)',
              }}>
                {t.is_active ? tx('active') : tx('inactive')}
              </span>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  onClick={() => {
                    startTransition(async () => {
                      const res = await exportPssrTemplate(t.id)
                      if (res.error || !res.backup) { setPreviewError(res.error ?? tx('previewError')); return }
                      setDocPreview(res.backup)
                    })
                  }}
                  disabled={isPending}
                  title={tx('previewHint')}
                  style={{
                    padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                    background: 'var(--primary-50)', border: '1px solid var(--primary-200)', color: 'var(--primary-800)',
                    cursor: 'pointer',
                  }}
                >
                  {tx('preview')}
                </button>
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {t.pssr_template_items.length === 0 && (
                    <button
                      onClick={() => handleSeedDefault(t.id)}
                      disabled={seedingId === t.id}
                      style={{
                        padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                        background: 'var(--warning-50)', border: '1px solid var(--warning-200)', color: 'var(--warning-800)',
                        cursor: 'pointer',
                      }}
                    >
                      {seedingId === t.id ? tx('seeding') : tx('seed')}
                    </button>
                  )}
                  <button
                    onClick={() => router.push(`/admin/templates/pssr/${t.id}`)}
                    style={{
                      padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                      background: 'var(--gray-50)', border: '1px solid var(--border)', color: 'var(--text-strong)',
                      cursor: 'pointer',
                    }}
                  >
                    {tx('edit')}
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id || isPending}
                    style={{
                      padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                      background: 'var(--danger-50)', border: '1px solid var(--danger-200)', color: 'var(--danger-700)',
                      cursor: 'pointer',
                    }}
                  >
                    {deletingId === t.id ? '…' : tx('delete')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showImportFromOrg && (
        <ImportPssrFromOrgModal onClose={() => setShowImportFromOrg(false)} />
      )}

      {previewError && (
        <div style={{ marginTop: '12px', background: 'var(--danger-50)', border: '1px solid var(--danger-200)', color: 'var(--danger-700)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}>
          {previewError}
          <button onClick={() => setPreviewError(null)} style={{ marginLeft: '12px', background: 'none', border: 'none', color: 'var(--danger-700)', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {docPreview && (
        <BackupDocumentView backup={docPreview} onClose={() => setDocPreview(null)} />
      )}

      {/* Create modal */}
      {showModal && (
        <div role="presentation" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <DialogSurface onClose={() => setShowModal(false)} labelledBy={titleId} style={{
            background: 'var(--card-bg)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '440px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 id={titleId} style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 20px' }}>
              {tx('newTitle')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label htmlFor={`${uid}-name`} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', display: 'block', marginBottom: '6px' }}>
                  {tx('name')}
                </label>
                <input id={`${uid}-name`}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={tx('namePlaceholder')}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1.5px solid var(--border)', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-description`} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', display: 'block', marginBottom: '6px' }}>
                  {tx('description')}
                </label>
                <textarea id={`${uid}-description`}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder={tx('descriptionPlaceholder')}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1.5px solid var(--border)', fontSize: '14px', outline: 'none',
                    resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
              </div>
              {formError && (
                <p style={{ color: 'var(--danger-700)', fontSize: '13px', margin: 0 }}>{formError}</p>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: 'var(--gray-100)', border: 'none', cursor: 'pointer', color: 'var(--text-strong)',
                  }}
                >
                  {tx('cancel')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isPending}
                  style={{
                    padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                    background: 'var(--gray-900)', color: '#fff', border: 'none',
                    cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
                  }}
                >
                  {isPending ? tx('creating') : tx('create')}
                </button>
              </div>
            </div>
          </DialogSurface>
        </div>
      )}
    </>
  )
}