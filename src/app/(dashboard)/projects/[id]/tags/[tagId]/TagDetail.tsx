'use client'

// Detalle de Tag — orquestador (Q3). Header + tab bar + composición; cada tab
// y el formulario de edición viven en archivos hermanos. Tipos/estilos
// compartidos en tag-detail-shared.ts.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import TagItrTab from './TagItrTab'
import TagPunchTab, { type TagPunch, type OrgMemberForPunch } from './TagPunchTab'
import TagPreservationTab, { type PreservationPlanRow, type PreservationProcedureOption } from './TagPreservationTab'
import TagPhotosTab from './TagPhotosTab'
import TagOverviewTab from './TagOverviewTab'
import TagDocsTab from './TagDocsTab'
import TagEditForm from './TagEditForm'
import { STATUS, navBtn, type ItrTemplate, type OrgMember, type Tag, type TagItr } from './tag-detail-shared'
import type { ConsolidatedTagPhoto } from '@/lib/tag-photos'

// Re-export para callers existentes (TagItrTab importa estos tipos de aquí
// históricamente; la fuente ahora es tag-detail-shared.ts)
export type { TagItr, ItrTemplate, OrgMember } from './tag-detail-shared'

type Tab = 'overview' | 'itrs' | 'punches' | 'photos' | 'docs' | 'preservation'

