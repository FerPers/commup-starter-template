import { describe, expect, it } from 'vitest'
import { parseTagView, tagViewQuery } from './tag-view'

describe('modos de Tags y equipos (N2c)', () => {
  it('Lista por defecto; lo desconocido también es Lista', () => {
    expect(parseTagView(undefined)).toBe('list')
    expect(parseTagView('tree')).toBe('tree')
    expect(parseTagView(['cards'])).toBe('cards')
    expect(parseTagView('twin')).toBe('list')
  })

  it('al cambiar de modo quedan búsqueda, sistema y subsistema; lo propio de la lista (página, disciplina) no', () => {
    const cur = new URLSearchParams('q=PT-1&subsystem=s1&page=3&disc=INST&view=list')
    expect(tagViewQuery(cur, 'cards')).toBe('?view=cards&q=PT-1&subsystem=s1')
    expect(tagViewQuery(new URLSearchParams('view=tree'), 'list')).toBe('')
  })
})
