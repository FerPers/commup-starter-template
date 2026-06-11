'use client'

import { useTranslations } from 'next-intl'
import { sectionLabel, type Tag } from './tag-detail-shared'

export default function TagDocsTab({ tag, pidSignedUrl, pidDocId, projectId }: { tag: Tag; pidSignedUrl: string | null; pidDocId: string | null; projectId: string }) {
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