export default function TagDetail({
  tag,
  projectId,
  projectName,
  pidSignedUrl,
  pidDocId,
  prevTagId,
  nextTagId,
  canEdit,
  currentUserRole,
  tagItrs,
  templates,
  orgMembers,
  tagPunches,
  preservationPlans,
  preservationProcedures,
  tagPhotos,
}: {
  tag: Tag
  projectId: string
  projectName: string
  pidSignedUrl: string | null
  pidDocId: string | null
  prevTagId: string | null
  nextTagId: string | null
  canEdit: boolean
  currentUserRole: string
  tagItrs: TagItr[]
  templates: ItrTemplate[]
  orgMembers: OrgMember[]
  tagPunches: TagPunch[]
  preservationPlans: PreservationPlanRow[]
  preservationProcedures: PreservationProcedureOption[]
  tagPhotos: ConsolidatedTagPhoto[]
}) {
  const t = useTranslations('Tags')
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [editMode, setEditMode]   = useState(false)

  const status = STATUS[tag.status] ?? STATUS.not_started
  const d      = tag.disciplines
  const sub    = tag.subsystems
  const sys    = sub?.systems
  const area   = sys?.areas

  const hier = [area?.code, sys?.code, sub?.code].filter(Boolean).join(' › ')

  const STATUS_LABELS: Record<string, string> = {
    not_started: t('status.not_started'),
    in_progress:  t('status.in_progress'),
    completed:    t('status.completed'),
    on_hold:      t('status.on_hold'),
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview',     label: t('detail.tabs.overview') },
    { key: 'itrs',         label: t('detail.tabs.itrs'),         badge: tagItrs.length },
    { key: 'punches',      label: t('detail.tabs.punches'),      badge: tagPunches.length > 0 ? tagPunches.length : undefined },
    { key: 'photos',       label: t('detail.tabs.photos'),       badge: tagPhotos.length > 0 ? tagPhotos.length : undefined },
    { key: 'docs',         label: t('detail.tabs.docs') },
    { key: 'preservation', label: t('detail.tabs.preservation') },
  ]

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>

      {/* Top nav: back link + prev/next */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <a
          href={`/projects/${projectId}/tags`}
          style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        >
          {t('detail.backLink', { project: projectName })}
        </a>
        <div style={{ display: 'flex', gap: '6px' }}>
          {prevTagId ? (
            <a href={`/projects/${projectId}/tags/${prevTagId}`} style={navBtn}>{t('detail.prevTag')}</a>
          ) : (
            <span style={{ ...navBtn, opacity: 0.3, pointerEvents: 'none', cursor: 'default' }}>{t('detail.prevTag')}</span>
          )}
          {nextTagId ? (
            <a href={`/projects/${projectId}/tags/${nextTagId}`} style={navBtn}>{t('detail.nextTag')}</a>
          ) : (
            <span style={{ ...navBtn, opacity: 0.3, pointerEvents: 'none', cursor: 'default' }}>{t('detail.nextTag')}</span>
          )}
        </div>
      </div>

      {/* ── Tag header card ─────────────────────────────────────── */}
      <div style={{
        background: 'var(--card-bg)', borderRadius: '14px 14px 0 0',
        border: '1px solid var(--border)', borderBottom: 'none',
        padding: '22px 24px',
      }}>
        {/* Breadcrumb hierarchy */}
        {hier && (
          <div style={{
            fontSize: '11px', color: 'var(--gray-400)', fontFamily: 'ui-monospace, monospace',
            letterSpacing: '0.03em', marginBottom: '10px',
          }}>
            {hier}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' }}>

          {/* Left: discipline + tag number + description */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1, minWidth: 0 }}>
            <span style={{
              padding: '5px 11px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
              background: `${d.color}18`, color: d.color, flexShrink: 0, marginTop: '3px',
              border: `1px solid ${d.color}30`,
            }}>
              {d.code}
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{
                fontSize: '24px', fontWeight: 700, color: 'var(--text-strong)', margin: 0,
                fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.5px',
              }}>
                {tag.tag_number}
              </h1>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: '1.4' }}>
                {tag.description ?? '—'}
              </p>
              {(tag.manufacturer ?? tag.model ?? tag.serial_number) && (
                <p style={{ fontSize: '12px', color: 'var(--gray-400)', margin: '5px 0 0', fontFamily: 'ui-monospace, monospace' }}>
                  {[tag.manufacturer, tag.model].filter(Boolean).join(' · ')}
                  {tag.serial_number && (
                    <span style={{ marginLeft: '8px', color: 'var(--gray-300)' }}>SN: {tag.serial_number}</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Right: status pill */}
          <span style={{
            padding: '6px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
            background: status.bg, color: status.color, border: `1px solid ${status.border}`,
            flexShrink: 0, whiteSpace: 'nowrap',
          }}>
            {STATUS_LABELS[tag.status] ?? tag.status}
          </span>
        </div>

        {/* P&ID reference */}
        {tag.pid_drawing && (
          <div style={{
            marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{
              fontSize: '10px', fontWeight: 600, color: 'var(--gray-400)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              P&amp;ID
            </span>
            {pidSignedUrl ? (
              <a
                href={pidSignedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '12px', color: '#2563eb', fontFamily: 'ui-monospace, monospace',
                  background: '#eff6ff', padding: '3px 10px', borderRadius: '5px',
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px',
                  border: '1px solid #bfdbfe',
                }}
              >
                {tag.pid_drawing}
                <span style={{ opacity: 0.5, fontSize: '10px' }}>↗</span>
              </a>
            ) : (
              <span style={{
                fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace',
                background: 'var(--gray-50)', padding: '3px 10px', borderRadius: '5px',
                border: '1px solid var(--border)',
              }}>
                {tag.pid_drawing}
              </span>
            )}
            {tag.preservation_required && (
              <span style={{
                marginLeft: '8px', fontSize: '11px', color: '#f59e0b', fontWeight: 600,
                background: '#fffbeb', padding: '2px 8px', borderRadius: '5px',
                border: '1px solid #fde68a',
              }}>
                {t('detail.preservationRequired')}
              </span>
            )}
          </div>
        )}
        {!tag.pid_drawing && tag.preservation_required && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
            <span style={{
              fontSize: '11px', color: '#f59e0b', fontWeight: 600,
              background: '#fffbeb', padding: '2px 8px', borderRadius: '5px',
              border: '1px solid #fde68a',
            }}>
              {t('detail.preservationRequired')}
            </span>
          </div>
        )}
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card-bg)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0',
        paddingLeft: '8px',
      }}>
        {!editMode && tabs.map(tab => {
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: active ? 600 : 400,
                color: active ? 'var(--text-strong)' : 'var(--text-muted)',
                borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
                display: 'flex', alignItems: 'center', gap: '6px',
                transition: 'color 0.15s',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span style={{
                  padding: '1px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                  background: active ? '#3b82f6' : 'var(--gray-100)',
                  color: active ? '#fff' : 'var(--gray-400)',
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}

        {editMode && (
          <span style={{
            padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#3b82f6',
            borderBottom: '2px solid #3b82f6', marginBottom: '-1px',
          }}>
            {t('detail.editing')}
          </span>
        )}

        {/* Edit button floated right */}
        {canEdit && (
          <div style={{ marginLeft: 'auto', paddingRight: '16px' }}>
            {!editMode ? (
              <button
                onClick={() => setEditMode(true)}
                style={{
                  padding: '6px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                  borderRadius: '7px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer',
                }}
              >
                {t('detail.editTag')}
              </button>
            ) : (
              <button
                onClick={() => setEditMode(false)}
                style={{
                  padding: '6px 14px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                  borderRadius: '7px', fontSize: '12px', color: 'var(--gray-400)', cursor: 'pointer',
                }}
              >
                {t('detail.cancel')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      <div style={{
        background: 'var(--gray-50)', border: '1px solid var(--border)', borderTop: 'none',
        borderRadius: '0 0 14px 14px', padding: '24px', minHeight: '300px',
      }}>
        {editMode ? (
          <TagEditForm tag={tag} projectId={projectId} onCancel={() => setEditMode(false)} canDelete={canEdit} />
        ) : (
          <>
            {activeTab === 'overview'     && <TagOverviewTab tag={tag} area={area} sys={sys} sub={sub} pidSignedUrl={pidSignedUrl} projectId={projectId} canEdit={canEdit} />}
            {activeTab === 'itrs'         && (
              <TagItrTab
                projectId={projectId}
                tagId={tag.id}
                tagNumber={tag.tag_number}
                equipmentTypeId={tag.equipment_type_id ?? null}
                subsystemId={tag.subsystems.id}
                tagItrs={tagItrs}
                templates={templates}
                orgMembers={orgMembers}
                canEdit={canEdit}
              />
            )}
            {activeTab === 'punches'      && (
              <TagPunchTab
                punches={tagPunches}
                projectId={projectId}
                tagId={tag.id}
                orgMembers={orgMembers as OrgMemberForPunch[]}
                currentUserRole={currentUserRole}
              />
            )}
            {activeTab === 'photos'       && <TagPhotosTab photos={tagPhotos} />}
            {activeTab === 'docs'         && <TagDocsTab tag={tag} pidSignedUrl={pidSignedUrl} pidDocId={pidDocId} projectId={projectId} />}
            {activeTab === 'preservation' && (
              <TagPreservationTab
                tagId={tag.id}
                projectId={projectId}
                plans={preservationPlans}
                procedures={preservationProcedures}
                orgMembers={orgMembers}
                canEdit={canEdit}
              />
            )}
          </>
        )}
      </div>

    </div>
  )
}
