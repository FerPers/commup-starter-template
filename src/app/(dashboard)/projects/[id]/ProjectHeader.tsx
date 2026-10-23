'use client'

import { useId, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateProject, deleteProject, removeProjectClientLogo, uploadProjectClientLogo } from '@/app/actions/projects'
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS } from '@/lib/time/zone'
import type { ProjectStatus } from '@/types/database'
import { DialogSurface } from '@/components/ui/dialog-a11y'

const STATUS_OPTIONS: readonly ProjectStatus[] = ['planning', 'active', 'on_hold', 'completed', 'cancelled']

const STATUS_STYLE: Record<string, { color: string }> = {
  planning:  { color: '#6366f1' },
  active:    { color: '#10b981' },
  on_hold:   { color: '#f59e0b' },
  completed: { color: '#3b82f6' },
  cancelled: { color: 'var(--gray-400)' },
}

interface ProjectData {
  id: string
  name: string
  code: string
  status: string
  client: string | null
  location: string | null
  country: string | null
  region: string | null
  start_date: string | null
  end_date: string | null
  timezone?: string | null
  client_logo_url?: string | null
}

interface Props {
  project: ProjectData
  canEdit: boolean
  canDelete: boolean
  /** E2: subir el logo del cliente (owner/admin, como el logo de la org). */
  canBrand: boolean
}

