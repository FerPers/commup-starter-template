import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MANUAL_MD } from './manual-source.generated'
import { HELP_SECTION_IDS, ROLE_HELP, getManual, helpSectionFor, parseManual, publicManual } from './manual'
import { renderInline, renderMarkdown } from './markdown'

describe('ayuda desde el manual (N3b)', () => {
  it('el módulo generado es el manual del repositorio (correr `npm run help:build` tras editarlo)', () => {
    expect(MANUAL_MD).toBe(readFileSync(join(process.cwd(), 'docs', 'MANUAL-COMMUP-POR-ROL.md'), 'utf8'))
  })

  it('cada sección que usa la ayuda contextual existe', () => {
    const ids = new Set(getManual().sections.map(s => s.id))
    for (const id of HELP_SECTION_IDS) expect(ids, id).toContain(id)
    for (const role of ['owner', 'admin', 'architect', 'leader', 'inspector', 'client']) expect(ROLE_HELP[role]?.length).toBeGreaterThan(0)
  })

  it('secciones por número, sin el índice; la guía pública omite las internas', () => {
    const m = parseManual('# Manual\n\n**Versión:** 2026-10-22\n\n## Índice\n1. [Uno](#1-uno)\n\n## 1. Uno\nTexto.\n\n### 1.1 Sub\nMás.\n\n---\n\n## 8. Limitaciones\nX')
    expect(m.version).toBe('2026-10-22')
    expect(m.sections.map(s => [s.id, s.title, s.parent])).toEqual([['1', 'Uno', null], ['1.1', 'Sub', '1'], ['8', 'Limitaciones', null]])
    expect(m.sections[1].body).toBe('Más.')
    expect(publicManual(m).sections.map(s => s.id)).toEqual(['1', '1.1'])
  })

  it('ayuda de la página: la sección de la pantalla, o la del rol en Mi trabajo', () => {
    const p = '/projects/abc47484-59d3-4f51-8966-7fb4f1174ba8'
    expect(helpSectionFor(`${p}/tags/x/itrs/y`, 'inspector')).toBe('5.3')
    expect(helpSectionFor(`${p}/daily/reports/1`, 'leader')).toBe('5.12')
    expect(helpSectionFor(`${p}/systems/1`, 'leader')).toBe('5.8')
    expect(helpSectionFor('/my-work', 'client')).toBe('4.7')
    expect(helpSectionFor('/algo-nuevo', 'inspector')).toBe('4.1')
  })

  it('markdown: escapa, listas anidadas, tablas y enlaces seguros', () => {
    expect(renderInline('a <b> **c** *d* `e<f>`')).toBe('a &lt;b&gt; <strong>c</strong> <em>d</em> <code>e&lt;f&gt;</code>')
    expect(renderInline('[x](javascript:alert(1))')).not.toContain('<a')
    expect(renderInline('[x](https://commup.app)')).toContain('rel="noopener noreferrer"')
    expect(renderInline('ver §5.8', { sectionHref: id => `/ayuda?s=${id}` })).toBe('ver <a href="/ayuda?s=5.8">§5.8</a>')
    expect(renderMarkdown('1. uno\n   - a\n   - b\n2. dos')).toBe('<ol><li>uno<ul><li>a</li><li>b</li></ul></li><li>dos</li></ol>')
    expect(renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |')).toContain('<td>1</td><td>2</td>')
    expect(renderMarkdown('**Día típico**\n1. uno')).toBe('<p><strong>Día típico</strong></p>\n<ol><li>uno</li></ol>')
  })
})
