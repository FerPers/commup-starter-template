import { describe, expect, it } from 'vitest'
import { itemDescription } from './item-text'

describe('itemDescription (C-21)', () => {
  it('usa la traducción en español si existe', () => {
    expect(itemDescription({ description: 'Check bolts', description_es: 'Revisar pernos' }, 'es')).toBe('Revisar pernos')
  })
  it('traducción vacía, en blanco o nula cae al texto base', () => {
    for (const description_es of ['', '   ', null, undefined]) {
      expect(itemDescription({ description: 'Check bolts', description_es }, 'es')).toBe('Check bolts')
    }
  })
  it('en inglés siempre el texto base', () => {
    expect(itemDescription({ description: 'Check bolts', description_es: 'Revisar pernos' }, 'en')).toBe('Check bolts')
  })
})
