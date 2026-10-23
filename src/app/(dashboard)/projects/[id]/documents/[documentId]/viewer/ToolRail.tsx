'use client'

import { useTranslations } from 'next-intl'
import type { Tool } from './types'

// P2: barra vertical de herramientas del visor (escritorio, editores). Íconos de trazo, rótulo debajo.
const TOOLS: { tool: Tool; icon: string }[] = [
  { tool: 'select', icon: 'M4 3l7 17 2.5-7.5L21 10z' },
  { tool: 'pan', icon: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20' },
  { tool: 'line', icon: 'M3 17l6-6 4 4 8-8' },
  { tool: 'limit', icon: 'M12 3v18M7 8H3M21 8h-4' },
  { tool: 'label', icon: 'M4 7V4h16v3M9 20h6M12 4v16' },
  { tool: 'connector', icon: 'M3 7h12l5 5-5 5H3zM7 12h6' },
  { tool: 'pin', icon: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z' },
]

export default function ToolRail({
  tool,
  onTool,
  canUndo,
  onUndo,
  busy,
}: {
  tool: Tool
  onTool: (t: Tool) => void
  canUndo: boolean
  onUndo: () => void
  busy: boolean
}) {
  const t = useTranslations('PidDocuments')
  return (
    <div role="toolbar" aria-label={t('markups.tools')} aria-orientation="vertical"
      style={{ width: 76, flexShrink: 0, background: 'var(--card-bg)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 0', overflowY: 'auto' }}>
      {TOOLS.map(({ tool: id, icon }) => {
        const on = id === tool
        return (
          <button key={id} type="button" aria-pressed={on} onClick={() => onTool(id)} aria-label={t(`markups.tool_${id}`)} title={t(`markups.hint_${id}`)}
            style={{
              width: 60, minHeight: 52, padding: '6px 2px', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer',
              border: `1px solid ${on ? 'var(--primary-500)' : 'transparent'}`,
              background: on ? 'color-mix(in srgb, var(--primary-500) 10%, var(--card-bg))' : 'transparent',
              color: on ? 'var(--primary-600)' : 'var(--text-muted)',
            }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={icon} />
            </svg>
            <span style={{ fontSize: 10, lineHeight: 1.1, textAlign: 'center' }}>{t(`markups.tool_${id}`)}</span>
          </button>
        )
      })}
      <span style={{ flex: 1 }} />
      <button type="button" onClick={onUndo} disabled={!canUndo || busy}
        style={{ width: 60, minHeight: 44, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)', cursor: canUndo ? 'pointer' : 'default', fontSize: 11, color: 'var(--text-strong)', opacity: canUndo ? 1 : 0.45 }}>
        {t('markups.undo')}
      </button>
    </div>
  )
}