export default function ProjectHeader({ project: initial, canEdit, canDelete, canBrand }: Props) {
  const [project, setProject] = useState(initial)
  const [showModal, setShowModal] = useState(false)
  const titleId = useId()
  const uid = useId()
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const t = useTranslations('ProjectHeader')
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Form state
  const [name, setName] = useState(initial.name)
  const [code, setCode] = useState(initial.code)
  const [status, setStatus] = useState<ProjectStatus>(initial.status as ProjectStatus)
  const [country, setCountry] = useState(initial.country ?? '')
  const [region, setRegion] = useState(initial.region ?? '')
  const [startDate, setStartDate] = useState(initial.start_date?.slice(0, 10) ?? '')
  const [endDate, setEndDate] = useState(initial.end_date?.slice(0, 10) ?? '')
  const [timezone, setTimezone] = useState(initial.timezone ?? DEFAULT_TIMEZONE)
  const [client, setClient] = useState(initial.client ?? '')
  const logoInput = useRef<HTMLInputElement>(null)

  const statusStyle = STATUS_STYLE[project.status] ?? STATUS_STYLE.planning
  const statusLabel = (STATUS_OPTIONS as readonly string[]).includes(project.status) ? t(`status.${project.status as ProjectStatus}`) : project.status

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteProject(project.id)
      if (result.error) {
        setError(result.error)
        setShowDeleteConfirm(false)
        return
      }
      router.replace('/projects')
      router.refresh()
    })
  }

  function handleOpen() {
    setName(project.name)
    setCode(project.code)
    setStatus(project.status as ProjectStatus)
    setCountry(project.country ?? '')
    setRegion(project.region ?? '')
    setStartDate(project.start_date?.slice(0, 10) ?? '')
    setEndDate(project.end_date?.slice(0, 10) ?? '')
    setTimezone(project.timezone ?? DEFAULT_TIMEZONE)
    setClient(project.client ?? '')
    setError(null)
    setShowModal(true)
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await updateProject(project.id, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        status,
        country: country.trim() || null,
        region: region.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        timezone,
        client: client.trim() || null,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setProject(prev => ({
        ...prev,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        status,
        country: country.trim() || null,
        region: region.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        timezone,
        client: client.trim() || null,
      }))
      setShowModal(false)
    })
  }

  // E2: el logo se guarda al elegirlo (no espera a «Guardar»), como el logo de la org.
  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    setError(null)
    startTransition(async () => {
      const res = await uploadProjectClientLogo(project.id, fd)
      if (res.error) setError(res.error)
      else if (res.url) setProject(prev => ({ ...prev, client_logo_url: res.url }))
    })
  }

  function handleRemoveLogo() {
    setError(null)
    startTransition(async () => {
      const res = await removeProjectClientLogo(project.id)
      if (res.error) setError(res.error)
      else setProject(prev => ({ ...prev, client_logo_url: null }))
    })
  }

  return (
    <>
      {/* Back + Header */}
      <div style={{ marginBottom: '28px' }}>
        <Link href="/projects" style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '16px',
        }}>
          ← {t('back')}
        </Link>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '14px',
              background: '#3b82f615', border: '1px solid #3b82f625',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 700, color: '#3b82f6', flexShrink: 0,
            }}>
              {project.code.slice(0, 6)}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.5px', margin: 0 }}>
                  {project.name}
                </h1>
                <span style={{
                  padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                  background: `${statusStyle.color}18`, color: statusStyle.color,
                  border: `1px solid ${statusStyle.color}30`,
                }}>
                  {statusLabel}
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {project.client_logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- logo del bucket público, tamaño fijo; next/image no aporta aquí
                  <img src={project.client_logo_url} alt={t('clientLogoAlt', { client: project.client ?? '' })} style={{ height: 22, maxWidth: 90, objectFit: 'contain' }} />
                )}
                {[project.country && [project.country, project.region].filter(Boolean).join(' / '), project.client, project.location].filter(Boolean).join(' · ') || t('noClientLocation')}
              </p>
            </div>
          </div>

          {canEdit && (
            <button
              onClick={handleOpen}
              style={{
                padding: '9px 18px', background: 'var(--card-bg)', border: '1px solid var(--border)',
                borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {t('edit')}
            </button>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showModal && (
        <div
          role="presentation"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
          }}
        >
          <DialogSurface onClose={() => setShowModal(false)} labelledBy={titleId}
            style={{
              background: 'var(--card-bg)', borderRadius: '14px', width: '100%', maxWidth: '480px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              // E2: con Cliente y Logo el formulario ya no cabe en pantallas bajas: se desplaza dentro.
              maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto',
            }}
          >
            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id={titleId} style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)' }}>{t('edit')}</h2>
              <button onClick={() => setShowModal(false)} aria-label={t('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: '20px', padding: 0 }}>×</button>
            </div>

            {/* Form */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Field label={t('f.name')} htmlFor={`${uid}-name`}>
                <input id={`${uid}-name`}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={inputStyle}
                  placeholder={t('f.namePh')}
                />
              </Field>
              <Field label={t('f.code')} htmlFor={`${uid}-code`}>
                <input id={`${uid}-code`}
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  style={inputStyle}
                  placeholder="COD-001"
                />
              </Field>
              <Field label={t('f.client')} htmlFor={`${uid}-client`}>
                <input id={`${uid}-client`} value={client} onChange={e => setClient(e.target.value)} style={inputStyle} placeholder={t('f.clientPh')} />
              </Field>
              {canBrand && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{t('f.clientLogo')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {project.client_logo_url
                      // eslint-disable-next-line @next/next/no-img-element -- vista previa del logo del bucket público
                      ? <img src={project.client_logo_url} alt={t('clientLogoAlt', { client: client || project.name })} style={{ height: 40, maxWidth: 140, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 6, padding: 4, background: '#ffffff' }} />
                      : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('clientLogoNone')}</span>}
                    <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogo} style={{ display: 'none' }} aria-label={t('f.clientLogo')} />
                    <button type="button" onClick={() => logoInput.current?.click()} disabled={isPending}
                      style={{ minHeight: 36, padding: '0 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--text-strong)', cursor: 'pointer' }}>
                      {project.client_logo_url ? t('clientLogoReplace') : t('clientLogoUpload')}
                    </button>
                    {project.client_logo_url && (
                      <button type="button" onClick={handleRemoveLogo} disabled={isPending}
                        style={{ minHeight: 36, padding: '0 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--danger-700)', cursor: 'pointer' }}>
                        {t('clientLogoRemove')}
                      </button>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('clientLogoHint')}</span>
                </div>
              )}
              <Field label={t('f.status')} htmlFor={`${uid}-status`}>
                <select id={`${uid}-status`} value={status} onChange={e => setStatus(e.target.value as ProjectStatus)} style={inputStyle}>
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{t(`status.${s}`)}</option>
                  ))}
                </select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label={t('f.country')} htmlFor={`${uid}-country`}>
                  <input id={`${uid}-country`} value={country} onChange={e => setCountry(e.target.value)} placeholder="Colombia" style={inputStyle} />
                </Field>
                <Field label={t('f.region')} htmlFor={`${uid}-region`}>
                  <input id={`${uid}-region`} value={region} onChange={e => setRegion(e.target.value)} placeholder="Llanos" style={inputStyle} />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label={t('f.start')} htmlFor={`${uid}-start`}>
                  <input id={`${uid}-start`} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
                </Field>
                <Field label={t('f.end')} htmlFor={`${uid}-end`}>
                  <input id={`${uid}-end`} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
                </Field>
              </div>
              {/* S10 (D12): define «hoy» y el corte del día en reportes, relevos, snapshots y vencimientos */}
              <Field label={t('f.timezone')} htmlFor={`${uid}-timezone`}>
                <select id={`${uid}-timezone`} value={timezone} onChange={e => setTimezone(e.target.value)} style={inputStyle}>
                  {(TIMEZONE_OPTIONS as readonly string[]).includes(timezone) ? null : <option value={timezone}>{timezone}</option>}
                  {TIMEZONE_OPTIONS.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </Field>

              {error && (
                <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', fontSize: '13px', color: '#dc2626' }}>
                  {error}
                </div>
              )}
            </div>

            {/* Danger zone — owner only */}
            {canDelete && (
              <div style={{ margin: '0 24px 4px', borderTop: '1px solid #fee2e2', paddingTop: '14px' }}>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    style={{
                      width: '100%', padding: '8px 12px', background: 'var(--card-bg)',
                      border: '1px solid #fecaca', borderRadius: '7px',
                      fontSize: '12px', color: '#dc2626', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    {t('delete')}
                  </button>
                ) : (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px' }}>
                    <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#991b1b', fontWeight: 500 }}>
                      {t.rich('deleteWarning', { strong: chunks => <strong>{chunks}</strong> })}
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
                        {isPending ? t('deleting') : t('confirmDelete')}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isPending}
                        style={{
                          padding: '7px 12px', background: 'var(--card-bg)', color: 'var(--text-muted)',
                          border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                        }}
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ padding: '9px 18px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={isPending || !name.trim() || !code.trim()}
                style={{
                  padding: '9px 18px', background: isPending ? '#93c5fd' : '#3b82f6',
                  border: 'none', borderRadius: '8px', fontSize: '13px', color: '#fff',
                  cursor: isPending ? 'not-allowed' : 'pointer', fontWeight: 500,
                }}
              >
                {isPending ? t('saving') : t('save')}
              </button>
            </div>
          </DialogSurface>
        </div>
      )}
    </>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
  borderRadius: '7px', fontSize: '13px', color: 'var(--text-strong)', outline: 'none',
  boxSizing: 'border-box', background: 'var(--card-bg)',
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label htmlFor={htmlFor} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}
