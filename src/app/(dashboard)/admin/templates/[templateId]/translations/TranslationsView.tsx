'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  proposeTranslations, saveTranslations,
  type TranslationReview, type TranslationItem, type TranslationFlag,
} from '@/app/actions/itr-translations'

// ── Revisión de traducción ES de una plantilla ITR ──────────────────────────
// Inglés y español lado a lado. La IA propone (faltantes / marcados / todo);
// cada línea se edita antes de guardar. Lo guardado desde aquí queda como
// revisado por una persona (source = human), salvo lo que se acepte tal cual
// de la IA sin tocar, que se guarda como 'ai' para poder auditarlo después.

const FLAG_LABEL: Record<TranslationFlag, { label: string; bg: string; color: string }> = {
  empty:            { label: 'Sin traducir',      bg: '#fee2e2', color: '#991b1b' },
  identical:        { label: 'Igual al inglés',   bg: '#fef3c7', color: '#92400e' },
  anglicism:        { label: 'Posible anglicismo', bg: '#fef3c7', color: '#92400e' },
  en_is_spanish:    { label: 'Inglés en español', bg: '#e0e7ff', color: '#3730a3' },
  not_translatable: { label: 'Valor / código',    bg: 'var(--gray-100)', color: 'var(--text-muted)' },
}

type Draft = { es: string; touched: boolean; fromAi: boolean }

