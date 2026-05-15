'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updateTag, deleteTag } from '@/app/actions/tags'
import TagItrTab from './TagItrTab'
import TagPunchTab, { type TagPunch, type OrgMemberForPunch } from './TagPunchTab'
import TagPreservationTab, { type PreservationPlanRow, type PreservationProcedureOption } from './TagPreservationTab'
import TagPhotosTab from './TagPhotosTab'
import NfcSection from './NfcSection'
import type { ConsolidatedTagPhoto } from '@/lib/tag-photos'

// ── ITR prop types ───────────────────────────────────────────────────

export type TagItr = {
  id: string
  itr_number: string
  status: string
  progress_pct: number
  scheduled_date: string | null
  created_at: string
  itr_templates: { code: string; title: string; disciplines: { code: string; name: string; color: string } } | null
  project_phases: { code: string; name: string; color: string } | null
  itr_assignments: Array<{ user_id: string; role: string; profiles: { full_name: string } | null }>
  itr_signatures: Array<{ id: string; role: string; signed_at: string }>
}

export type ItrTemplate = {
  id: string
  code: string
  title: string
  phase_id: string
  project_phases: { id: string; code: string; name: string; color: string } | null
}

export type OrgMember = {
  user_id: string
  role: string
  profiles: { full_name: string } | null
}

// ── Types ────────────────────────────────────────────────────────

type Discipline = { id: string; code: string; name: string; color: string }
type Area       = { id: string; code: string; name: string }
type System     = { id: string; code: string; name: string; areas: Area }
type Subsystem  = { id: string; code: string; name: string; systems: System }

type Tag = {
  id: string
  tag_number: string
  description: string
  status: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  preservation_required: boolean
  pid_drawing: string | null
  nfc_uid: string | null
  range_min: number | null
  range_max: number | null
  eng_unit: string | null
  sp_h: number | null
  sp_hh: number | null
  sp_l: number | null
  sp_ll: number | null
  signal_type: string | null
  sil_level: string | null
  io_address: string | null
  junction_box: string | null
  datasheet_number: string | null
  revision: string | null
  fluid_type: string | null
  mounting_typical: string | null
  disciplines: Discipline
  subsystems: Subsystem
}

type Tab = 'overview' | 'itrs' | 'punches' | 'photos' | 'docs' | 'preservation'

// ── Status config ────────────────────────────────────────────────

