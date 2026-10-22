import { setTheme } from '@/app/actions/theme'
import type { Theme } from '@/types/theme'
import { parseTheme } from '.'

export const THEME_EVENT = 'commup:theme'

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return parseTheme(document.documentElement.dataset.theme)
}

// Aplica al instante y guarda la cookie para el próximo SSR; sin refresh (no pierde
// lo que hay en pantalla). Avisa a los otros selectores montados (menú, ITR).
export function applyTheme(theme: Theme): Promise<void> {
  document.documentElement.dataset.theme = theme
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }))
  return setTheme(theme)
}
