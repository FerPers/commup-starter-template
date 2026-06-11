'use client'

// Builder de templates ITR — orquestador (Q3). Estado de secciones/ítems +
// operaciones de servidor; la UI vive en TemplateHeaderCard,
// TemplateSectionCard, TemplateItemForm y TemplatePublishModal.

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  publishTemplateVersion,
  createSection, updateSection, deleteSection, reorderSections,
  createItem, updateItem, deleteItem, reorderItems,
  type ItemPayload,
} from '@/app/actions/itr-templates'
import { exportItrTemplate } from '@/app/actions/templates-backup'
import type { TemplatesBackup } from '@/lib/constants/templates-backup'
import ImportItemsModal from './ImportItemsModal'
import BackupDocumentView from '@/components/templates/BackupDocumentView'
import TemplateHeaderCard from './TemplateHeaderCard'
import TemplateSectionCard from './TemplateSectionCard'
import TemplatePublishModal from './TemplatePublishModal'
import {
  buildSections,
  dateStamp,
  downloadJsonFile,
  fieldInput,
  type BuilderItem,
  type BuilderSection,
  type Discipline,
  type ItemFormValues,
  type Phase,
  type TemplateData,
} from './template-builder-shared'

interface Props {
  template: TemplateData
  disciplines: Discipline[]
  phases: Phase[]
  canEdit: boolean
}

