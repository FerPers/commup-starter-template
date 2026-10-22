import type { Theme } from '@/types/theme'

// C-29: «contrast» = variante del claro para leer a pleno sol (tokens en globals.css).
export const THEMES: readonly Theme[] = ['light', 'dark', 'contrast']

export const THEME_COOKIE = 'theme'

export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : 'light'
}

// Se ejecuta en <head> antes de pintar: las páginas que el service worker sirve
// sin red traen el data-theme del momento en que se guardaron, y la cookie manda.
export const THEME_PREPAINT_SCRIPT =
  `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);` +
  `var t=m&&decodeURIComponent(m[1]);` +
  `if(${JSON.stringify(THEMES)}.indexOf(t)>=0)document.documentElement.dataset.theme=t}catch(e){}})()`

// Colores que vienen de la BD (disciplina, fase) usados como TEXTO: en «Contraste»
// se oscurecen (--ink-darken) para leerse al sol; en claro y oscuro quedan igual.
export function ink(color: string): string {
  return `color-mix(in srgb, ${color}, #000 var(--ink-darken, 0%))`
}
