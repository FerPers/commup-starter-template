import { describe, expect, it } from 'vitest'
import { LIST_PAGE_SIZE, normalizeSearch, parseDir, parsePage, parseSort, rangeFor, totalPages } from './params'

describe('list params', () => {
  it('parsePage: 1-based y tolerante a basura', () => {
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-3')).toBe(1)
    expect(parsePage('abc')).toBe(1)
    expect(parsePage('7')).toBe(7)
  })

  it('parseSort: solo acepta claves permitidas', () => {
    const allowed = ['created_at', 'tag_number'] as const
    expect(parseSort('tag_number', allowed, 'created_at')).toBe('tag_number')
    expect(parseSort('id; drop table', allowed, 'created_at')).toBe('created_at')
    expect(parseSort(undefined, allowed, 'created_at')).toBe('created_at')
  })

  it('parseDir: asc/desc o fallback', () => {
    expect(parseDir('asc', 'desc')).toBe('asc')
    expect(parseDir('DESC', 'asc')).toBe('asc')
    expect(parseDir(undefined, 'desc')).toBe('desc')
  })

  it('rangeFor: rango inclusivo para .range()', () => {
    expect(rangeFor(1)).toEqual([0, LIST_PAGE_SIZE - 1])
    expect(rangeFor(3, 10)).toEqual([20, 29])
  })

  it('normalizeSearch: quita comodines, recorta y limita', () => {
    expect(normalizeSearch('  P-101 ')).toBe('P-101')
    expect(normalizeSearch('100%_x\\')).toBe('100 x')
    expect(normalizeSearch(undefined)).toBe('')
    expect(normalizeSearch('a'.repeat(500)).length).toBeLessThanOrEqual(100)
  })

  it('normalizeSearch: no deja sintaxis de .or() de PostgREST (C-25/A-24)', () => {
    expect(normalizeSearch('PT-101(A)')).toBe('PT-101_A_')
    expect(normalizeSearch('x,id.not.is.null')).toBe('x_id.not.is.null')
    expect(normalizeSearch('"a"*')).toBe('_a__')
    for (const s of ['A,B', 'a)b(', 'q"', 'x*y']) expect(normalizeSearch(s)).not.toMatch(/[,()"*]/)
  })

  it('totalPages: mínimo 1', () => {
    expect(totalPages(0)).toBe(1)
    expect(totalPages(50)).toBe(1)
    expect(totalPages(51)).toBe(2)
    expect(totalPages(250_000, 50)).toBe(5000)
  })
})