export default function TemplateBuilder({ template, canEdit }: Props) {
  const router = useRouter()
  const t = useTranslations('ItrTemplates.builder')
  const [isPending, startTransition] = useTransition()

  // ── Template data state
  const [sections, setSections] = useState<BuilderSection[]>(() => buildSections(template.itr_template_sections))

  // Sync state when server props refresh (after import)
  useEffect(() => {
    setSections(buildSections(template.itr_template_sections))
  }, [template])

  // ── Import modal state
  const [showImport, setShowImport] = useState(false)
  const [docPreview, setDocPreview] = useState<TemplatesBackup | null>(null)

  // ── Publish version state
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [publishResult, setPublishResult] = useState<string | null>(null)

  // ── Add-section state
  const [showAddSection, setShowAddSection] = useState(false)
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  // ── Publish version ───────────────────────────────────────────

  function handlePublishVersion() {
    setPublishResult(null)
    startTransition(async () => {
      const res = await publishTemplateVersion(template.id)
      if (res.error) { setPublishResult(`error:${res.error}`); return }
      setShowPublishConfirm(false)
      if (res.bumpedInPlace) {
        setPublishResult(`ok:${t('publishBumpedInPlace')}`)
        router.refresh()
      } else {
        // Redirect to new template
        router.push(`/admin/templates/${res.newTemplateId}`)
      }
    })
  }

  // ── Section operations ────────────────────────────────────────

  function handleAddSection() {
    if (!newSectionTitle.trim()) return
    const orderIndex = sections.length
    startTransition(async () => {
      const res = await createSection(template.id, newSectionTitle.trim(), orderIndex)
      if (res.error) { setActionError(res.error); return }
      setSections(prev => [...prev, {
        id: res.id!,
        title: newSectionTitle.trim(),
        order_index: orderIndex,
        items: [],
      }])
      setNewSectionTitle('')
      setShowAddSection(false)
    })
  }

  async function handleRenameSection(sectionId: string, title: string): Promise<string | null> {
    const res = await updateSection(sectionId, title)
    if (res.error) { setActionError(res.error); return res.error }
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, title } : s
    ))
    return null
  }

  function handleDeleteSection(sectionId: string, title: string) {
    if (!confirm(t('confirmDeleteSection', { title }))) return
    startTransition(async () => {
      const res = await deleteSection(sectionId)
      if (res.error) { setActionError(res.error); return }
      setSections(prev => {
        const updated = prev.filter(s => s.id !== sectionId)
          .map((s, i) => ({ ...s, order_index: i }))
        return updated
      })
    })
  }

  function handleMoveSection(sectionId: string, direction: 'up' | 'down') {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === sectionId)
      if (idx < 0) return prev
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      const reindexed = next.map((s, i) => ({ ...s, order_index: i }))
      startTransition(async () => {
        await reorderSections(reindexed.map(s => ({ id: s.id, order_index: s.order_index })))
      })
      return reindexed
    })
  }

  // ── Item operations ───────────────────────────────────────────

  // '' → null (un `??` preservaría el string vacío)
  function trimOrNull(s: string | null | undefined): string | null {
    const v = s?.trim()
    return v?.length ? v : null
  }

  function normalizeForm(form: ItemFormValues): Omit<ItemPayload, 'order_index'> {
    return {
      ...form,
      item_number: trimOrNull(form.item_number),
      description: form.description.trim(),
      description_es: trimOrNull(form.description_es),
      unit: trimOrNull(form.unit),
      acceptance_text: trimOrNull(form.acceptance_text),
    }
  }

  async function handleCreateItem(sectionId: string, form: ItemFormValues): Promise<string | null> {
    const section = sections.find(s => s.id === sectionId)
    const orderIndex = section ? section.items.length : 0
    const payload: ItemPayload = { ...normalizeForm(form), order_index: orderIndex }
    const res = await createItem(sectionId, template.id, payload)
    if (res.error) return res.error
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, items: [...s.items, { id: res.id!, ...payload } as BuilderItem] }
        : s
    ))
    return null
  }

  async function handleUpdateItem(itemId: string, form: ItemFormValues): Promise<string | null> {
    const payload: Partial<ItemPayload> = normalizeForm(form)
    const res = await updateItem(itemId, payload)
    if (res.error) return res.error
    setSections(prev => prev.map(s => ({
      ...s,
      items: s.items.map(it =>
        it.id === itemId ? { ...it, ...payload } as BuilderItem : it
      ),
    })))
    return null
  }

  function handleDeleteItem(itemId: string, sectionId: string) {
    if (!confirm(t('confirmDeleteItem'))) return
    startTransition(async () => {
      const res = await deleteItem(itemId)
      if (res.error) { setActionError(res.error); return }
      setSections(prev => prev.map(s =>
        s.id === sectionId
          ? { ...s, items: s.items.filter(it => it.id !== itemId).map((it, i) => ({ ...it, order_index: i })) }
          : s
      ))
    })
  }

  function handleMoveItem(itemId: string, sectionId: string, direction: 'up' | 'down') {
    setSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      const idx = s.items.findIndex(it => it.id === itemId)
      if (idx < 0) return s
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= s.items.length) return s
      const next = [...s.items]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      const reindexed = next.map((it, i) => ({ ...it, order_index: i }))
      startTransition(async () => {
        await reorderItems(reindexed.map(it => ({ id: it.id, order_index: it.order_index })))
      })
      return { ...s, items: reindexed }
    }))
  }

  // ── Export / preview ──────────────────────────────────────────

  function handlePreviewDoc() {
    startTransition(async () => {
      const res = await exportItrTemplate(template.id)
      if (res.error || !res.backup) { setActionError(res.error ?? 'Error al previsualizar'); return }
      setDocPreview(res.backup)
    })
  }

  function handleExportJson() {
    startTransition(async () => {
      const res = await exportItrTemplate(template.id)
      if (res.error || !res.backup) { setActionError(res.error ?? 'Error al exportar'); return }
      downloadJsonFile(`commup-itr-${template.code}-${dateStamp()}.json`, res.backup)
    })
  }

  // ── Render ────────────────────────────────────────────────────

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0)
  const allItems: BuilderItem[] = sections.flatMap(s => s.items)

  return (
    <div style={{ padding: '32px', maxWidth: '1000px' }}>

      {/* Breadcrumb */}
      <Link href="/admin/templates" style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '20px',
      }}>
        {t('breadcrumb')}
      </Link>

      {/* Header card */}
      <TemplateHeaderCard
        template={template}
        canEdit={canEdit}
        totalItems={totalItems}
        sectionsCount={sections.length}
        busy={isPending}
        publishResult={publishResult}
        onImportClick={() => setShowImport(true)}
        onPreviewDoc={handlePreviewDoc}
        onExportJson={handleExportJson}
        onPublishClick={() => setShowPublishConfirm(true)}
      />

      {/* Global error */}
      {actionError && (
        <div style={{ padding: '10px 14px', background: '#fee2e2', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#ef4444' }}>
          {actionError}
          <button onClick={() => setActionError(null)} style={{ marginLeft: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Sections */}
      {sections.length === 0 && (
        <div style={{
          background: 'var(--card-bg)', borderRadius: '14px', border: '2px dashed #e2e8f0',
          padding: '48px', textAlign: 'center', marginBottom: '16px',
        }}>
          <div style={{ fontSize: '28px', opacity: 0.3, marginBottom: '10px' }}>▤</div>
          <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)', margin: '0 0 4px' }}>
            {t('emptyTitle')}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: 0 }}>
            {t('emptyDesc')}
          </p>
        </div>
      )}

      {sections.map((section, sIdx) => (
        <TemplateSectionCard
          key={section.id}
          section={section}
          index={sIdx}
          total={sections.length}
          canEdit={canEdit}
          busy={isPending}
          allItems={allItems}
          onRenameSection={handleRenameSection}
          onDeleteSection={handleDeleteSection}
          onMoveSection={handleMoveSection}
          onCreateItem={handleCreateItem}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          onMoveItem={handleMoveItem}
        />
      ))}

      {/* Add section */}
      {canEdit && (
        <div style={{ marginTop: '8px' }}>
          {showAddSection ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                value={newSectionTitle}
                onChange={e => setNewSectionTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSection(); if (e.key === 'Escape') { setShowAddSection(false); setNewSectionTitle('') } }}
                placeholder={t('placeholderSectionName')}
                autoFocus
                style={{ ...fieldInput, flex: 1, fontSize: '13px' }}
              />
              <button
                onClick={handleAddSection}
                disabled={isPending || !newSectionTitle.trim()}
                style={{ padding: '9px 18px', background: '#3b82f6', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer' }}
              >
                {t('btnAddSection')}
              </button>
              <button
                onClick={() => { setShowAddSection(false); setNewSectionTitle('') }}
                style={{ padding: '9px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                {t('btnCancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddSection(true)}
              style={{
                padding: '10px 20px', background: 'var(--card-bg)', border: '1px dashed #cbd5e1',
                borderRadius: '10px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer',
                width: '100%', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLElement).style.color = '#3b82f6' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gray-300)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
            >
              {t('btnAddSectionMain')}
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: '28px', padding: '12px 16px', background: 'var(--gray-50)', borderRadius: '8px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {[
          { icon: '●', color: '#ef4444', label: t('legendCritical') },
          { icon: '●', color: '#f59e0b', label: t('legendRequired') },
          { icon: '⊙', color: '#3b82f6', label: t('legendRequiresPhoto') },
          { icon: '○', color: 'var(--border)', label: t('legendNotApplicable') },
        ].map(l => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span style={{ color: l.color, fontSize: '13px' }}>{l.icon}</span>
            {l.label}
          </span>
        ))}
      </div>

      {/* Document preview overlay */}
      {docPreview && (
        <BackupDocumentView backup={docPreview} onClose={() => setDocPreview(null)} />
      )}

      {/* Import modal */}
      {showImport && (
        <ImportItemsModal
          templateId={template.id}
          hasExistingContent={sections.length > 0}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false)
            router.refresh()
          }}
        />
      )}

      {/* Publish version confirm modal */}
      {showPublishConfirm && (
        <TemplatePublishModal
          nextVersion={template.version + 1}
          isPending={isPending}
          onConfirm={handlePublishVersion}
          onClose={() => setShowPublishConfirm(false)}
        />
      )}
    </div>
  )
}
