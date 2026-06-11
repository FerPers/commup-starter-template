'use client'

// Checklist de ítems del PSSR agrupado por categoría — extraído de
// PssrReviewForm.tsx (Q4). El estado de expansión es local; los cambios de
// estado/campos suben por callbacks.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { catColor, type ItemStatus, type ReviewItem } from './pssr-review-shared'

export default function PssrItemsChecklist({
  items,
  readonly,
  onStatusChange,
  onFieldSave,
}: {
  items: ReviewItem[]
  readonly: boolean
  onStatusChange: (item: ReviewItem, status: ItemStatus) => void
  onFieldSave: (item: ReviewItem, field: 'responsible' | 'actions' | 'completion_date', value: string) => void
}) {
  const t = useTranslations('PSSR')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  // Group items by category preserving order
  const grouped: [string, ReviewItem[]][] = []
  const catOrder: string[] = []
  for (const item of items) {
    if (!catOrder.includes(item.category)) catOrder.push(item.category)
  }
  for (const cat of catOrder) {
    grouped.push([cat, items.filter(i => i.category === cat)])
  }

  function toggleCat(cat: string) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  function toggleItem(itemId: string) {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId)
      return next
    })
  }

  function handleStatusClick(item: ReviewItem, status: ItemStatus) {
    // Detail editor only renders for si/no — collapse on transitions away
    if (status === 'na' || status === 'pending') {
      setExpandedItems(prev => {
        if (!prev.has(item.id)) return prev
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
    onStatusChange(item, status)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
      {grouped.map(([category, catItems]) => {
        const catResolved = catItems.filter(i => i.status === 'si' || i.status === 'na').length
        const catDone = catResolved === catItems.length
        const isExpanded = !expandedCats.has(category) // open by default

        return (
          <div key={category} style={{
            background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)',
            overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            {/* Category header — click to collapse */}
            <button
              onClick={() => toggleCat(category)}
              style={{
                width: '100%', textAlign: 'left', background: 'var(--gray-50)', border: 'none', cursor: 'pointer',
                padding: '14px 20px', borderLeft: `4px solid ${catColor(category)}`,
                display: 'flex', alignItems: 'center', gap: '10px',
              }}
            >
              <span style={{
                display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                background: catDone ? '#10b981' : catColor(category), flexShrink: 0,
              }} />
              <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-strong)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
                {category}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                {catResolved}/{catItems.length}
              </span>
              <span style={{ color: 'var(--gray-400)', fontSize: '14px', marginLeft: '4px' }}>
                {isExpanded ? '▾' : '▸'}
              </span>
            </button>

            {/* Items */}
            {isExpanded && catItems.map(item => {
              const isItemExpanded = expandedItems.has(item.id)
              const statusColors = {
                pending: { bg: 'var(--gray-100)', color: 'var(--text-muted)', border: 'var(--border)' },
                si:      { bg: '#ecfdf5', color: '#10b981', border: '#a7f3d0' },
                no:      { bg: '#fee2e2', color: '#ef4444', border: '#fecaca' },
                na:      { bg: 'var(--gray-50)', color: 'var(--gray-400)', border: 'var(--border)' },
              }
              const sc = statusColors[item.status]

              return (
                <div key={item.id} style={{
                  borderTop: '1px solid #f1f5f9',
                  borderLeft: `4px solid ${sc.border}`,
                  background: item.status === 'si' ? '#fafffe' : item.status === 'no' ? '#fffafa' : 'var(--card-bg)',
                }}>
                  {/* Item row */}
                  <div style={{ padding: '14px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    {/* Order */}
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-300)', paddingTop: '2px', flexShrink: 0, minWidth: '22px' }}>
                      {item.item_order}
                    </span>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--gray-700)', marginBottom: '3px' }}>
                        {item.element}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {item.requirement}
                      </div>
                      {item.notes_hint && (
                        <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '4px', fontStyle: 'italic' }}>
                          💡 {item.notes_hint}
                        </div>
                      )}

                      {/* Expand details toggle */}
                      {(item.status === 'si' || item.status === 'no') && (
                        <button
                          onClick={() => toggleItem(item.id)}
                          style={{
                            background: 'none', border: 'none', padding: '4px 0 0', cursor: 'pointer',
                            fontSize: '11px', color: '#3b82f6', fontWeight: 600,
                          }}
                        >
                          {isItemExpanded ? t('review.itemHideDetails') : t('review.itemShowDetails')}
                        </button>
                      )}

                      {/* Detail fields — only for si/no (toggle button matches) */}
                      {isItemExpanded && !readonly && (item.status === 'si' || item.status === 'no') && (
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <input
                            defaultValue={item.responsible ?? ''}
                            onBlur={e => onFieldSave(item, 'responsible', e.target.value)}
                            placeholder={t('review.responsiblePlaceholder')}
                            style={{
                              width: '100%', padding: '7px 10px', borderRadius: '6px',
                              border: '1px solid var(--border)', fontSize: '12px', outline: 'none',
                              boxSizing: 'border-box', fontFamily: 'inherit',
                            }}
                          />
                          <textarea
                            defaultValue={item.actions ?? ''}
                            onBlur={e => onFieldSave(item, 'actions', e.target.value)}
                            placeholder={t('review.actionsPlaceholder')}
                            rows={2}
                            style={{
                              width: '100%', padding: '7px 10px', borderRadius: '6px',
                              border: '1px solid var(--border)', fontSize: '12px', outline: 'none',
                              resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                            }}
                          />
                          <input
                            type="date"
                            defaultValue={item.completion_date ?? ''}
                            onBlur={e => onFieldSave(item, 'completion_date', e.target.value)}
                            style={{
                              width: '160px', padding: '7px 10px', borderRadius: '6px',
                              border: '1px solid var(--border)', fontSize: '12px', outline: 'none',
                              fontFamily: 'inherit',
                            }}
                          />
                        </div>
                      )}
                      {/* Read-only details */}
                      {(readonly || !isItemExpanded) && (item.responsible ?? item.actions) && item.status !== 'pending' && (
                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          {item.responsible && <span>👤 {item.responsible}</span>}
                          {item.responsible && item.actions && <span> · </span>}
                          {item.actions && <span>{item.actions}</span>}
                          {item.completion_date && <span> · {item.completion_date}</span>}
                        </div>
                      )}
                    </div>

                    {/* Status buttons */}
                    {!readonly && (
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        {(['si', 'no', 'na'] as ItemStatus[]).map(s => (
                          <button
                            key={s}
                            onClick={() => handleStatusClick(item, item.status === s ? 'pending' : s)}
                            style={{
                              padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                              border: '1.5px solid',
                              borderColor: item.status === s ? sc.border : 'var(--border)',
                              background: item.status === s ? sc.bg : 'var(--card-bg)',
                              color: item.status === s ? sc.color : 'var(--gray-400)',
                              cursor: 'pointer', transition: 'all 0.1s',
                              textTransform: 'uppercase',
                            }}
                          >
                            {s === 'si' ? t('review.yes') : s === 'no' ? t('review.no') : t('review.na')}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Read-only status */}
                    {readonly && (
                      <span style={{
                        padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                        background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                        flexShrink: 0, textTransform: 'uppercase',
                      }}>
                        {item.status === 'si' ? t('review.yes') : item.status === 'no' ? t('review.no') : item.status === 'na' ? t('review.na') : '—'}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
