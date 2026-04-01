'use client'

import { useState, useTransition } from 'react'
import { updateTag } from '@/app/actions/tags'
import TagItrTab from './TagItrTab'

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
  disciplines: Discipline
  subsystems: Subsystem
}

type Tab = 'overview' | 'itrs' | 'punches' | 'docs' | 'preservation'

// ── Status config ────────────────────────────────────────────────

const STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  not_started: { label: 'Sin iniciar', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  in_progress:  { label: 'En progreso', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  completed:    { label: 'Completado',  color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
  on_hold:      { label: 'En espera',   color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
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
  prevTagId,
  nextTagId,
  canEdit,
  tagItrs,
  templates,
  orgMembers,
}: {
  tag: Tag
  projectId: string
  projectName: string
  pidSignedUrl: string | null
  prevTagId: string | null
  nextTagId: string | null
  canEdit: boolean
  tagItrs: TagItr[]
  templates: ItrTemplate[]
  orgMembers: OrgMember[]
}) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [editMode, setEditMode]   = useState(false)

  const status = STATUS[tag.status] ?? STATUS.not_started
  const d      = tag.disciplines
  const sub    = tag.subsystems
  const sys    = sub?.systems
  const area   = sys?.areas

  const hier = [area?.code, sys?.code, sub?.code].filter(Boolean).join(' › ')

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview',     label: 'Resumen' },
    { key: 'itrs',         label: 'ITRs',         badge: tagItrs.length },
    { key: 'punches',      label: 'Punch List',   badge: 0 },
    { key: 'docs',         label: 'Documentos' },
    { key: 'preservation', label: 'Preservación' },
  ]

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>

      {/* Top nav: back link + prev/next */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <a
          href={`/projects/${projectId}/tags`}
          style={{ fontSize: '13px', color: '#64748b', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        >
          ← {projectName} / Tags
        </a>
        <div style={{ display: 'flex', gap: '6px' }}>
          {prevTagId ? (
            <a href={`/projects/${projectId}/tags/${prevTagId}`} style={navBtn}>← Anterior</a>
          ) : (
            <span style={{ ...navBtn, opacity: 0.3, pointerEvents: 'none', cursor: 'default' }}>← Anterior</span>
          )}
          {nextTagId ? (
            <a href={`/projects/${projectId}/tags/${nextTagId}`} style={navBtn}>Siguiente →</a>
          ) : (
            <span style={{ ...navBtn, opacity: 0.3, pointerEvents: 'none', cursor: 'default' }}>Siguiente →</span>
          )}
        </div>
      </div>

      {/* ── Tag header card ─────────────────────────────────────── */}
      <div style={{
        background: 'white', borderRadius: '14px 14px 0 0',
        border: '1px solid #e2e8f0', borderBottom: 'none',
        padding: '22px 24px',
      }}>
        {/* Breadcrumb hierarchy */}
        {hier && (
          <div style={{
            fontSize: '11px', color: '#94a3b8', fontFamily: 'ui-monospace, monospace',
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
                fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: 0,
                fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.5px',
              }}>
                {tag.tag_number}
              </h1>
              <p style={{ fontSize: '14px', color: '#475569', margin: '4px 0 0', lineHeight: '1.4' }}>
                {tag.description || '—'}
              </p>
              {(tag.manufacturer || tag.model || tag.serial_number) && (
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '5px 0 0', fontFamily: 'ui-monospace, monospace' }}>
                  {[tag.manufacturer, tag.model].filter(Boolean).join(' · ')}
                  {tag.serial_number && (
                    <span style={{ marginLeft: '8px', color: '#cbd5e1' }}>SN: {tag.serial_number}</span>
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
            {status.label}
          </span>
        </div>

        {/* P&ID reference */}
        {tag.pid_drawing && (
          <div style={{
            marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{
              fontSize: '10px', fontWeight: 600, color: '#94a3b8',
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
                fontSize: '12px', color: '#64748b', fontFamily: 'ui-monospace, monospace',
                background: '#f8fafc', padding: '3px 10px', borderRadius: '5px',
                border: '1px solid #e2e8f0',
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
                ◉ Preservación requerida
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
              ◉ Preservación requerida
            </span>
          </div>
        )}
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────── */}
      <div style={{
        background: 'white', borderLeft: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0',
        borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0',
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
                color: active ? '#0f172a' : '#64748b',
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
                  background: active ? '#3b82f6' : '#f1f5f9',
                  color: active ? 'white' : '#94a3b8',
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
            Editando tag
          </span>
        )}

        {/* Edit button floated right */}
        {canEdit && (
          <div style={{ marginLeft: 'auto', paddingRight: '16px' }}>
            {!editMode ? (
              <button
                onClick={() => setEditMode(true)}
                style={{
                  padding: '6px 14px', background: 'white', border: '1px solid #e2e8f0',
                  borderRadius: '7px', fontSize: '12px', color: '#475569', cursor: 'pointer',
                }}
              >
                Editar tag
              </button>
            ) : (
              <button
                onClick={() => setEditMode(false)}
                style={{
                  padding: '6px 14px', background: 'white', border: '1px solid #e2e8f0',
                  borderRadius: '7px', fontSize: '12px', color: '#94a3b8', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      <div style={{
        background: '#f8fafc', border: '1px solid #e2e8f0', borderTop: 'none',
        borderRadius: '0 0 14px 14px', padding: '24px', minHeight: '300px',
      }}>
        {editMode ? (
          <EditForm tag={tag} projectId={projectId} onCancel={() => setEditMode(false)} />
        ) : (
          <>
            {activeTab === 'overview'     && <OverviewTab tag={tag} area={area} sys={sys} sub={sub} pidSignedUrl={pidSignedUrl} />}
            {activeTab === 'itrs'         && (
              <TagItrTab
                projectId={projectId}
                tagId={tag.id}
                subsystemId={(tag.subsystems as unknown as { id: string }).id}
                tagItrs={tagItrs}
                templates={templates}
                orgMembers={orgMembers}
                canEdit={canEdit}
              />
            )}
            {activeTab === 'punches'      && <EmptyTab icon="⚑" title="Sin punches registrados" message="Los punches se generarán durante la ejecución de ITRs o manualmente." />}
            {activeTab === 'docs'         && <DocsTab tag={tag} pidSignedUrl={pidSignedUrl} />}
            {activeTab === 'preservation' && <EmptyTab icon="◉" title="Sin plan de preservación" message="El plan de preservación se activará cuando el equipo requiera rutinas de mantenimiento preventivo." />}
          </>
        )}
      </div>

    </div>
  )
}

// ── Overview Tab ─────────────────────────────────────────────────

function OverviewTab({ tag, area, sys, sub, pidSignedUrl }: {
  tag: Tag
  area: Area | undefined
  sys: System | undefined
  sub: Subsystem | undefined
  pidSignedUrl: string | null
}) {
  const d = tag.disciplines

  const infoFields = [
    { label: 'Estado',      value: (STATUS[tag.status] ?? STATUS.not_started).label },
    { label: 'Disciplina',  value: `${d.code} — ${d.name}` },
    { label: 'Fabricante',  value: tag.manufacturer || '—' },
    { label: 'Modelo',      value: tag.model || '—' },
    { label: 'Serie (S/N)', value: tag.serial_number || '—' },
    { label: 'Preservación requerida', value: tag.preservation_required ? 'Sí' : 'No' },
  ]

  const locFields = [
    { label: 'Área',       value: area ? `${area.code} — ${area.name}` : '—' },
    { label: 'Sistema',    value: sys  ? `${sys.code} — ${sys.name}`   : '—' },
    { label: 'Subsistema', value: sub  ? `${sub.code} — ${sub.name}`   : '—' },
    { label: 'P&ID',       value: tag.pid_drawing || '—', link: pidSignedUrl ?? undefined },
  ]

  const isInst = INST_DISCIPLINES.includes(tag.disciplines.code)
  const hasEngParams = tag.range_min != null || tag.range_max != null || tag.datasheet_number || tag.revision ||
    (isInst && (tag.signal_type || (tag.sil_level && tag.sil_level !== 'None') || tag.io_address || tag.junction_box || tag.sp_h != null || tag.sp_hh != null || tag.sp_l != null || tag.sp_ll != null))

  const fmt = (v: number | null) => v != null ? String(v) : '—'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>

      {/* Equipment info */}
      <div style={cardStyle}>
        <p style={sectionLabel}>Información del equipo</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {infoFields.map((f, i) => (
            <div key={f.label} style={{
              display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px',
              padding: '10px 0',
              borderBottom: i < infoFields.length - 1 ? '1px solid #f1f5f9' : 'none',
            }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>{f.label}</span>
              <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 500 }}>{f.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Location */}
        <div style={cardStyle}>
          <p style={sectionLabel}>Ubicación en jerarquía</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {locFields.map((f, i) => (
              <div key={f.label} style={{
                display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px',
                padding: '10px 0',
                borderBottom: i < locFields.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>{f.label}</span>
                {f.link ? (
                  <a href={f.link} target="_blank" rel="noopener noreferrer" style={{
                    fontSize: '12px', color: '#2563eb', fontFamily: 'ui-monospace, monospace',
                    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px',
                  }}>
                    {f.value} <span style={{ opacity: 0.5, fontSize: '10px' }}>↗</span>
                  </a>
                ) : (
                  <span style={{
                    fontSize: '13px', color: f.value === '—' ? '#cbd5e1' : '#0f172a',
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
          <p style={sectionLabel}>Parámetros de ingeniería</p>
          {!hasEngParams ? (
            <div style={{ padding: '16px 0', textAlign: 'center', color: '#cbd5e1', fontSize: '13px' }}>
              Sin parámetros — usa &quot;Editar tag&quot; para agregar
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

              {/* Range */}
              {(tag.range_min != null || tag.range_max != null) && (
                <EngRow label="Rango">
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: '#0f172a' }}>
                    {fmt(tag.range_min)} – {fmt(tag.range_max)}
                    {tag.eng_unit && <span style={{ marginLeft: '6px', color: '#64748b' }}>{tag.eng_unit}</span>}
                  </span>
                </EngRow>
              )}

              {/* Setpoints — instruments only */}
              {isInst && (tag.sp_hh != null || tag.sp_h != null || tag.sp_l != null || tag.sp_ll != null) && (
                <EngRow label="Setpoints">
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {tag.sp_hh != null && <SetpointPill label="HH" value={tag.sp_hh} unit={tag.eng_unit} color="#ef4444" />}
                    {tag.sp_h  != null && <SetpointPill label="H"  value={tag.sp_h}  unit={tag.eng_unit} color="#f97316" />}
                    {tag.sp_l  != null && <SetpointPill label="L"  value={tag.sp_l}  unit={tag.eng_unit} color="#3b82f6" />}
                    {tag.sp_ll != null && <SetpointPill label="LL" value={tag.sp_ll} unit={tag.eng_unit} color="#6366f1" />}
                  </div>
                </EngRow>
              )}

              {isInst && tag.signal_type && (
                <EngRow label="Tipo de señal">
                  <span style={{ fontSize: '13px', color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>{tag.signal_type}</span>
                </EngRow>
              )}

              {isInst && tag.sil_level && tag.sil_level !== 'None' && (
                <EngRow label="Nivel SIL">
                  <span style={{
                    padding: '2px 8px', borderRadius: '5px', fontSize: '12px', fontWeight: 700,
                    background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a',
                  }}>
                    {tag.sil_level}
                  </span>
                </EngRow>
              )}

              {isInst && tag.io_address && (
                <EngRow label="Dir. I/O">
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: '#0f172a' }}>{tag.io_address}</span>
                </EngRow>
              )}

              {isInst && tag.junction_box && (
                <EngRow label="Caja de juntas">
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: '#0f172a' }}>{tag.junction_box}</span>
                </EngRow>
              )}

              {!isInst && tag.datasheet_number && (
                <EngRow label="Datasheet">
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: '#0f172a' }}>{tag.datasheet_number}</span>
                </EngRow>
              )}

              {tag.revision && (
                <EngRow label="Revisión" last>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: '#0f172a' }}>{tag.revision}</span>
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
      <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>{label}</span>
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

function EditForm({ tag, projectId, onCancel }: {
  tag: Tag
  projectId: string
  onCancel: () => void
}) {
  const isInst = INST_DISCIPLINES.includes(tag.disciplines.code)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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
  })

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const toNum = (s: string) => s.trim() === '' ? null : parseFloat(s)

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
        <p style={sectionLabel}>Información básica</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '12px' }}>

          <FormField label="Descripción" style={{ gridColumn: '1 / -1' }}>
            <input style={inputStyle} value={form.description} onChange={e => set('description', e.target.value)} />
          </FormField>

          <FormField label="Fabricante">
            <input style={inputStyle} value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
          </FormField>

          <FormField label="Modelo">
            <input style={inputStyle} value={form.model} onChange={e => set('model', e.target.value)} />
          </FormField>

          <FormField label="Serie (S/N)">
            <input style={inputStyle} value={form.serial_number} onChange={e => set('serial_number', e.target.value)} />
          </FormField>

          <FormField label="Número de P&ID">
            <input style={inputStyle} placeholder="Ej: P-1001" value={form.pid_drawing} onChange={e => set('pid_drawing', e.target.value)} />
          </FormField>

          <FormField label="Estado">
            <select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="not_started">Sin iniciar</option>
              <option value="in_progress">En progreso</option>
              <option value="completed">Completado</option>
              <option value="on_hold">En espera</option>
            </select>
          </FormField>

          <FormField label="Preservación requerida">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '34px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.preservation_required}
                onChange={e => set('preservation_required', e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#3b82f6' }}
              />
              <span style={{ fontSize: '13px', color: '#475569' }}>Sí, requiere preservación</span>
            </label>
          </FormField>

        </div>
      </div>

      {/* Engineering parameters */}
      <div style={cardStyle}>
        <p style={sectionLabel}>Parámetros de ingeniería</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginTop: '12px' }}>

          <FormField label="Rango mínimo">
            <input style={inputStyle} type="number" placeholder="0" value={form.range_min} onChange={e => set('range_min', e.target.value)} />
          </FormField>

          <FormField label="Rango máximo">
            <input style={inputStyle} type="number" placeholder="100" value={form.range_max} onChange={e => set('range_max', e.target.value)} />
          </FormField>

          <FormField label="Unidad de ingeniería">
            <input style={inputStyle} placeholder="Ej: mmH2O, bar, °C, kV" value={form.eng_unit} onChange={e => set('eng_unit', e.target.value)} />
          </FormField>

          {!isInst && (
            <FormField label="Datasheet (código)">
              <input style={inputStyle} placeholder="Ej: DS-P-762802A" value={form.datasheet_number} onChange={e => set('datasheet_number', e.target.value)} />
            </FormField>
          )}

          <FormField label="Revisión doc.">
            <input style={inputStyle} placeholder="Ej: Rev. C" value={form.revision} onChange={e => set('revision', e.target.value)} />
          </FormField>

        </div>

        {/* Instrument-only fields */}
        {isInst && (
          <>
            <div style={{ margin: '20px 0 14px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Instrumentación
              </span>
              <span style={{ fontSize: '11px', color: '#cbd5e1' }}>Setpoints · Señal · SIL</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>

              <FormField label="Setpoint HH (Alta-Alta)">
                <input style={inputStyle} type="number" placeholder="—" value={form.sp_hh} onChange={e => set('sp_hh', e.target.value)} />
              </FormField>

              <FormField label="Setpoint H (Alta)">
                <input style={inputStyle} type="number" placeholder="—" value={form.sp_h} onChange={e => set('sp_h', e.target.value)} />
              </FormField>

              <FormField label="Setpoint L (Baja)">
                <input style={inputStyle} type="number" placeholder="—" value={form.sp_l} onChange={e => set('sp_l', e.target.value)} />
              </FormField>

              <FormField label="Setpoint LL (Baja-Baja)">
                <input style={inputStyle} type="number" placeholder="—" value={form.sp_ll} onChange={e => set('sp_ll', e.target.value)} />
              </FormField>

              <FormField label="Tipo de señal">
                <select style={inputStyle} value={form.signal_type} onChange={e => set('signal_type', e.target.value)}>
                  <option value="">— Sin definir —</option>
                  {SIGNAL_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>

              <FormField label="Nivel SIL">
                <select style={inputStyle} value={form.sil_level} onChange={e => set('sil_level', e.target.value)}>
                  {SIL_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>

              <FormField label="Dirección I/O">
                <input style={inputStyle} placeholder="Ej: AI-100" value={form.io_address} onChange={e => set('io_address', e.target.value)} />
              </FormField>

              <FormField label="Caja de juntas">
                <input style={inputStyle} placeholder="Ej: JB-101A" value={form.junction_box} onChange={e => set('junction_box', e.target.value)} />
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
            padding: '9px 20px', background: 'white', border: '1px solid #e2e8f0',
            borderRadius: '8px', fontSize: '13px', color: '#64748b', cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          style={{
            padding: '9px 20px', background: isPending ? '#93c5fd' : '#3b82f6', border: 'none',
            borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'white',
            cursor: isPending ? 'not-allowed' : 'pointer',
          }}
        >
          {isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

    </div>
  )
}

function FormField({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

// ── Docs Tab ─────────────────────────────────────────────────────

function DocsTab({ tag, pidSignedUrl }: { tag: Tag; pidSignedUrl: string | null }) {
  if (!tag.pid_drawing) {
    return (
      <EmptyTab
        icon="📄"
        title="Sin documentos vinculados"
        message="Este tag no tiene un P&ID de referencia asignado. Puedes editarlo para agregarlo."
      />
    )
  }

  return (
    <div>
      <p style={sectionLabel}>Documentos P&amp;ID</p>
      <div style={{
        background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0',
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
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {pidSignedUrl ? 'Documento disponible' : 'Documento aún no subido'}
              </div>
            </div>
          </div>
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
              Ver PDF ↗
            </a>
          ) : (
            <span style={{
              padding: '7px 16px', background: '#fef3c7', color: '#92400e',
              border: '1px solid #fde68a', borderRadius: '7px', fontSize: '12px',
            }}>
              PDF no subido
            </span>
          )}
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
      <p style={{ fontSize: '14px', fontWeight: 500, color: '#475569', margin: '0 0 6px' }}>{title}</p>
      <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, maxWidth: '360px', lineHeight: '1.5' }}>{message}</p>
    </div>
  )
}

// ── Shared styles ────────────────────────────────────────────────

const navBtn: React.CSSProperties = {
  padding: '6px 12px', background: 'white', border: '1px solid #e2e8f0',
  borderRadius: '7px', fontSize: '12px', color: '#475569',
  textDecoration: 'none', cursor: 'pointer',
}

const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '16px 18px',
}

const sectionLabel: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '7px',
  fontSize: '13px', color: '#0f172a', background: 'white', boxSizing: 'border-box',
  outline: 'none',
}
