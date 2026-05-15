'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ClipboardCheck, Flag, Wrench } from 'lucide-react'
import type { ConsolidatedTagPhoto, TagPhotoSource } from '@/lib/tag-photos'

const NON_PREVIEWABLE_EXT = ['heic', 'heif']

const SOURCE_CFG: Record<TagPhotoSource, { color: string; bg: string; border: string; icon: typeof ClipboardCheck }> = {
  itr:          { color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: ClipboardCheck },
  punch:        { color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', icon: Flag },
  preservation: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: Wrench },
}

interface Props {
  photos: ConsolidatedTagPhoto[]
}

export default function TagPhotosTab({ photos }: Props) {
  const t = useTranslations('Tags.photosTab')
  const [filter, setFilter] = useState<TagPhotoSource | 'all'>('all')

  const counts = useMemo(() => ({
    all: photos.length,
    itr: photos.filter(p => p.source === 'itr').length,
    punch: photos.filter(p => p.source === 'punch').length,
    preservation: photos.filter(p => p.source === 'preservation').length,
  }), [photos])

  const displayed = filter === 'all' ? photos : photos.filter(p => p.source === filter)

  if (photos.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📷</div>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-700)', margin: '0 0 6px' }}>
          {t('emptyTitle')}
        </p>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', margin: 0 }}>
          {t('emptyMsg')}
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Source filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label={t('filterAll')} count={counts.all} />
        <FilterPill active={filter === 'itr'} onClick={() => setFilter('itr')} label={t('sourceItr')} count={counts.itr} cfg={SOURCE_CFG.itr} />
        <FilterPill active={filter === 'punch'} onClick={() => setFilter('punch')} label={t('sourcePunch')} count={counts.punch} cfg={SOURCE_CFG.punch} />
        <FilterPill active={filter === 'preservation'} onClick={() => setFilter('preservation')} label={t('sourcePreservation')} count={counts.preservation} cfg={SOURCE_CFG.preservation} />
      </div>

      {displayed.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 20px' }}>
          {t('emptyFilter')}
        </p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 10,
        }}>
          {displayed.map(photo => (
            <PhotoCard key={`${photo.source}-${photo.id}`} photo={photo} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterPill({
  active, onClick, label, count, cfg,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  cfg?: { color: string; bg: string; border: string }
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: 12, fontWeight: 600,
        border: '1px solid',
        background: active ? (cfg?.bg ?? 'var(--gray-700)') : 'var(--card-bg)',
        color: active ? (cfg?.color ?? '#fff') : 'var(--text-muted)',
        borderColor: active ? (cfg?.border ?? 'var(--gray-700)') : 'var(--border)',
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
    >
      {label}
      <span style={{
        padding: '1px 6px',
        borderRadius: 999,
        fontSize: 11,
        background: active ? 'rgba(0,0,0,0.08)' : 'var(--gray-100)',
        color: active ? (cfg?.color ?? '#fff') : 'var(--gray-400)',
      }}>
        {count}
      </span>
    </button>
  )
}

function PhotoCard({ photo }: { photo: ConsolidatedTagPhoto }) {
  const t = useTranslations('Tags.photosTab')
  const cfg = SOURCE_CFG[photo.source]
  const Icon = cfg.icon
  const previewable = !NON_PREVIEWABLE_EXT.includes(photo.ext)
  const sourceLabel = photo.source === 'preservation' ? t('sourcePreservation') : photo.source_label

  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <a
        href={photo.signed_url ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'block', aspectRatio: '1 / 1', background: 'var(--gray-100)' }}
      >
        {previewable && photo.signed_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL 1h TTL; Image optimizer would cache stale
          <img
            src={photo.signed_url}
            alt={sourceLabel}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace',
          }}>
            {photo.ext.toUpperCase() || 'FILE'}
          </div>
        )}
      </a>
      <a
        href={photo.source_href}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 8px',
          background: cfg.bg, color: cfg.color,
          borderTop: `1px solid ${cfg.border}`,
          fontSize: 11, fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        <Icon size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sourceLabel}
        </span>
      </a>
    </div>
  )
}
