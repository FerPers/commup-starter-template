'use client'

import { useTranslations, useLocale } from 'next-intl'
import { Card, Badge } from '@/components/ui'

export interface ProjectCardData {
  id: string; name: string; code: string
  location: string | null; client: string | null
  start_date: string | null; end_date: string | null; status: string
}

export interface PhaseData {
  id: string; code: string; name: string; color: string; order_index: number
}

export default function ProjectCard({ project, phases, inactive = false }: {
  project: ProjectCardData
  phases: PhaseData[]
  inactive?: boolean
}) {
  const t      = useTranslations('Projects')
  const locale = useLocale()

  const meta = [project.client, project.location].filter(Boolean).join(' · ')

  function formatDate(d: string | null) {
    if (!d) return null
    return new Date(d).toLocaleDateString(locale === 'es' ? 'es-CO' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <a href={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
      <Card padding="md" hoverable elevation="sm" style={{ opacity: inactive ? 0.65 : 1 }}>
        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-md)', flexShrink: 0,
              background: 'var(--primary-50)', border: '1px solid var(--primary-200)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--primary-500)', letterSpacing: '0.02em',
            }}>
              {project.code.slice(0, 6)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 'var(--text-base)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {project.name}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>
                {meta || t('card.noMeta')}
              </div>
            </div>
          </div>
          <Badge variant={inactive ? 'neutral' : 'success'} size="sm">
            {inactive ? t('card.inactive') : t('card.active')}
          </Badge>
        </div>

        {/* Phases */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {phases.map(phase => (
            <div key={phase.id} title={phase.name} style={{
              padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-xs)', fontWeight: 600,
              background: `${phase.color}15`, color: phase.color,
              border: `1px solid ${phase.color}30`,
            }}>
              {phase.code}
            </div>
          ))}
        </div>

        {/* Dates */}
        {(project.start_date || project.end_date) && (
          <div style={{ display: 'flex', gap: 16, paddingTop: 12, borderTop: '1px solid var(--gray-100)' }}>
            {project.start_date && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('card.start')}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-600)', marginTop: 2 }}>{formatDate(project.start_date)}</div>
              </div>
            )}
            {project.end_date && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('card.target')}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--gray-600)', marginTop: 2 }}>{formatDate(project.end_date)}</div>
              </div>
            )}
          </div>
        )}
      </Card>
    </a>
  )
}
