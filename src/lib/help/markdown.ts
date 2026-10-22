/**
 * N3b: Markdown → HTML para la ayuda (/ayuda y /guia). Solo el subconjunto que usa el manual
 * (docs/MANUAL-COMMUP-POR-ROL.md): párrafos, listas (anidadas por sangría), tablas, citas, separadores y, en línea,
 * **negrita**, *cursiva*, `código`, [enlaces](url) y referencias «§5.8» a otra sección. Todo el texto se escapa:
 * el manual es del repositorio, pero así un `<` en el texto nunca se vuelve HTML.
 */

export type RenderOptions = {
  /** Enlace a una sección del manual (para «§5.8» y enlaces `#5.8`). Sin él, quedan como texto. */
  sectionHref?: (id: string) => string | null
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function safeUrl(url: string): string | null {
  if (/^https:\/\//i.test(url) || /^mailto:/i.test(url)) return url
  if (url.startsWith('/') && !url.startsWith('//')) return url
  return null
}

export function renderInline(text: string, opts: RenderOptions = {}): string {
  // Código primero (su contenido no se interpreta), con marcadores que no aparecen en el texto.
  const codes: string[] = []
  let s = text.replace(/`([^`]+)`/g, (_, c: string) => { codes.push(c); return `\u0000${codes.length - 1}\u0000` })
  s = esc(s)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => {
    const raw = url.replace(/&amp;/g, '&')
    if (raw.startsWith('#')) {
      const href = opts.sectionHref?.(raw.slice(1))
      return href ? `<a href="${esc(href)}">${label}</a>` : label
    }
    const ok = safeUrl(raw)
    if (!ok) return label
    const ext = /^https:/i.test(ok)
    return `<a href="${esc(ok)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`
  })
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>')
  if (opts.sectionHref) {
    s = s.replace(/§(\d+(?:\.\d+)?)/g, (m, id: string) => {
      const href = opts.sectionHref!(id)
      return href ? `<a href="${esc(href)}">${m}</a>` : m
    })
  }
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${esc(codes[Number(i)])}</code>`)
}

type ListItem = { indent: number; ordered: boolean; text: string }

const LIST_RE = /^(\s*)(?:([-*])|(\d+)\.)\s+(.*)$/

function renderItems(items: ListItem[], start: number, opts: RenderOptions): [string, number] {
  const level = items[start].indent
  const tag = items[start].ordered ? 'ol' : 'ul'
  let out = `<${tag}>`
  let i = start
  while (i < items.length && items[i].indent >= level) {
    if (items[i].indent > level) {
      // Sublista del ítem anterior: va dentro de su <li>.
      const [child, next] = renderItems(items, i, opts)
      out = out.slice(0, -'</li>'.length) + child + '</li>'
      i = next
      continue
    }
    out += `<li>${renderInline(items[i].text, opts)}</li>`
    i++
  }
  return [out + `</${tag}>`, i]
}

function renderList(items: ListItem[], opts: RenderOptions): string {
  let html = ''
  let i = 0
  while (i < items.length) { const [h, next] = renderItems(items, i, opts); html += h; i = next }
  return html
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
}

export function renderMarkdown(md: string, opts: RenderOptions = {}): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  const flush = () => { if (para.length) { out.push(`<p>${renderInline(para.join(' '), opts)}</p>`); para = [] } }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) { flush(); continue }
    if (/^-{3,}$/.test(trimmed)) { flush(); out.push('<hr>'); continue }
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (h) { flush(); const lv = Math.min(6, h[1].length + 1); out.push(`<h${lv}>${renderInline(h[2], opts)}</h${lv}>`); continue }
    if (trimmed.startsWith('|') && lines[i + 1]?.trim().match(/^\|?\s*:?-{2,}/)) {
      flush()
      const head = splitRow(trimmed)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(splitRow(lines[i])); i++ }
      i--
      out.push('<div class="help-table"><table><thead><tr>' + head.map(c => `<th>${renderInline(c, opts)}</th>`).join('') + '</tr></thead><tbody>'
        + rows.map(r => '<tr>' + r.map(c => `<td>${renderInline(c, opts)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>')
      continue
    }
    if (trimmed.startsWith('>')) {
      flush()
      const quote: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) { quote.push(lines[i].trim().replace(/^>\s?/, '')); i++ }
      i--
      out.push(`<blockquote>${renderMarkdown(quote.join('\n'), opts)}</blockquote>`)
      continue
    }
    if (LIST_RE.test(line)) {
      flush()
      const items: ListItem[] = []
      while (i < lines.length) {
        const m = lines[i].match(LIST_RE)
        if (m) { items.push({ indent: m[1].length, ordered: !m[2], text: m[4] }); i++; continue }
        // Continuación de un ítem (línea sangrada sin viñeta).
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; continue }
        break
      }
      i--
      const base = Math.min(...items.map(it => it.indent))
      out.push(renderList(items.map(it => ({ ...it, indent: it.indent - base })), opts))
      continue
    }
    para.push(trimmed)
  }
  flush()
  return out.join('\n')
}

/** Texto plano (para el buscador). */
export function plainText(md: string): string {
  return md
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_>#|]/g, ' ')
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
    .replace(/-{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