const STATUS: Record<string, { color: string; bg: string; border: string }> = {
  not_started: { color: 'var(--text-muted)', bg: 'var(--gray-100)', border: 'var(--border)' },
  in_progress:  { color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  completed:    { color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
  on_hold:      { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
}

const SIGNAL_TYPES = ['4-20mA', 'HART', 'Discreta', 'Foundation Fieldbus', 'Profibus', 'Modbus', 'WirelessHART', 'Otra']
const SIL_LEVELS   = ['None', 'SIL1', 'SIL2', 'SIL3']

// Disciplines that work with analog/digital signals, setpoints, and SIL levels
const INST_DISCIPLINES = ['INST', 'SAFE', 'TELE']

// ── Main component ───────────────────────────────────────────────

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
          <EditForm tag={tag} projectId={projectId} onCancel={() => setEditMode(false)} canDelete={canEdit} />
        ) : (
          <>
            {activeTab === 'overview'     && <OverviewTab tag={tag} area={area} sys={sys} sub={sub} pidSignedUrl={pidSignedUrl} projectId={projectId} canEdit={canEdit} />}
            {activeTab === 'itrs'         && (
              <TagItrTab
                projectId={projectId}
                tagId={tag.id}
                tagNumber={tag.tag_number}
                subsystemId={(tag.subsystems as unknown as { id: string }).id}
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
            {activeTab === 'docs'         && <DocsTab tag={tag} pidSignedUrl={pidSignedUrl} pidDocId={pidDocId} projectId={projectId} />}
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

// ── Overview Tab ─────────────────────────────────────────────────

function OverviewTab({ tag, area, sys, sub, pidSignedUrl, projectId, canEdit }: {
  tag: Tag
  area: Area | undefined
  sys: System | undefined
  sub: Subsystem | undefined
  pidSignedUrl: string | null
  projectId: string
  canEdit: boolean
}) {
  const t = useTranslations('Tags')
  const d = tag.disciplines

  const STATUS_LABELS: Record<string, string> = {
    not_started: t('status.not_started'),
    in_progress:  t('status.in_progress'),
    completed:    t('status.completed'),
    on_hold:      t('status.on_hold'),
  }

  const infoFields = [
    { label: t('overview.fieldStatus'),       value: STATUS_LABELS[tag.status] ?? tag.status },
    { label: t('overview.fieldDiscipline'),   value: `${d.code} — ${d.name}` },
    { label: t('overview.fieldManufacturer'), value: tag.manufacturer ?? '—' },
    { label: t('overview.fieldModel'),        value: tag.model ?? '—' },
    { label: t('overview.fieldSerial'),       value: tag.serial_number ?? '—' },
    { label: t('overview.fieldPreservation'), value: tag.preservation_required ? t('overview.yesPreservation') : t('overview.noPreservation') },
  ]

  const locFields = [
    { label: t('overview.fieldArea'),       value: area ? `${area.code} — ${area.name}` : '—' },
    { label: t('overview.fieldSystem'),     value: sys  ? `${sys.code} — ${sys.name}`   : '—' },
    { label: t('overview.fieldSubsystem'),  value: sub  ? `${sub.code} — ${sub.name}`   : '—' },
    { label: t('overview.fieldPid'),        value: tag.pid_drawing ?? '—', link: pidSignedUrl ?? undefined },
  ]

  const isInst = INST_DISCIPLINES.includes(tag.disciplines.code)
  const hasEngParams = tag.range_min != null || tag.range_max != null || !!(tag.datasheet_number ?? tag.revision) ||
    !!(tag.fluid_type ?? tag.mounting_typical) ||
    (isInst && (!!(tag.signal_type ?? (tag.sil_level && tag.sil_level !== 'None') ?? tag.io_address ?? tag.junction_box) || tag.sp_h != null || tag.sp_hh != null || tag.sp_l != null || tag.sp_ll != null))

  const fmt = (v: number | null) => v != null ? String(v) : '—'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>

      {/* Equipment info */}
      <div style={cardStyle}>
        <p style={sectionLabel}>{t('overview.sectionEquipment')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {infoFields.map((f, i) => (
            <div key={f.label} style={{
              display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px',
              padding: '10px 0',
              borderBottom: i < infoFields.length - 1 ? '1px solid #f1f5f9' : 'none',
            }}>
              <span style={{ fontSize: '12px', color: 'var(--gray-400)', fontWeight: 500 }}>{f.label}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-strong)', fontWeight: 500 }}>{f.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* NFC binding (D2) */}
        <NfcSection projectId={projectId} tagId={tag.id} nfcUid={tag.nfc_uid} canEdit={canEdit} />

        {/* Location */}
        <div style={cardStyle}>
          <p style={sectionLabel}>{t('overview.sectionLocation')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {locFields.map((f, i) => (
              <div key={f.label} style={{
                display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px',
                padding: '10px 0',
                borderBottom: i < locFields.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}>
                <span style={{ fontSize: '12px', color: 'var(--gray-400)', fontWeight: 500 }}>{f.label}</span>
                {f.link ? (
                  <a href={f.link} target="_blank" rel="noopener noreferrer" style={{
                    fontSize: '12px', color: '#2563eb', fontFamily: 'ui-monospace, monospace',
                    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px',
                  }}>
                    {f.value} <span style={{ opacity: 0.5, fontSize: '10px' }}>↗</span>
                  </a>
                ) : (
                  <span style={{
                    fontSize: '13px', color: f.value === '—' ? 'var(--gray-300)' : 'var(--text-strong)',
                    fontWeight: 500,
                    fontFamily: f.label !== 'P&ID' && f.value !== '—' ? undefined : 'ui-monospace, monospace',
                  }}>
                    {f.value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Engineering parameters */}
        <div style={cardStyle}>
          <p style={sectionLabel}>{t('overview.sectionEngineering')}</p>
          {!hasEngParams ? (
            <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--gray-300)', fontSize: '13px' }}>
              {t('overview.noEngParams')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

              {/* Range */}
              {(tag.range_min != null || tag.range_max != null) && (
                <EngRow label={t('overview.engRange')}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: 'var(--text-strong)' }}>
                    {fmt(tag.range_min)} – {fmt(tag.range_max)}
                    {tag.eng_unit && <span style={{ marginLeft: '6px', color: 'var(--text-muted)' }}>{tag.eng_unit}</span>}
                  </span>
                </EngRow>
              )}

              {/* Setpoints — instruments only */}
              {isInst && (tag.sp_hh != null || tag.sp_h != null || tag.sp_l != null || tag.sp_ll != null) && (
                <EngRow label={t('overview.engSetpoints')}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {tag.sp_hh != null && <SetpointPill label="HH" value={tag.sp_hh} unit={tag.eng_unit} color="#ef4444" />}
                    {tag.sp_h  != null && <SetpointPill label="H"  value={tag.sp_h}  unit={tag.eng_unit} color="#f97316" />}
                    {tag.sp_l  != null && <SetpointPill label="L"  value={tag.sp_l}  unit={tag.eng_unit} color="#3b82f6" />}
                    {tag.sp_ll != null && <SetpointPill label="LL" value={tag.sp_ll} unit={tag.eng_unit} color="#6366f1" />}
                  </div>
                </EngRow>
              )}

              {isInst && tag.signal_type && (
                <EngRow label={t('overview.engSignalType')}>
                  <span style={{ fontSize: '13px', color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{tag.signal_type}</span>
                </EngRow>
              )}

              {isInst && tag.sil_level && tag.sil_level !== 'None' && (
                <EngRow label={t('overview.engSilLevel')}>
                  <span style={{
                    padding: '2px 8px', borderRadius: '5px', fontSize: '12px', fontWeight: 700,
                    background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a',
                  }}>
                    {tag.sil_level}
                  </span>
                </EngRow>
              )}

              {isInst && tag.io_address && (
                <EngRow label={t('overview.engIoAddress')}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: 'var(--text-strong)' }}>{tag.io_address}</span>
                </EngRow>
              )}

              {isInst && tag.junction_box && (
                <EngRow label={t('overview.engJunctionBox')}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: 'var(--text-strong)' }}>{tag.junction_box}</span>
                </EngRow>
              )}

              {tag.fluid_type && (
                <EngRow label={t('overview.engFluidType')}>
                  <span style={{ fontSize: '13px', color: 'var(--text-strong)' }}>{tag.fluid_type}</span>
                </EngRow>
              )}

              {tag.datasheet_number && (
                <EngRow label={t('overview.engDatasheet')}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: 'var(--text-strong)' }}>{tag.datasheet_number}</span>
                </EngRow>
              )}

              {isInst && tag.mounting_typical && (
                <EngRow label={t('overview.engMounting')}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: 'var(--text-strong)' }}>{tag.mounting_typical}</span>
                </EngRow>
              )}

              {tag.revision && (
                <EngRow label={t('overview.engRevision')} last>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: 'var(--text-strong)' }}>{tag.revision}</span>
                </EngRow>
              )}

            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function EngRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px',
      padding: '10px 0',
      borderBottom: last ? 'none' : '1px solid #f1f5f9',
      alignItems: 'center',
    }}>
      <span style={{ fontSize: '12px', color: 'var(--gray-400)', fontWeight: 500 }}>{label}</span>
      <div>{children}</div>
    </div>
  )
}

function SetpointPill({ label, value, unit, color }: { label: string; value: number; unit: string | null; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '5px', fontSize: '12px',
      background: `${color}12`, border: `1px solid ${color}30`, color,
    }}>
      <span style={{ fontWeight: 700, fontSize: '10px' }}>{label}</span>
      <span style={{ fontFamily: 'ui-monospace, monospace' }}>
        {value}{unit ? ` ${unit}` : ''}
      </span>
    </span>
  )
}

// ── Edit Form ────────────────────────────────────────────────────

function EditForm({ tag, projectId, onCancel, canDelete }: {
  tag: Tag
  projectId: string
  onCancel: () => void
  canDelete: boolean
}) {
  const t = useTranslations('Tags')
  const isInst = INST_DISCIPLINES.includes(tag.disciplines.code)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Form state
  const [form, setForm] = useState({
    description:           tag.description ?? '',
    manufacturer:          tag.manufacturer ?? '',
    model:                 tag.model ?? '',
    serial_number:         tag.serial_number ?? '',
    status:                tag.status,
    preservation_required: tag.preservation_required,
    pid_drawing:           tag.pid_drawing ?? '',
    // Engineering
    range_min:    tag.range_min  != null ? String(tag.range_min)  : '',
    range_max:    tag.range_max  != null ? String(tag.range_max)  : '',
    eng_unit:     tag.eng_unit   ?? '',
    sp_hh:        tag.sp_hh     != null ? String(tag.sp_hh)     : '',
    sp_h:         tag.sp_h      != null ? String(tag.sp_h)      : '',
    sp_l:         tag.sp_l      != null ? String(tag.sp_l)      : '',
    sp_ll:        tag.sp_ll     != null ? String(tag.sp_ll)     : '',
    signal_type:      tag.signal_type      ?? '',
    sil_level:        tag.sil_level        ?? 'None',
    io_address:       tag.io_address       ?? '',
    junction_box:     tag.junction_box     ?? '',
    datasheet_number: tag.datasheet_number ?? '',
    revision:         tag.revision         ?? '',
    fluid_type:       tag.fluid_type       ?? '',
    mounting_typical: tag.mounting_typical ?? '',
  })

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const toNum = (s: string) => s.trim() === '' ? null : parseFloat(s)

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteTag(projectId, tag.id)
      if (res.error) {
        setError(res.error)
        setShowDeleteConfirm(false)
        return
      }
      window.location.href = `/projects/${projectId}/tags`
    })
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateTag(projectId, tag.id, {
        description:           form.description.trim() || tag.description,
        manufacturer:          form.manufacturer.trim() || null,
        model:                 form.model.trim() || null,
        serial_number:         form.serial_number.trim() || null,
        status:                form.status,
        preservation_required: form.preservation_required,
        pid_drawing:           form.pid_drawing.trim() || null,
        range_min:    toNum(form.range_min),
        range_max:    toNum(form.range_max),
        eng_unit:     form.eng_unit.trim() || null,
        sp_hh:        toNum(form.sp_hh),
        sp_h:         toNum(form.sp_h),
        sp_l:         toNum(form.sp_l),
        sp_ll:        toNum(form.sp_ll),
        signal_type:      form.signal_type || null,
        sil_level:        form.sil_level || 'None',
        io_address:       form.io_address.trim() || null,
        junction_box:     form.junction_box.trim() || null,
        datasheet_number: form.datasheet_number.trim() || null,
        revision:         form.revision.trim() || null,
        fluid_type:       form.fluid_type.trim() || null,
        mounting_typical: form.mounting_typical.trim() || null,
      })
      if (res.error) {
        setError(res.error)
      } else {
        onCancel()
        window.location.reload()
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {error && (
        <div style={{
          padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '8px', fontSize: '13px', color: '#dc2626',
        }}>
          {error}
        </div>
      )}

      {/* Basic info */}
      <div style={cardStyle}>
        <p style={sectionLabel}>{t('edit.sectionBasic')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '12px' }}>

          <FormField label={t('edit.fieldDescription')} style={{ gridColumn: '1 / -1' }}>
            <input style={inputStyle} value={form.description} onChange={e => set('description', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldManufacturer')}>
            <input style={inputStyle} value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldModel')}>
            <input style={inputStyle} value={form.model} onChange={e => set('model', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldSerial')}>
            <input style={inputStyle} value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldPidNumber')}>
            <input style={inputStyle} placeholder="Ej: P-1001" value={form.pid_drawing} onChange={e => set('pid_drawing', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldStatus')}>
            <select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="not_started">{t('status.not_started')}</option>
              <option value="in_progress">{t('status.in_progress')}</option>
              <option value="completed">{t('status.completed')}</option>
              <option value="on_hold">{t('status.on_hold')}</option>
            </select>
          </FormField>

          <FormField label={t('edit.fieldPreservation')}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '34px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.preservation_required}
                onChange={e => set('preservation_required', e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#3b82f6' }}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('edit.preservationCheck')}</span>
            </label>
          </FormField>

        </div>
      </div>

      {/* Engineering parameters */}
      <div style={cardStyle}>
        <p style={sectionLabel}>{t('edit.sectionEngineering')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginTop: '12px' }}>

          <FormField label={t('edit.fieldRangeMin')}>
            <input style={inputStyle} type="number" placeholder="0" value={form.range_min} onChange={e => set('range_min', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldRangeMax')}>
            <input style={inputStyle} type="number" placeholder="100" value={form.range_max} onChange={e => set('range_max', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldEngUnit')}>
            <input style={inputStyle} placeholder="Ej: mmH2O, bar, °C, kV" value={form.eng_unit} onChange={e => set('eng_unit', e.target.value)} />
          </FormField>

          {!isInst && (
            <FormField label={t('edit.fieldFluidType')}>
              <input style={inputStyle} placeholder="Ej: Gas Natural, Crudo, Agua Producida" value={form.fluid_type} onChange={e => set('fluid_type', e.target.value)} />
            </FormField>
          )}

          <FormField label={t('edit.fieldDatasheet')}>
            <input style={inputStyle} placeholder="Ej: DS-P-762802A" value={form.datasheet_number} onChange={e => set('datasheet_number', e.target.value)} />
          </FormField>

          <FormField label={t('edit.fieldRevision')}>
            <input style={inputStyle} placeholder="Ej: Rev. C" value={form.revision} onChange={e => set('revision', e.target.value)} />
          </FormField>

        </div>

        {/* Instrument-only fields */}
        {isInst && (
          <>
            <div style={{ margin: '20px 0 14px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('edit.sectionInstrumentation')}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--gray-300)' }}>{t('edit.instrSubtitle')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>

              <FormField label={t('edit.fieldSpHH')}>
                <input style={inputStyle} type="number" placeholder="—" value={form.sp_hh} onChange={e => set('sp_hh', e.target.value)} />
              </FormField>

              <FormField label={t('edit.fieldSpH')}>
                <input style={inputStyle} type="number" placeholder="—" value={form.sp_h} onChange={e => set('sp_h', e.target.value)} />
              </FormField>

              <FormField label={t('edit.fieldSpL')}>
                <input style={inputStyle} type="number" placeholder="—" value={form.sp_l} onChange={e => set('sp_l', e.target.value)} />
              </FormField>

              <FormField label={t('edit.fieldSpLL')}>
                <input style={inputStyle} type="number" placeholder="—" value={form.sp_ll} onChange={e => set('sp_ll', e.target.value)} />
              </FormField>

              <FormField label={t('edit.fieldSignalType')}>
                <select style={inputStyle} value={form.signal_type} onChange={e => set('signal_type', e.target.value)}>
                  <option value="">{t('edit.signalUndefined')}</option>
                  {SIGNAL_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>

              <FormField label={t('edit.fieldSilLevel')}>
                <select style={inputStyle} value={form.sil_level} onChange={e => set('sil_level', e.target.value)}>
                  {SIL_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>

              <FormField label={t('edit.fieldIoAddress')}>
                <input style={inputStyle} placeholder="Ej: AI-100" value={form.io_address} onChange={e => set('io_address', e.target.value)} />
              </FormField>

              <FormField label={t('edit.fieldJunctionBox')}>
                <input style={inputStyle} placeholder="Ej: JB-101A" value={form.junction_box} onChange={e => set('junction_box', e.target.value)} />
              </FormField>

              <FormField label={t('edit.fieldMounting')}>
                <input style={inputStyle} placeholder="Ej: TYP-INST-001" value={form.mounting_typical} onChange={e => set('mounting_typical', e.target.value)} />
              </FormField>

            </div>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          disabled={isPending}
          style={{
            padding: '9px 20px', background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer',
          }}
        >
          {t('edit.cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          style={{
            padding: '9px 20px', background: isPending ? '#93c5fd' : '#3b82f6', border: 'none',
            borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff',
            cursor: isPending ? 'not-allowed' : 'pointer',
          }}
        >
          {isPending ? t('edit.saving') : t('edit.save')}
        </button>
      </div>

      {/* Danger zone */}
      {canDelete && (
        <div style={{ borderTop: '1px solid #fee2e2', paddingTop: '16px', marginTop: '4px' }}>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                width: '100%', padding: '8px 12px', background: 'var(--card-bg)',
                border: '1px solid #fecaca', borderRadius: '7px',
                fontSize: '12px', color: '#dc2626', cursor: 'pointer', textAlign: 'left',
              }}
            >
              {t('edit.deleteBtn')}
            </button>
          ) : (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px' }}>
              <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#991b1b', fontWeight: 500 }}>
                {t('edit.deleteConfirmMsg', { tagNumber: tag.tag_number })}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  style={{
                    padding: '7px 14px', background: '#dc2626', color: '#fff',
                    border: 'none', borderRadius: '6px', fontSize: '12px',
                    fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isPending ? t('edit.deleting') : t('edit.confirmDelete')}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isPending}
                  style={{
                    padding: '7px 12px', background: 'var(--card-bg)', color: 'var(--text-muted)',
                    border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                  }}
                >
                  {t('edit.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

function FormField({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

// ── Docs Tab ─────────────────────────────────────────────────────

function DocsTab({ tag, pidSignedUrl, pidDocId, projectId }: { tag: Tag; pidSignedUrl: string | null; pidDocId: string | null; projectId: string }) {
  const t = useTranslations('Tags')

  if (!tag.pid_drawing) {
    return (
      <EmptyTab
        icon="📄"
        title={t('docs.emptyTitle')}
        message={t('docs.emptyMsg')}
      />
    )
  }

  return (
    <div>
      <p style={sectionLabel}>{t('docs.sectionTitle')}</p>
      <div style={{
        background: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--border)',
        overflow: 'hidden', marginTop: '12px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px', opacity: 0.5 }}>📄</span>
            <div>
              <div style={{
                fontSize: '13px', fontWeight: 700, color: '#1e40af',
                fontFamily: 'ui-monospace, monospace',
              }}>
                {tag.pid_drawing}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>
                {pidSignedUrl ? t('docs.docAvailable') : t('docs.docNotUploaded')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {pidSignedUrl ? (
              <a
                href={pidSignedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '7px 16px', background: '#f0fdf4', color: '#16a34a',
                  border: '1px solid #bbf7d0', borderRadius: '7px',
                  fontSize: '12px', fontWeight: 500, textDecoration: 'none',
                }}
              >
                {t('docs.viewPdf')}
              </a>
            ) : (
              <span style={{
                padding: '7px 16px', background: '#fef3c7', color: '#92400e',
                border: '1px solid #fde68a', borderRadius: '7px', fontSize: '12px',
              }}>
                {t('docs.pdfNotUploaded')}
              </span>
            )}
            {pidDocId && (
              <a
                href={`/projects/${projectId}/pid-documents/${pidDocId}/viewer?tag=${tag.id}`}
                style={{
                  padding: '7px 16px', background: '#eff6ff', color: '#2563eb',
                  border: '1px solid #bfdbfe', borderRadius: '7px',
                  fontSize: '12px', fontWeight: 500, textDecoration: 'none',
                }}
              >
                {t('docs.viewInViewer')}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────

function EmptyTab({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '52px 32px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.25 }}>{icon}</div>
      <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)', margin: '0 0 6px' }}>{title}</p>
      <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: 0, maxWidth: '360px', lineHeight: '1.5' }}>{message}</p>
    </div>
  )
}

// ── Shared styles ────────────────────────────────────────────────

const navBtn: React.CSSProperties = {
  padding: '6px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)',
  borderRadius: '7px', fontSize: '12px', color: 'var(--text-muted)',
  textDecoration: 'none', cursor: 'pointer',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--border)', padding: '16px 18px',
}

const sectionLabel: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)',
  textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '7px',
  fontSize: '13px', color: 'var(--text-strong)', background: 'var(--card-bg)', boxSizing: 'border-box',
  outline: 'none',
}
