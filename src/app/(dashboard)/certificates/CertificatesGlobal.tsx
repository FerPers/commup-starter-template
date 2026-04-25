'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { Button, Input, Select, EmptyState } from '@/components/ui'

const PAGE_SIZE = 50

type Project = { id: string; name: string; code: string }
type Phase   = { id: string; code: string; name: string; color: string; certificate_name: string | null }

type Certificate = {
  id: string
  certificate_number: string
  title: string
  status: 'pending' | 'in_review' | 'issued' | 'rejected'
  issued_date: string | null
  project_id: string
  projects: { id: string; name: string; code: string } | null
  project_phases: { id: string; code: string; name: string; color: string; certificate_name: string | null } | null
  subsystems: { id: string; code: string; name: string; systems: { code: string; name: string } } | null
}

const STATUS_STYLE = {
  pending:   { color: 'var(--gray-500)',    bg: 'var(--gray-100)' },
  in_review: { color: 'var(--primary-500)', bg: 'var(--primary-50)' },
  issued:    { color: 'var(--success-500)', bg: 'var(--success-50)' },
  rejected:  { color: 'var(--danger-500)',  bg: 'var(--danger-50)' },
} as const

const GRID = '100px 130px 1fr 1fr 80px 100px 90px'

export default function CertificatesGlobal({
  projects,
  certificates,
  phases,
}: {
  projects: Project[]
  certificates: Certificate[]
  phases: Phase[]
}) {
  const t  = useTranslations('Certificates')
  const tC = useTranslations('Common')

  const [search, setSearch]               = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterPhase, setFilterPhase]     = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [page, setPage]                   = useState(1)

  const issuedCnt   = certificates.filter(c => c.status === 'issued').length
  const pendingCnt  = certificates.filter(c => c.status === 'pending').length
  const reviewCnt   = certificates.filter(c => c.status === 'in_review').length
  const rejectedCnt = certificates.filter(c => c.status === 'rejected').length

  const filtered = useMemo(() => certificates.filter(c => {
    if (filterProject && c.project_id !== filterProject) return false
    if (filterPhase && c.project_phases?.code !== filterPhase) return false
    if (filterStatus && c.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !c.certificate_number.toLowerCase().includes(q) &&
        !c.title.toLowerCase().includes(q) &&
        !(c.subsystems?.code ?? '').toLowerCase().includes(q) &&
        !(c.projects?.name ?? '').toLowerCase().includes(q)
      ) return false
    }
    return true
  }), [certificates, filterProject, filterPhase, filterStatus, search])

  const hasFilters = filterProject || filterPhase || filterStatus || search

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const summaryCards: { key: 'issued' | 'in_review' | 'pending' | 'rejected'; count: number }[] = [
    { key: 'issued',    count: issuedCnt   },
    { key: 'in_review', count: reviewCnt   },
    { key: 'pending',   count: pendingCnt  },
    { key: 'rejected',  count: rejectedCnt },
  ]

  const statusLabels: Record<string, string> = {
    pending:   t('status.pending'),
    in_review: t('status.in_review'),
    issued:    t('status.issued'),
    rejected:  t('status.rejected'),
  }

  const summaryLabels: Record<string, string> = {
    issued:    t('summary.issued'),
    in_review: t('summary.in_review'),
    pending:   t('summary.pending'),
    rejected:  t('summary.rejected'),
  }

  return (
    <div style={{ padding: 32, maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 4px' }}>{t('title')}</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>{t('subtitle')}</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        {summaryCards.map(({ key, count }) => {
          const style = STATUS_STYLE[key]
          const active = filterStatus === key
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(active ? '' : key)}
              aria-pressed={active}
              style={{
                padding: '14px 16px', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                background: active ? style.bg : 'var(--card-bg)',
                border: `1px solid ${active ? `${style.color}40` : 'var(--border)'}`,
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: style.color }}>{count}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{summaryLabels[key]}</div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          inputSize="sm"
          fullWidth={false}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('filters.search')}
          leftIcon={<Search size={14} />}
          wrapperStyle={{ width: 260 }}
        />
        <Select selectSize="sm" fullWidth={false} value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={{ width: 200 }}>
          <option value="">{t('filters.allProjects')}</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </Select>
        <Select selectSize="sm" fullWidth={false} value={filterPhase} onChange={(e) => setFilterPhase(e.target.value)} style={{ width: 200 }}>
          <option value="">{t('filters.allPhases')}</option>
          {phases.map(ph => <option key={ph.id} value={ph.code}>{ph.code} — {ph.certificate_name ?? ph.name}</option>)}
        </Select>
        {hasFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setFilterProject(''); setFilterPhase(''); setFilterStatus(''); setSearch(''); setPage(1) }}
          >
            {tC('clearFilters')}
          </Button>
        )}
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-400)', marginLeft: 'auto' }}>
          {t('filters.count', { filtered: filtered.length, total: certificates.length })}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <EmptyState title={t('empty')} />
        </div>
      ) : (
        <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '10px 16px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border)', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>{t('table.colProject')}</span>
            <span>{t('table.colNumber')}</span>
            <span>{t('table.colTitle')}</span>
            <span>{t('table.colSubsystem')}</span>
            <span>{t('table.colPhase')}</span>
            <span>{t('table.colIssued')}</span>
            <span>{t('table.colStatus')}</span>
          </div>

          {paginated.map(cert => {
            const st    = STATUS_STYLE[cert.status]
            const proj  = cert.projects
            const phase = cert.project_phases
            const ss    = cert.subsystems

            return (
              <div
                key={cert.id}
                style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--gray-50)', alignItems: 'center' }}
              >
                {/* Proyecto */}
                <div>
                  {proj && (
                    <a
                      href={`/projects/${proj.id}/certificates`}
                      title={proj.name}
                      style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary-500)', background: 'var(--primary-50)', padding: '2px 7px', borderRadius: 'var(--radius-sm)', textDecoration: 'none', display: 'inline-block', maxWidth: 94, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {proj.code}
                    </a>
                  )}
                </div>

                {/* N° Certificado */}
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>
                  {cert.certificate_number}
                </div>

                {/* Título */}
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cert.title}
                </div>

                {/* Subsistema */}
                <div>
                  {ss && (
                    <>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'ui-monospace, monospace' }}>{ss.code}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{ss.systems?.code} — {ss.name}</div>
                    </>
                  )}
                </div>

                {/* Fase */}
                <div>
                  {phase && (
                    <span style={{ padding: '2px 7px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', fontWeight: 700, background: `${phase.color}18`, color: phase.color }}>
                      {phase.code}
                    </span>
                  )}
                </div>

                {/* Fecha emisión */}
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {cert.issued_date ?? '—'}
                </div>

                {/* Estado */}
                <span style={{ padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                  {statusLabels[cert.status]}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20, alignItems: 'center' }}>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>{tC('prevPage')}</Button>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{tC('page', { page, total: totalPages })}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{tC('nextPage')}</Button>
        </div>
      )}
    </div>
  )
}
