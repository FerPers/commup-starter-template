'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  CATEGORY_CRITERIA,
  IMPACT_HELP,
  PUNCH_IMPACTS,
  SUGGESTED_CATEGORY,
  categoryMismatch,
  examplesFor,
  type PunchCategory,
  type PunchImpact,
} from '@/lib/punches/category-guide'

// Impacto obligatorio + guía de categorización (fase 4 · bloque A, §10.5–10.6). Compartido por los
// formularios de alta de punch (lista del proyecto, tag y ejecución del ITR). La categoría la sigue
// eligiendo cada formulario con sus botones; aquí se sugiere y se avisa, sin bloquear.

const label: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--text-body)', display: 'block', marginBottom: '6px' }

export function PunchImpactAndGuide({ impact, onImpact, category, onCategory, disciplineCode }: {
  impact: PunchImpact | null
  onImpact: (i: PunchImpact) => void
  category: PunchCategory
  onCategory: (c: PunchCategory) => void
  disciplineCode?: string | null
}) {
  const t = useTranslations('PunchGuide')
  const lang = useLocale() === 'en' ? 'en' : 'es'
  const [open, setOpen] = useState(false)
  const suggested = categoryMismatch(impact, category)
  const examples = examplesFor(disciplineCode)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div>
        <span style={label}>{t('impactLabel')} *</span>
        <div role="radiogroup" aria-label={t('impactLabel')} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {PUNCH_IMPACTS.map(i => {
            const active = impact === i
            return (
              <button key={i} type="button" role="radio" aria-checked={active} onClick={() => onImpact(i)}
                style={{
                  padding: '6px 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--primary-500)' : 'var(--border)'}`,
                  background: active ? 'var(--primary-600)' : 'var(--card-bg)', color: active ? '#fff' : 'var(--text-strong)',
                }}>
                {t(`impact.${i}`)}
              </button>
            )
          })}
        </div>
        {impact && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{IMPACT_HELP[impact][lang]} {t('suggests', { cat: SUGGESTED_CATEGORY[impact] })}</div>}
      </div>

      {suggested && (
        <div role="status" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderRadius: '8px', background: 'var(--warning-50)', border: '1px solid var(--warning-200)', fontSize: '12px', color: 'var(--warning-800)' }}>
          <span>{t('mismatch', { chosen: category, suggested, impact: t(`impact.${impact!}`) })}</span>
          <button type="button" onClick={() => onCategory(suggested)}
            style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, border: '1px solid var(--warning-300)', background: 'var(--card-bg)', color: 'var(--warning-800)', cursor: 'pointer' }}>
            {t('useSuggested', { cat: suggested })}
          </button>
        </div>
      )}

      <div>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', fontWeight: 600, color: 'var(--primary-700)', cursor: 'pointer' }}>
          {open ? '▾' : '▸'} {t('guideToggle')}
        </button>
        {open && (
          <div style={{ marginTop: '6px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--gray-50)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(['A', 'B', 'C'] as const).map(c => (
              <div key={c}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-strong)' }}>{CATEGORY_CRITERIA[c].title[lang]}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.45 }}>{CATEGORY_CRITERIA[c].rule[lang]} {CATEGORY_CRITERIA[c].blocks[lang]}</div>
                <ul style={{ margin: '3px 0 0', paddingLeft: '16px', fontSize: '12px', color: 'var(--text-strong)' }}>
                  {examples[c].map((e, i) => <li key={i}>{e[lang]}</li>)}
                </ul>
              </div>
            ))}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {disciplineCode ? t('examplesFor', { disc: disciplineCode }) : t('examplesGeneric')} {t('functionNotSize')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
