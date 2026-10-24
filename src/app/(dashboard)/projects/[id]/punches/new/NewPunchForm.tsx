'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createPunch } from '@/app/actions/punches'
import { searchProjectTags, type TagSearchHit } from '@/app/actions/tag-search'
import { PunchImpactAndGuide } from '@/components/punch/PunchCategoryGuide'
import type { PunchImpact } from '@/lib/punches/category-guide'
import type { TagContext } from '@/lib/create/tag-context'
import { PUNCH_CATEGORY_CFG as CATEGORY_CFG } from '@/lib/constants/status-colors'
import { ink, alpha } from '@/lib/theme'

// N3b: el formulario de alta de punch en su página (lo que antes era la ventana de la lista y del tag).

type Props = {
  project: { id: string; code: string; name: string }
  initialTag: TagContext | null
  assignees: { user_id: string; full_name: string }[]
  back: string | null
}

type Picked = TagSearchHit & { where?: string | null }

export default function NewPunchForm({ project, initialTag, assignees, back }: Props) {
  const t = useTranslations('PunchList')
  const tGuide = useTranslations('PunchGuide')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [tag, setTag] = useState<Picked | null>(() => initialTag ? {
    id: initialTag.id, tag_number: initialTag.tagNumber, description: initialTag.description ?? '', disciplines: initialTag.discipline,
    where: [initialTag.systemCode, initialTag.subsystemCode].filter(Boolean).join(' › ') || null,
  } : null)
  const [tagSearch, setTagSearch] = useState('')
  const [tagMatches, setTagMatches] = useState<TagSearchHit[]>([])
  const [category, setCategory] = useState<'A' | 'B' | 'C'>('B')
  const [impact, setImpact] = useState<PunchImpact | null>(null)
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'critical' | 'major' | 'minor'>('major')
  const [assignedTo, setAssignedTo] = useState('')
  const [targetDate, setTargetDate] = useState('')

  // Sprint E: los tags se buscan en servidor (máx. 50). Solo mientras no hay uno elegido.
  useEffect(() => {
    if (tag) return
    let cancelled = false
    const handle = setTimeout(async () => {
      const res = await searchProjectTags({ projectId: project.id, q: tagSearch })
      if (!cancelled && res.tags) setTagMatches(res.tags)
    }, 250)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [tag, tagSearch, project.id])

  const cancelHref = back ?? `/projects/${project.id}/punches`
  // Desde la ficha de un tag se vuelve a su pestaña de punch (el nuevo queda a la vista); desde otra pantalla se abre el punch.
  const returnsToTag = !!back && /^\/projects\/[^/]+\/tags\/[^/?]+\?tab=punches$/.test(back)
  const canSubmit = !!tag && !!description.trim() && !!impact && !isPending

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!tag) { setError(t('create.tagRequired')); return }
    if (!impact) { setError(tGuide('impactRequired')); return }
    if (!description.trim()) { setError(t('create.descriptionRequired')); return }
    startTransition(async () => {
      const res = await createPunch({
        projectId: project.id, tagId: tag.id, category, impact, description: description.trim(),
        assignedTo: assignedTo || null, targetDate: targetDate || null, priority,
      })
      if (res.error || !res.punchId) { setError(res.error ?? t('create.failed')); return }
      router.push(returnsToTag ? back : `/projects/${project.id}/punches/${res.punchId}`)
    })
  }

  return (
    <form onSubmit={submit} style={{ padding: 32, maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Link href={cancelHref} style={{ fontSize: 13, color: 'var(--primary-700)', textDecoration: 'none' }}>
          ← {back ? t('create.back') : t('create.backToList')}
        </Link>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-strong)', margin: '8px 0 0' }}>{t('create.modalTitle')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{project.code} · {t('create.pageHelp')}</p>
      </div>

      <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Tag */}
        <div style={{ position: 'relative' }}>
          <label htmlFor="punch-tag" style={labelStyle}>{t('create.labelTag')}</label>
          {tag ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--gray-50)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: ink(tag.disciplines?.color ?? 'var(--text-strong)') }}>{tag.tag_number}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, minWidth: 120 }}>{tag.description}</span>
              {(tag.disciplines?.code ?? tag.where) && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{[tag.disciplines?.code, tag.where].filter(Boolean).join(' · ')}</span>
              )}
              <button type="button" onClick={() => { setTag(null); setTagSearch('') }} style={linkBtn}>{t('create.changeTag')}</button>
            </div>
          ) : (
            <>
              <input
                id="punch-tag" type="search" autoComplete="off" value={tagSearch} onChange={e => setTagSearch(e.target.value)}
                placeholder={t('create.tagPlaceholder')} style={inputStyle}
              />
              {tagMatches.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, border: '1px solid var(--border)', borderRadius: 8, maxHeight: 240, overflowY: 'auto', background: 'var(--card-bg)' }}>
                  {tagMatches.map(tg => (
                    <li key={tg.id}>
                      <button type="button" onClick={() => setTag(tg)} style={{ display: 'flex', gap: 8, width: '100%', textAlign: 'left', padding: '10px 11px', minHeight: 44, background: 'none', border: 'none', borderBottom: '1px solid var(--gray-50)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: ink(tg.disciplines?.color ?? 'var(--text-strong)') }}>{tg.tag_number}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tg.description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Categoría */}
        <div>
          <div style={labelStyle}>{t('create.labelCategory')}</div>
          <div style={{ display: 'flex', gap: 8 }} role="group" aria-label={t('create.labelCategory')}>
            {(['A', 'B', 'C'] as const).map(c => {
              const cfg = CATEGORY_CFG[c]
              const active = category === c
              return (
                <button key={c} type="button" aria-pressed={active} onClick={() => setCategory(c)} style={{
                  flex: 1, padding: '10px 8px', minHeight: 44, borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  background: active ? cfg.bg : 'var(--card-bg)', color: ink(active ? cfg.color : 'var(--text-muted)'),
                  border: `1px solid ${active ? alpha(cfg.color, 38) : 'var(--border)'}`, cursor: 'pointer',
                }}>
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Impacto obligatorio + guía de categorización (fase 4) */}
        <PunchImpactAndGuide impact={impact} onImpact={setImpact} category={category} onCategory={setCategory} disciplineCode={tag?.disciplines?.code ?? null} />

        <div>
          <label htmlFor="punch-desc" style={labelStyle}>{t('create.labelDescription')}</label>
          <textarea id="punch-desc" rows={3} value={description} onChange={e => setDescription(e.target.value)}
            placeholder={t('create.descriptionPlaceholder')} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label htmlFor="punch-priority" style={labelStyle}>{t('create.labelPriority')}</label>
            <select id="punch-priority" value={priority} onChange={e => setPriority(e.target.value as 'critical' | 'major' | 'minor')} style={inputStyle}>
              <option value="critical">{t('create.priority.critical')}</option>
              <option value="major">{t('create.priority.major')}</option>
              <option value="minor">{t('create.priority.minor')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="punch-date" style={labelStyle}>{t('create.labelTargetDate')}</label>
            <input id="punch-date" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="punch-assignee" style={labelStyle}>{t('create.labelAssignee')}</label>
            <select id="punch-assignee" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={inputStyle}>
              <option value="">{t('create.assigneePlaceholder')}</option>
              {assignees.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" style={{ fontSize: 12, color: 'var(--danger-700)', padding: '8px 12px', background: 'var(--danger-100)', borderRadius: 6, margin: 0 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Link href={cancelHref} style={{ padding: '10px 16px', minHeight: 44, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', background: 'var(--card-bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            {t('create.cancel')}
          </Link>
          <button type="submit" disabled={!canSubmit} style={{
            padding: '10px 18px', minHeight: 44, borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', fontFamily: 'inherit',
            background: canSubmit ? 'var(--primary-600)' : 'var(--gray-100)', color: canSubmit ? '#fff' : 'var(--text-muted)',
            cursor: canSubmit ? 'pointer' : 'default',
          }}>
            {isPending ? t('create.submitting') : t('create.submit')}
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{returnsToTag ? t('create.returnsBack') : t('create.opensPunch')}</p>
      </section>
    </form>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-body)', display: 'block', marginBottom: 6 }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
  boxSizing: 'border-box', background: 'var(--card-bg)', color: 'var(--text-strong)', minHeight: 40,
}
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--primary-700)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 4px', fontFamily: 'inherit' }
