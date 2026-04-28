'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createTemplate, deleteTemplate } from '@/app/actions/itr-templates'
import BulkImportCatalogModal from './BulkImportCatalogModal'

interface Discipline { id: string; code: string; name: string; color: string }
interface Phase { id: string; code: string; name: string; color: string; order_index: number }
interface Template {
  id: string
  code: string
  title: string
  version: number
  is_active: boolean
  is_global: boolean
  created_at: string
  disciplines: Discipline | null
  project_phases: Phase | null
  itr_template_sections: Array<{ id: string; itr_template_items: Array<{ id: string }> }>
}

interface Props {
  templates: Template[]
  disciplines: Discipline[]
  phases: Phase[]
  canEdit: boolean
}

const DEFAULT_FORM = { code: '', title: '', phase_id: '', discipline_id: '', description: '' }

export default function ItrTemplatesView({ templates, disciplines, phases, canEdit }: Props) {
  const router = useRouter()
  const t = useTranslations('ItrTemplates')
  const [isPending, startTransition] = useTransition()
  const [activeDisc, setActiveDisc] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Compute item count per template
  function itemCount(tmpl: Template) {
    return tmpl.itr_template_sections.reduce((sum, s) => sum + s.itr_template_items.length, 0)
  }

  // Filter by discipline
  const filtered = activeDisc === 'all'
    ? templates
    : templates.filter(tmpl => tmpl.disciplines?.code === activeDisc)

  // Unique disciplines present in templates (for filter tabs)
  const discCodesInTemplates = [...new Set(templates.map(tmpl => tmpl.disciplines?.code).filter(Boolean))]
  const discTabs = disciplines.filter(d => discCodesInTemplates.includes(d.code))

  async function handleCreate() {
    if (!form.code.trim() || !form.title.trim() || !form.phase_id || !form.discipline_id) {
      setFormError(t('modal.errorRequired'))
      return
    }
    setFormError(null)
    startTransition(async () => {
      const res = await createTemplate({
        code: form.code.trim().toUpperCase(),
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        phase_id: form.phase_id,
        discipline_id: form.discipline_id,
      })
      if (res.error) { setFormError(res.error); return }
      setShowModal(false)
      setForm(DEFAULT_FORM)
      router.push(`/admin/templates/${res.id}`)
    })
  }

  async function handleDelete(id: string, code: string) {
    if (!confirm(t('deleteConfirm', { code }))) return
    setDeletingId(id)
    startTransition(async () => {
      await deleteTemplate(id)
      setDeletingId(null)
      router.refresh()
    })
  }

  return (
    <div>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '16px' }}>
        {/* Discipline filter tabs */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveDisc('all')}
            style={{
              padding: '6px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 500,
              border: '1px solid', cursor: 'pointer',
              background: activeDisc === 'all' ? 'var(--gray-900)' : 'var(--card-bg)',
              color: activeDisc === 'all' ? '#fff' : 'var(--text-strong)',
              borderColor: activeDisc === 'all' ? 'var(--gray-900)' : 'var(--border)',
            }}
          >
            {t('allCount', { count: templates.length })}
          </button>
          {discTabs.map(d => {
            const count = templates.filter(tmpl => tmpl.disciplines?.code === d.code).length
            const isActive = activeDisc === d.code
            return (
              <button
                key={d.code}
                onClick={() => setActiveDisc(d.code)}
                style={{
                  padding: '6px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 500,
                  border: '1px solid', cursor: 'pointer',
                  background: isActive ? d.color : `${d.color}12`,
                  color: isActive ? 'white' : d.color,
                  borderColor: `${d.color}40`,
                }}
              >
                {d.code} ({count})
              </button>
            )
          })}
        </div>

        {canEdit && (
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={() => setShowBulkImport(true)}
              style={{
                padding: '9px 18px', background: '#f0fdf4', color: '#16a34a',
                borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                border: '1px solid #bbf7d0', cursor: 'pointer',
              }}
            >
              {t('importCatalog')}
            </button>
            <button
              onClick={() => setShowModal(true)}
              style={{
                padding: '9px 18px', background: '#3b82f6', color: 'white',
                borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                border: 'none', cursor: 'pointer',
              }}
            >
              {t('newTemplate')}
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)',
          padding: '64px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>▤</div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-strong)', margin: '0 0 6px' }}>
            {activeDisc === 'all' ? t('empty.noTemplates') : t('empty.noTemplatesForDisc', { disc: activeDisc })}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
            {t('empty.hint')}
          </p>
          {canEdit && activeDisc === 'all' && (
            <button
              onClick={() => setShowModal(true)}
              style={{
                padding: '10px 22px', background: '#3b82f6', color: 'white',
                borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer',
              }}
            >
              {t('empty.createFirstBtn')}
            </button>
          )}
        </div>
      )}

      {/* Template table */}
      {filtered.length > 0 && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr 110px 80px 60px 80px 90px',
            padding: '10px 20px', borderBottom: '1px solid var(--border)',
            fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            <span>{t('table.colCode')}</span>
            <span>{t('table.colTitle')}</span>
            <span>{t('table.colDiscipline')}</span>
            <span>{t('table.colPhase')}</span>
            <span>{t('table.colItems')}</span>
            <span>{t('table.colVersion')}</span>
            <span>{t('table.colStatus')}</span>
          </div>

          {filtered.map((tmpl, i) => {
            const disc = tmpl.disciplines
            const phase = tmpl.project_phases
            const items = itemCount(tmpl)
            const isDeleting = deletingId === tmpl.id

            return (
              <div
                key={tmpl.id}
                onClick={() => !isDeleting && router.push(`/admin/templates/${tmpl.id}`)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr 110px 80px 60px 80px 90px',
                  padding: '14px 20px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', transition: 'background 0.1s', alignItems: 'center',
                  opacity: isDeleting ? 0.4 : 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Code */}
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'monospace' }}>
                  {tmpl.code}
                </span>

                {/* Title */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-strong)' }}>{tmpl.title}</div>
                  {tmpl.is_global && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('global')}</span>
                  )}
                </div>

                {/* Discipline */}
                {disc ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                    background: `${disc.color}15`, color: disc.color, width: 'fit-content',
                  }}>
                    {disc.code}
                  </span>
                ) : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>}

                {/* Phase */}
                {phase ? (
                  <span style={{
                    padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                    background: `${phase.color}18`, color: phase.color, width: 'fit-content',
                  }}>
                    {phase.code}
                  </span>
                ) : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>}

                {/* Item count */}
                <span style={{ fontSize: '13px', color: items > 0 ? 'var(--text-strong)' : 'var(--text-muted)', fontWeight: items > 0 ? 500 : 400 }}>
                  {items}
                </span>

                {/* Version */}
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>v{tmpl.version}</span>

                {/* Status + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={e => e.stopPropagation()}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 600,
                    background: tmpl.is_active ? '#10b98115' : '#94a3b815',
                    color: tmpl.is_active ? '#10b981' : '#94a3b8',
                    border: `1px solid ${tmpl.is_active ? '#10b98130' : 'var(--border)'}`,
                  }}>
                    {tmpl.is_active ? t('status.active') : t('status.inactive')}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => handleDelete(tmpl.id, tmpl.code)}
                      disabled={isPending}
                      style={{
                        width: '28px', height: '28px', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', borderRadius: '6px', border: 'none',
                        background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'; (e.currentTarget as HTMLElement).style.color = 'var(--danger-500)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create template modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px',
        }}
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setForm(DEFAULT_FORM); setFormError(null) } }}
        >
          <div style={{
            background: 'var(--card-bg)', borderRadius: '16px', padding: '28px',
            width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 6px' }}>
              {t('modal.title')}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px' }}>
              {t('modal.subtitle')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Phase + Discipline row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={labelStyle}>
                  {t('modal.labelPhase')} <span style={{ color: '#ef4444' }}>*</span>
                  <select
                    value={form.phase_id}
                    onChange={e => setForm(f => ({ ...f, phase_id: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">{t('modal.selectPlaceholder')}</option>
                    {phases.sort((a, b) => a.order_index - b.order_index).map(p => (
                      <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  {t('modal.labelDiscipline')} <span style={{ color: '#ef4444' }}>*</span>
                  <select
                    value={form.discipline_id}
                    onChange={e => setForm(f => ({ ...f, discipline_id: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">{t('modal.selectPlaceholder')}</option>
                    {disciplines.map(d => (
                      <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Code */}
              <label style={labelStyle}>
                {t('modal.labelCode')} <span style={{ color: '#ef4444' }}>*</span>
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder={t('modal.codePlaceholder')}
                  maxLength={20}
                  style={inputStyle}
                />
              </label>

              {/* Title */}
              <label style={labelStyle}>
                {t('modal.labelTitle')} <span style={{ color: '#ef4444' }}>*</span>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={t('modal.titlePlaceholder')}
                  style={inputStyle}
                />
              </label>

              {/* Description (optional) */}
              <label style={labelStyle}>
                {t('modal.labelDesc')} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{t('modal.descOptional')}</span>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder={t('modal.descPlaceholder')}
                  style={inputStyle}
                />
              </label>
            </div>

            {formError && (
              <p style={{ fontSize: '13px', color: '#ef4444', margin: '16px 0 0', padding: '10px 14px', background: '#fee2e2', borderRadius: '8px' }}>
                {formError}
              </p>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowModal(false); setForm(DEFAULT_FORM); setFormError(null) }}
                style={{
                  padding: '9px 18px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                  borderRadius: '8px', fontSize: '13px', color: 'var(--text-strong)', cursor: 'pointer',
                }}
              >
                {t('modal.cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={isPending}
                style={{
                  padding: '9px 20px', background: isPending ? '#93c5fd' : '#3b82f6', color: 'white',
                  borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {isPending ? t('modal.creating') : t('modal.createBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk catalog import modal */}
      {showBulkImport && (
        <BulkImportCatalogModal
          disciplines={disciplines}
          phases={phases}
          onClose={() => setShowBulkImport(false)}
          onSuccess={() => { setShowBulkImport(false); router.refresh() }}
        />
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '6px',
  fontSize: '12px', fontWeight: 600, color: 'var(--text-strong)',
}

const inputStyle: React.CSSProperties = {
  padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', color: 'var(--text-strong)', background: 'var(--card-bg)', outline: 'none',
  fontFamily: 'inherit',
}
