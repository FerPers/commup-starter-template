import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Cada t('clave') literal debe existir en su namespace, en es y en en. N3b dejó «Topbar.menu.pageHelp»
// en el namespace equivocado y el menú de usuario mostraba la clave cruda; esto lo atrapa en CI.
// Alcance: traductores declarados con useTranslations/getTranslations('Ns') (un solo namespace por nombre)
// y claves literales; las dinámicas (`t(\`x.${y}\`)`) no se revisan.

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
      for (const m of src.matchAll(call)) {
        const key = ns ? `${ns}.${m[1]}` : m[1]
        if (get(messages, key) === undefined) missing.push(`${file}:${src.slice(0, m.index).split('\n').length} ${key}`)
      }
    }
  }
  return missing
}

describe('i18n: claves usadas = claves existentes', () => {
  for (const loc of ['es', 'en']) {
    it(`${loc}: toda clave literal de t() existe`, () => {
      const messages = JSON.parse(readFileSync(`src/i18n/messages/${loc}.json`, 'utf8'))
      expect(missingKeys(messages)).toEqual([])
    })
  }
})
