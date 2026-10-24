'use client'

import { useId, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  proposeTranslations, saveTranslations,
  type TranslationReview, type TranslationItem, type TranslationFlag,
} from '@/app/actions/itr-translations'
import { ink } from '@/lib/theme'

// ── Revisión de traducción ES de una plantilla ITR ──────────────────────────
// Inglés y español lado a lado. La IA propone (faltantes / marcados / todo);
// cada línea se edita antes de guardar. Lo guardado desde aquí queda como
// revisado por una persona (source = human), salvo lo que se acepte tal cual
// de la IA sin tocar, que se guarda como 'ai' para poder auditarlo después.

const FLAG_STYLE: Record<TranslationFlag, { bg: string; color: string }> = {
  empty:            { bg: 'var(--danger-100)',  color: 'var(--danger-800)' },
  identical:        { bg: 'var(--warning-100)', color: 'var(--warning-800)' },
  anglicism:        { bg: 'var(--warning-100)', color: 'var(--warning-800)' },
  en_is_spanish:    { bg: 'var(--indigo-100)',  color: 'var(--indigo-800)' },
  not_translatable: { bg: 'var(--gray-100)',    color: 'var(--text-muted)' },
}

type Draft = { es: string; touched: boolean; fromAi: boolean }

export default function TranslationsView({ initial, aiEnabled }: { initial: TranslationReview; aiEnabled: boolean }) {
  const t = useTranslations('TemplateTranslations')
  const router = useRouter()
  const uid = useId()
  const [titleEs, setTitleEs] = useState(initial.template.title_es ?? '')
  const [titleFromAi, setTitleFromAi] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initial.items.map(i => [i.id, { es: i.description_es ?? '', touched: false, fromAi: false }])),
  )
  const [filter, setFilter] = useState<'all' | 'flagged' | 'empty' | 'ai'>('flagged')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const stats = useMemo(() => {
    const total = initial.items.filter(i => !i.flags.includes('not_translatable')).length
    const empty = initial.items.filter(i => i.flags.includes('empty')).length
    const flagged = initial.items.filter(i => i.flags.some(f => f === 'identical' || f === 'anglicism' || f === 'en_is_spanish')).length
    const ai = initial.items.filter(i => i.source === 'ai').length
    return { total, empty, flagged, ai }
  }, [initial.items])

  const visible = useMemo(() => initial.items.filter(i => {
    if (filter === 'all') return true
    if (filter === 'empty') return i.flags.includes('empty')
    if (filter === 'ai') return i.source === 'ai'
    return i.flags.some(f => f !== 'not_translatable')
  }), [initial.items, filter])

  const changed = useMemo(() => initial.items.filter(i => {
    const d = drafts[i.id]
    return d && (d.touched || d.fromAi) && d.es.trim() !== (i.description_es ?? '').trim()
  }), [initial.items, drafts])
  const titleChanged = titleEs.trim() !== (initial.template.title_es ?? '').trim()

  async function propose(mode: 'missing' | 'flagged' | 'all') {
    setBusy(mode); setError(null); setMsg(null)
    const res = await proposeTranslations(initial.template.id, mode)
    setBusy(null)
    if (res.error) { setError(res.error); return }
    if (res.title_es && res.title_es !== titleEs && (!titleEs.trim() || mode !== 'missing')) { setTitleEs(res.title_es); setTitleFromAi(true) }
    let n = 0
    setDrafts(prev => {
      const next = { ...prev }
      for (const it of res.items ?? []) { next[it.id] = { es: it.description_es, touched: false, fromAi: true }; n++ }
      return next
    })
    setMsg(t(res.title_es ? 'proposedWithTitle' : 'proposed', { n: res.items?.length ?? 0 }))
    void n
  }

  async function save() {
    setBusy('save'); setError(null); setMsg(null)
    const items = changed.map(i => {
      const d = drafts[i.id]
      return { id: i.id, description_es: d.es, source: (d.touched ? 'human' : 'ai') as 'human' | 'ai' }
    })
    const res = await saveTranslations(initial.template.id, { title_es: titleChanged ? titleEs : undefined, items })
    setBusy(null)
    if (res.error) { setError(res.error); return }
    setMsg(t(titleChanged ? 'savedWithTitle' : 'saved', { n: res.saved ?? 0 }))
    router.refresh()
  }

  function markReviewed(id: string) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], touched: true } }))
  }

  const tpl = initial.template
  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <Link href={`/admin/templates/${tpl.id}`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>← {t('back', { code: tpl.code })}</Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', margin: '12px 0 18px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>{t('title')} · <span style={{ fontFamily: 'ui-monospace, monospace' }}>{tpl.code}</span></h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 10px' }}>{tpl.title}</p>
          <label htmlFor={`${uid}-title-es`} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('titleEs')}</label>
          <input
            id={`${uid}-title-es`}
            value={titleEs}
            onChange={e => { setTitleEs(e.target.value); setTitleFromAi(false) }}
            placeholder={t('titleEsPlaceholder')}
            style={{ ...input, width: '100%', marginTop: '4px', background: titleFromAi ? 'var(--accent-50)' : 'var(--card-bg)' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button disabled={!!busy || !aiEnabled} onClick={() => propose('missing')} style={btn('var(--violet-700)', 'var(--violet-50)', 'var(--violet-200)', !!busy || !aiEnabled)} title={aiEnabled ? t('missingHint') : t('aiOff')}>
            {busy === 'missing' ? t('translating') : t('missing', { n: stats.empty })}
          </button>
          <button disabled={!!busy || !aiEnabled} onClick={() => propose('flagged')} style={btn('var(--violet-700)', 'var(--card-bg)', 'var(--violet-200)', !!busy || !aiEnabled)} title={t('flaggedHint')}>
            {busy === 'flagged' ? t('translating') : t('reviewFlagged', { n: stats.empty + stats.flagged })}
          </button>
          <button disabled={!!busy || !aiEnabled} onClick={() => propose('all')} style={btn('var(--violet-700)', 'var(--card-bg)', 'var(--violet-200)', !!busy || !aiEnabled)} title={t('allHint')}>
            {busy === 'all' ? t('translating') : t('retranslateAll')}
          </button>
          <button disabled={!!busy || (changed.length === 0 && !titleChanged)} onClick={save} style={btn('#fff', 'var(--success-500)', 'var(--success-500)', !!busy || (changed.length === 0 && !titleChanged))}>
            {busy === 'save' ? t('saving') : t('save', { n: changed.length + (titleChanged ? 1 : 0) })}
          </button>
        </div>
      </div>

      {!aiEnabled && <div style={note('var(--warning-50)', 'var(--warning-200)', 'var(--warning-800)')}>{t('aiOffNote')}</div>}
      {error && <div style={note('var(--danger-50)', 'var(--danger-200)', 'var(--danger-700)')}>{error}</div>}
      {msg && <div style={note('var(--success-50)', 'var(--success-300)', 'var(--success-800)')}>{msg}</div>}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', margin: '4px 0 12px', flexWrap: 'wrap' }}>
        {([['flagged', t('filter.flagged', { n: stats.empty + stats.flagged })], ['empty', t('filter.empty', { n: stats.empty })], ['ai', t('filter.ai', { n: stats.ai })], ['all', t('filter.all', { n: initial.items.length })]] as const).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...chip, background: filter === f ? 'var(--brand-navy-dark)' : 'var(--card-bg)', color: filter === f ? '#fff' : 'var(--text-muted)' }}>{label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>{t('counts', { n: visible.length, total: stats.total })}</span>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--card-bg)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 1fr 150px', gap: '0', background: 'var(--gray-50)', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <div style={{ padding: '8px 10px' }}>#</div><div style={{ padding: '8px 10px' }}>{t('col.en')}</div><div style={{ padding: '8px 10px' }}>{t('col.es')}</div><div style={{ padding: '8px 10px' }}>{t('col.state')}</div>
        </div>
        {visible.length === 0 && <div style={{ padding: '24px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>{t('empty')}</div>}
        {visible.map((it, idx) => <Row key={it.id} item={it} draft={drafts[it.id]} first={idx === 0 || visible[idx - 1].section_title !== it.section_title}
          onChange={es => setDrafts(prev => ({ ...prev, [it.id]: { es, touched: true, fromAi: false } }))}
          onMarkReviewed={() => markReviewed(it.id)} />)}
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px' }}>
        {t('legend')}
      </p>
    </div>
  )
}

function Row({ item, draft, first, onChange, onMarkReviewed }: { item: TranslationItem; draft: Draft; first: boolean; onChange: (es: string) => void; onMarkReviewed: () => void }) {
  const t = useTranslations('TemplateTranslations')
  const nt = item.flags.includes('not_translatable')
  return (
    <>
      {first && (
        <div style={{ gridColumn: '1 / -1', padding: '6px 10px', background: 'var(--gray-50)', fontSize: '12px', fontWeight: 700, color: 'var(--text-strong)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>{item.section_title}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 1fr 150px', borderBottom: '1px solid var(--gray-100)', alignItems: 'stretch' }}>
        <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>{item.item_number ?? ''}</div>
        <div style={{ padding: '8px 10px', fontSize: '13px', color: 'var(--text-strong)', whiteSpace: 'pre-wrap' }}>{item.description}</div>
        <div style={{ padding: '6px 8px' }}>
          <textarea
            value={draft.es}
            onChange={e => onChange(e.target.value)}
            disabled={nt}
            rows={Math.max(1, Math.min(4, Math.ceil((draft.es.length || 20) / 60)))}
            style={{ ...input, width: '100%', resize: 'vertical', fontSize: '13px', background: nt ? 'var(--gray-50)' : draft.fromAi ? 'var(--accent-50)' : draft.touched ? 'var(--success-50)' : 'var(--card-bg)' }}
          />
        </div>
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
          {item.flags.map(f => <span key={f} style={{ padding: '1px 7px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, background: FLAG_STYLE[f].bg, color: ink(FLAG_STYLE[f].color), whiteSpace: 'nowrap' }}>{t(`flag.${f}`)}</span>)}
          {item.source === 'ai' && !draft.touched && !draft.fromAi && <span style={{ padding: '1px 7px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, background: 'var(--violet-100)', color: 'var(--violet-800)' }}>{t('aiUnreviewed')}</span>}
          {(draft.fromAi || (item.source === 'ai' && !draft.touched)) && !nt && (
            <button onClick={onMarkReviewed} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--success-800)', background: 'var(--success-100)', border: '1px solid var(--success-200)', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer' }}>{t('accept')}</button>
          )}
        </div>
      </div>
    </>
  )
}

function btn(color: string, bg: string, border: string, disabled: boolean): React.CSSProperties {
  return { padding: '8px 14px', fontSize: '12px', fontWeight: 600, color, background: bg, border: `1px solid ${border}`, borderRadius: '7px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap' }
}
function note(bg: string, border: string, color: string): React.CSSProperties {
  return { padding: '10px 14px', background: bg, border: `1px solid ${border}`, borderRadius: '8px', color, fontSize: '13px', marginBottom: '12px' }
}
const input: React.CSSProperties = { padding: '7px 10px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--card-bg)', color: 'var(--text-strong)', boxSizing: 'border-box' }
const chip: React.CSSProperties = { padding: '6px 12px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--border)', borderRadius: '999px', cursor: 'pointer' }
