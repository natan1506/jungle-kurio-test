import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import { eth, formatEth, isValidEthInput, sumEth, toEthString } from './money'

describe('money', () => {
  it('soma sem erro de ponto flutuante', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(toEthString(sumEth(['0.1', '0.2']))).toBe('0.30')
    expect(toEthString(sumEth(['1.19', '1.69', '0.016']))).toBe('2.896')
  })

  it('aplica desconto e taxa como a API', () => {
    const subtotal = eth('4.83')
    const discount = subtotal.times(10).div(100)
    expect(toEthString(subtotal.minus(discount).plus('0.016'))).toBe('4.363')
  })

  it('arredonda half-even em 6 casas', () => {
    expect(toEthString(new Big('0.0000005'))).toBe('0.00')
    expect(toEthString(new Big('0.0000015'))).toBe('0.000002')
    expect(toEthString(new Big('1.1234567'))).toBe('1.123457')
  })

  it('mantém pelo menos 2 casas e remove zeros sobrando', () => {
    expect(toEthString(new Big('2'))).toBe('2.00')
    expect(toEthString(new Big('2.500'))).toBe('2.50')
    expect(formatEth('1.19')).toBe('1.19 ETH')
    expect(formatEth('26.846000')).toBe('26.846 ETH')
    expect(formatEth('3', { unit: false })).toBe('3.00')
  })

  it('valida entrada de preço', () => {
    expect(isValidEthInput('0.5')).toBe(true)
    expect(isValidEthInput('10')).toBe(true)
    expect(isValidEthInput('1,5')).toBe(false)
    expect(isValidEthInput('-1')).toBe(false)
    expect(isValidEthInput('abc')).toBe(false)
  })
})
