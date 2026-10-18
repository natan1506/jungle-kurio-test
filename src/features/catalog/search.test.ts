import { describe, expect, it } from 'vitest'
import { safeRedirect } from '@/lib/redirect'
import { catalogSearchSchema, toListParams } from './search'

describe('catalogSearchSchema', () => {
  it('aceita listas como array ou csv, sem duplicar e em ordem', () => {
    expect(catalogSearchSchema.parse({ categories: 'musica,arte-digital,musica' }).categories).toEqual(['arte-digital', 'musica'])
    expect(catalogSearchSchema.parse({ networks: ['solana', 'ethereum'] }).networks).toEqual(['ethereum', 'solana'])
  })

  it('descarta valores inválidos da URL', () => {
    const s = catalogSearchSchema.parse({ categories: 'xpto', sort: 'hack', page: '-2', priceMin: '1,5', tab: 'x' })
    expect(s).toMatchObject({ categories: undefined, sort: undefined, page: undefined, priceMin: undefined, tab: undefined })
  })

  it('normaliza busca e página', () => {
    const s = catalogSearchSchema.parse({ q: '  Golden  ', page: '3' })
    expect(s.q).toBe('Golden')
    expect(s.page).toBe(3)
  })

  it('aplica padrões ao montar os parâmetros da API', () => {
    expect(toListParams({})).toMatchObject({ tab: 'all', sort: 'recent', page: 1, pageSize: 9 })
  })
})

describe('safeRedirect', () => {
  it('só permite destinos internos', () => {
    expect(safeRedirect('/checkout')).toBe('/checkout')
    expect(safeRedirect('//evil.com')).toBe('/')
    expect(safeRedirect('https://evil.com')).toBe('/')
    expect(safeRedirect(undefined)).toBe('/')
  })
})
