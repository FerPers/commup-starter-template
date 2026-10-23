import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Cada t('clave') literal debe existir en su namespace, en es y en en. N3b dejó «Topbar.menu.pageHelp»
// en el namespace equivocado y el menú de usuario mostraba la clave cruda; esto lo atrapa en CI.
// Alcance: traductores declarados con useTranslations/getTranslations('Ns') (un solo namespace por nombre),
// claves literales y las dos ramas de un ternario (`t(cond ? 'a' : 'b')`, V1: así se escapó Daily.detail.needDatePrompt
// en en). En las dinámicas (`t(\`x.y.${z}\`)`) el prefijo fijo `x.y` debe ser un grupo de claves (V2: `CeMatrix.voting`
// era el texto «Votación» y las opciones salían crudas). Además es y en deben tener exactamente las mismas claves.

const get = (o: unknown, path: string) => path.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), o)

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [p] : []
  })
}

const DECL = /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:'([^']*)'|"([^"]*)"|\{[^}]*namespace:\s*'([^']*)'[^}]*\})?\s*\)/g

function missingKeys(messages: unknown): string[] {
  const missing: string[] = []
  for (const file of sources('src')) {
    const src = readFileSync(file, 'utf8')
    const translators = new Map<string, Set<string>>()
    for (const m of src.matchAll(DECL)) {
      const ns = m[2] ?? m[3] ?? m[4] ?? ''
      translators.set(m[1], (translators.get(m[1]) ?? new Set()).add(ns))
    }
    for (const [name, namespaces] of translators) {
      if (namespaces.size !== 1) continue
      const [ns] = namespaces
      const call = new RegExp(`(?<![\\w.])${name}(?:\\.rich|\\.raw|\\.markup)?\\(\\s*'([^'$\`]+)'`, 'g')
      const ternary = new RegExp(`(?<![\\w.])${name}(?:\\.rich|\\.raw|\\.markup)?\\(\\s*[^()'"\`;]{1,120}?\\?\\s*'([^'$\`]+)'\\s*:\\s*'([^'$\`]+)'`, 'g')
      const found = [...src.matchAll(call)].map(m => ({ key: m[1], at: m.index }))
        .concat([...src.matchAll(ternary)].flatMap(m => [{ key: m[1], at: m.index }, { key: m[2], at: m.index }]))
      for (const { key: k, at } of found) {
        const key = ns ? `${ns}.${k}` : k
        if (get(messages, key) === undefined) missing.push(`${file}:${src.slice(0, at).split('\n').length} ${key}`)
      }
      const dynamic = new RegExp(`(?<![\\w.])${name}(?:\\.rich|\\.raw|\\.markup)?\\(\\s*\`([\\w.]*)\\.\\$\\{`, 'g')
      for (const m of src.matchAll(dynamic)) {
        const group = ns ? `${ns}.${m[1]}` : m[1]
        const node = get(messages, group)
        if (!node || typeof node !== 'object') missing.push(`${file}:${src.slice(0, m.index).split('\n').length} ${group}.*`)
      }
    }
  }
  return missing
}

function leafKeys(o: unknown, prefix = ''): string[] {
  if (!o || typeof o !== 'object') return [prefix]
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k))
}

describe('i18n: claves usadas = claves existentes', () => {
  it('es y en tienen el mismo juego de claves', () => {
    const [es, en] = ['es', 'en'].map(loc => new Set(leafKeys(JSON.parse(readFileSync(`src/i18n/messages/${loc}.json`, 'utf8')))))
    expect([...es].filter(k => !en.has(k)), 'solo en es').toEqual([])
    expect([...en].filter(k => !es.has(k)), 'solo en en').toEqual([])
  })

  for (const loc of ['es', 'en']) {
    it(`${loc}: toda clave literal de t() existe`, () => {
      const messages = JSON.parse(readFileSync(`src/i18n/messages/${loc}.json`, 'utf8'))
      expect(missingKeys(messages)).toEqual([])
    })
  }
})
