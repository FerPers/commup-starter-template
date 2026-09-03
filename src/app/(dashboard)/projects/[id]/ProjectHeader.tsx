'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updateProject, deleteProject } from '@/app/actions/projects'
import type { ProjectStatus } from '@/types/database'

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'planning',  label: 'Planificación' },
  { value: 'active',    label: 'Activo' },
  { value: 'on_hold',   label: 'En pausa' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
]

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
}

interface Props {
  project: ProjectData
  canEdit: boolean
  canDelete: boolean
}

export default function ProjectHeader({ project: initial, canEdit, canDelete }: Props) {
  const [project, setProject] = useState(initial)
  const [showModal, setShowModal] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
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

  const statusStyle = STATUS_STYLE[project.status] ?? STATUS_STYLE.planning
  const statusLabel = STATUS_OPTIONS.find(o => o.value === project.status)?.label ?? project.status

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
      }))
      setShowModal(false)
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
          ← Proyectos
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
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '4px 0 0' }}>
                {[project.country && [project.country, project.region].filter(Boolean).join(' / '), project.client, project.location].filter(Boolean).join(' · ') || 'Sin cliente / ubicación'}
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
              Editar proyecto
            </button>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card-bg)', borderRadius: '14px', width: '100%', maxWidth: '480px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)' }}>Editar proyecto</h2>
              <button onClick={() => setShowModal(false)} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: '20px', padding: 0 }}>×</button>
            </div>

            {/* Form */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Field label="Nombre">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={inputStyle}
                  placeholder="Nombre del proyecto"
                />
              </Field>
              <Field label="Código">
                <input
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  style={inputStyle}
                  placeholder="COD-001"
                />
              </Field>
              <Field label="Estado">
                <select value={status} onChange={e => setStatus(e.target.value as ProjectStatus)} style={inputStyle}>
                  {STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="País">
                  <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Colombia" style={inputStyle} />
                </Field>
                <Field label="Región / Eje">
                  <input value={region} onChange={e => setRegion(e.target.value)} placeholder="Llanos" style={inputStyle} />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Fecha inicio">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Fecha fin">
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
                </Field>
              </div>

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
                    Eliminar proyecto…
                  </button>
                ) : (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px' }}>
                    <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#991b1b', fontWeight: 500 }}>
                      Esta acción eliminará el proyecto y <strong>todos sus datos</strong> (tags, ITRs, punches, certificados, P&IDs). Es irreversible.
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
                        {isPending ? 'Eliminando…' : 'Confirmar eliminación'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isPending}
                        style={{
                          padding: '7px 12px', background: 'var(--card-bg)', color: 'var(--text-muted)',
                          border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                        }}
                      >
                        Cancelar
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
                Cancelar
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
                {isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}
