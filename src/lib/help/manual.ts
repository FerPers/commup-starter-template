/**
 * N3b («Maquetas N3» aprobadas por Luis 2026-10-22): la ayuda sale del manual por rol (docs/MANUAL-COMMUP-POR-ROL.md),
 * copiado tal cual a `manual-source.generated.ts` por `npm run help:build` (un test exige que coincidan).
 * - /ayuda (en la app): índice con «Tu rol» primero, buscador y una sección por vez (`?s=<id>`).
 * - /guia (pública, enlazada desde la landing): el mismo manual sin las secciones internas.
 * Secciones = `##` (1, 2…) y `###` (2.1, 4.3…); el id es su número. «Índice» se omite (la ayuda trae el suyo).
 */
import { MANUAL_MD } from './manual-source.generated'
import { plainText, renderMarkdown } from './markdown'

export type HelpSection = {
  id: string
  title: string
  level: 2 | 3
  parent: string | null
  /** Markdown del cuerpo (sin el encabezado). */
  body: string
  internal: boolean
}

export type Manual = { title: string; version: string | null; intro: string; sections: HelpSection[] }

/** Secciones que no van en la guía pública (limitaciones en corrección: son para quien ya usa la app). */
const INTERNAL = new Set(['8'])

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function parseManual(md: string): Manual {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let title = ''
  const intro: string[] = []
  const sections: HelpSection[] = []
  let current: HelpSection | null = null
  let top: string | null = null
  const buf: string[] = []
  const close = () => {
    if (current) { current.body = buf.join('\n').replace(/\n-{3,}\s*$/, '').trim(); sections.push(current) }
    buf.length = 0
  }
  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h && h[1].length === 1 && !title) { title = h[2].trim(); continue }
    if (h && h[1].length >= 2) {
      close()
      const level = h[1].length as 2 | 3
      const text = h[2].trim()
      const num = text.match(/^(\d+(?:\.\d+)?)\.?\s+(.*)$/)
      const id: string = num ? num[1] : (level === 3 && top ? `${top}-${slug(text)}` : slug(text))
      if (level === 2) top = id
      current = { id, title: num ? num[2] : text, level, parent: level === 3 ? top : null, body: '', internal: INTERNAL.has(level === 2 ? id : top ?? '') }
      continue
    }
    if (current) buf.push(line)
    else intro.push(line)
  }
  close()
  const introText = intro.join('\n').trim()
  const version = introText.match(/\*\*Versión:\*\*\s*([0-9-]+)/)?.[1] ?? null
  return { title, version, intro: introText, sections: sections.filter(s => s.id !== 'indice') }
}

let cached: Manual | null = null
export function getManual(): Manual {
  cached ??= parseManual(MANUAL_MD)
  return cached
}

/** Versión pública: sin secciones internas. */
export function publicManual(m: Manual = getManual()): Manual {
  return { ...m, sections: m.sections.filter(s => !s.internal) }
}

export function renderSection(s: HelpSection, sectionHref: (id: string) => string | null): string {
  return renderMarkdown(s.body, { sectionHref })
}

export function sectionText(s: HelpSection): string {
  return plainText(`${s.title} ${s.body}`)
}

export { ROLE_HELP, HELP_SECTION_IDS, helpSectionFor } from './routes'