export default function TranslationsView({ initial, aiEnabled }: { initial: TranslationReview; aiEnabled: boolean }) {
  const router = useRouter()
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
    setMsg(`La IA propuso ${res.items?.length ?? 0} traducciones${res.title_es ? ' y el título' : ''}. Revísalas y guarda.`)
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
    setMsg(`Guardado: ${res.saved ?? 0} ítems${titleChanged ? ' y título' : ''}.`)
    router.refresh()
  }

  function markReviewed(id: string) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], touched: true } }))
  }

  const t = initial.template
  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <Link href={`/admin/templates/${t.id}`} style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>← {t.code} · editor</Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', margin: '12px 0 18px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-strong)', margin: 0, letterSpacing: '-0.4px' }}>Traducción al español · <span style={{ fontFamily: 'ui-monospace, monospace' }}>{t.code}</span></h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 10px' }}>{t.title}</p>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Título en español</label>
          <input
            value={titleEs}
            onChange={e => { setTitleEs(e.target.value); setTitleFromAi(false) }}
            placeholder="Ej.: FORMATO DE COMPLETACIÓN DE CONSTRUCCIÓN: Bombas centrífugas"
            style={{ ...input, width: '100%', marginTop: '4px', background: titleFromAi ? '#faf5ff' : 'var(--card-bg)' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button disabled={!!busy || !aiEnabled} onClick={() => propose('missing')} style={btn('#6d28d9', '#f5f3ff', '#ddd6fe', !!busy || !aiEnabled)} title={aiEnabled ? 'Traduce solo los ítems vacíos y el título si falta' : 'IA no configurada'}>
            {busy === 'missing' ? 'Traduciendo…' : `✦ Traducir faltantes (${stats.empty})`}
          </button>
          <button disabled={!!busy || !aiEnabled} onClick={() => propose('flagged')} style={btn('#6d28d9', 'var(--card-bg)', '#ddd6fe', !!busy || !aiEnabled)} title="Vacíos + iguales al inglés + posibles anglicismos">
            {busy === 'flagged' ? 'Traduciendo…' : `Revisar marcados (${stats.empty + stats.flagged})`}
          </button>
          <button disabled={!!busy || !aiEnabled} onClick={() => propose('all')} style={btn('#6d28d9', 'var(--card-bg)', '#ddd6fe', !!busy || !aiEnabled)} title="Vuelve a proponer todo (no se guarda hasta que aceptes)">
            {busy === 'all' ? 'Traduciendo…' : 'Retraducir todo'}
          </button>
          <button disabled={!!busy || (changed.length === 0 && !titleChanged)} onClick={save} style={btn('#fff', '#10b981', '#10b981', !!busy || (changed.length === 0 && !titleChanged))}>
            {busy === 'save' ? 'Guardando…' : `Guardar ${changed.length + (titleChanged ? 1 : 0)} cambio${changed.length + (titleChanged ? 1 : 0) !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {!aiEnabled && <div style={note('#fffbeb', '#fde68a', '#92400e')}>La IA no está configurada en este entorno; puedes editar las traducciones a mano.</div>}
      {error && <div style={note('#fef2f2', '#fecaca', '#dc2626')}>{error}</div>}
      {msg && <div style={note('#ecfdf5', '#6ee7b7', '#065f46')}>{msg}</div>}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', margin: '4px 0 12px', flexWrap: 'wrap' }}>
        {([['flagged', `Marcados (${stats.empty + stats.flagged})`], ['empty', `Sin traducir (${stats.empty})`], ['ai', `Traducidos por IA sin revisar (${stats.ai})`], ['all', `Todos (${initial.items.length})`]] as const).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...chip, background: filter === f ? '#0B1D3A' : 'var(--card-bg)', color: filter === f ? '#fff' : 'var(--text-muted)' }}>{label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>{visible.length} ítems · {stats.total} traducibles</span>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--card-bg)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 1fr 150px', gap: '0', background: 'var(--gray-50)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <div style={{ padding: '8px 10px' }}>#</div><div style={{ padding: '8px 10px' }}>Inglés (original)</div><div style={{ padding: '8px 10px' }}>Español</div><div style={{ padding: '8px 10px' }}>Estado</div>
        </div>
        {visible.length === 0 && <div style={{ padding: '24px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>Nada que revisar con este filtro.</div>}
        {visible.map((it, idx) => <Row key={it.id} item={it} draft={drafts[it.id]} first={idx === 0 || visible[idx - 1].section_title !== it.section_title}
          onChange={es => setDrafts(prev => ({ ...prev, [it.id]: { es, touched: true, fromAi: false } }))}
          onMarkReviewed={() => markReviewed(it.id)} />)}
      </div>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
        Fondo violeta = propuesta de la IA aún no revisada. Editar una celda la marca como revisada por ti. «Aceptar» guarda la propuesta como revisada sin cambiarla.
      </p>
    </div>
  )
}

function Row({ item, draft, first, onChange, onMarkReviewed }: { item: TranslationItem; draft: Draft; first: boolean; onChange: (es: string) => void; onMarkReviewed: () => void }) {
  const nt = item.flags.includes('not_translatable')
  return (
    <>
      {first && (
        <div style={{ gridColumn: '1 / -1', padding: '6px 10px', background: 'var(--gray-50)', fontSize: '11px', fontWeight: 700, color: 'var(--text-strong)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>{item.section_title}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 1fr 150px', borderBottom: '1px solid #f1f5f9', alignItems: 'stretch' }}>
        <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--gray-400)', fontFamily: 'ui-monospace, monospace' }}>{item.item_number ?? ''}</div>
        <div style={{ padding: '8px 10px', fontSize: '13px', color: 'var(--text-strong)', whiteSpace: 'pre-wrap' }}>{item.description}</div>
        <div style={{ padding: '6px 8px' }}>
          <textarea
            value={draft.es}
            onChange={e => onChange(e.target.value)}
            disabled={nt}
            rows={Math.max(1, Math.min(4, Math.ceil((draft.es.length || 20) / 60)))}
            style={{ ...input, width: '100%', resize: 'vertical', fontSize: '13px', background: nt ? 'var(--gray-50)' : draft.fromAi ? '#faf5ff' : draft.touched ? '#f0fdf4' : 'var(--card-bg)' }}
          />
        </div>
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
          {item.flags.map(f => <span key={f} style={{ padding: '1px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: FLAG_LABEL[f].bg, color: FLAG_LABEL[f].color, whiteSpace: 'nowrap' }}>{FLAG_LABEL[f].label}</span>)}
          {item.source === 'ai' && !draft.touched && !draft.fromAi && <span style={{ padding: '1px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, background: '#ede9fe', color: '#5b21b6' }}>IA sin revisar</span>}
          {(draft.fromAi || (item.source === 'ai' && !draft.touched)) && !nt && (
            <button onClick={onMarkReviewed} style={{ fontSize: '11px', fontWeight: 600, color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer' }}>✓ Aceptar</button>
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
