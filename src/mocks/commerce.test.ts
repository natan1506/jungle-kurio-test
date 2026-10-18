import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import type { Quote, QuoteLine } from '@/api/types'
import { couponFor, diffQuotes, summarize } from './commerce'

const line = (over: Partial<QuoteLine> = {}): QuoteLine => ({
  cartItemId: 'ci_1',
  nftId: 'emerald-ape-042',
  editionId: 'e50',
  editionLabel: '1/50',
  name: 'Emerald Ape #042',
  tokenId: '#0042',
  image: 'emerald-ape',
  quantity: 2,
  unitPriceEth: '1.19',
  lineTotalEth: '2.38',
  ...over,
})

const quote = (lines: QuoteLine[], over: Partial<Quote> = {}): Quote => ({
  id: 'q1',
  network: 'ethereum',
  lines,
  coupon: null,
  summary: summarize(
    lines.map((l) => new Big(l.lineTotalEth)),
    null,
    'ethereum',
  ),
  createdAt: '',
  expiresAt: '',
  ...over,
})

describe('summarize', () => {
  it('calcula subtotal, desconto, taxa e total', () => {
    const { coupon } = couponFor('kurio10')
    expect(summarize([new Big('4.83')], coupon, 'ethereum')).toEqual({
      subtotalEth: '4.83',
      discountEth: '0.483',
      networkFeeEth: '0.016',
      totalEth: '4.363',
    })
  })

  it('usa a taxa da rede e zera a taxa sem itens', () => {
    expect(summarize([new Big('1')], null, 'polygon').networkFeeEth).toBe('0.002')
    expect(summarize([], null, 'ethereum').totalEth).toBe('0.00')
  })
})

describe('couponFor', () => {
  it('diferencia cupom válido, inválido e expirado', () => {
    expect(couponFor('KURIO10').coupon?.percentOff).toBe(10)
    expect(couponFor('NAOEXISTE').error).toBe('COUPON_INVALID')
    expect(couponFor('VERAO2025').error).toBe('COUPON_EXPIRED')
  })
})

describe('diffQuotes', () => {
  it('sem mudanças não gera diferença', () => {
    expect(diffQuotes(quote([line()]), quote([line()]))).toEqual([])
  })

  it('detecta preço, quantidade, item esgotado e cupom', () => {
    const before = quote([line(), line({ cartItemId: 'ci_2', nftId: 'sage-nomad-009', name: 'Sage Nomad #009' })])
    const after = quote([line({ unitPriceEth: '1.25', quantity: 1 })], { coupon: { code: 'KURIO10', label: '', percentOff: 10 } })
    const kinds = diffQuotes(before, after).map((c) => c.kind)
    expect(kinds).toEqual(['price', 'availability', 'availability', 'coupon'])
  })
})
