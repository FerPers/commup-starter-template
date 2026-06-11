'use client'

import { useTranslations } from 'next-intl'
import NfcSection from './NfcSection'
import { INST_DISCIPLINES, cardStyle, sectionLabel, type Area, type Subsystem, type System, type Tag } from './tag-detail-shared'

export default function TagOverviewTab({ tag, area, sys, sub, pidSignedUrl, projectId, canEdit }: {
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
