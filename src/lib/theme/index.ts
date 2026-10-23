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

// Colores que vienen de la BD (disciplina, fase) usados como TEXTO: se acota su luminosidad
// (OKLCH) a lo que se lee sobre el fondo del tema (--ink-l-min / --ink-l-max en globals.css):
// en claro solo se oscurecen los colores claros, en oscuro solo se aclaran los oscuros y en
// «Contraste» todo queda ≥ 7:1. Sirve igual con un token (`var(--danger-500)`).
export function ink(color: string): string {
  return `oklch(from ${color} clamp(var(--ink-l-min, 0), l, var(--ink-l-max, 1)) c h)`
}

// Color de la BD como RELLENO bajo texto blanco (pestaña activa de fase o disciplina): se
// oscurece solo si es claro, para que el blanco encima quede ≥ 4.5:1 en cualquier tema.
export function fill(color: string): string {
  return `oklch(from ${color} min(l, 0.55) c h)`
}

// Tinte translúcido de un color (G-10): sirve igual con hex de la BD que con un token
// (`var(--danger-500)`), a diferencia de pegarle «18» al final del hex.
export function alpha(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`
}
