import Big from 'big.js'
import type { EthAmount } from '@/api/types'

// Precisão decimal arbitrária: valores ETH nunca passam por float.
Big.DP = 18
Big.RM = Big.roundHalfEven

export const ETH_SCALE = 3

export function eth(value: EthAmount | number | Big): Big {
  return value instanceof Big ? value : new Big(value)
}

export function toEthString(value: Big, dp = 6): EthAmount {
  // Remove zeros à direita mantendo pelo menos 2 casas decimais.
  const fixed = value.round(dp, Big.roundHalfEven).toFixed(dp)
  const [int, frac = ''] = fixed.split('.')
  const trimmed = frac.replace(/0+$/, '').padEnd(2, '0')
  return `${int}.${trimmed}`
}

export function sumEth(values: (EthAmount | Big)[]): Big {
  return values.reduce<Big>((acc, v) => acc.plus(eth(v)), new Big(0))
}

/** Formata para exibição: "1.19 ETH", "26.846 ETH". */
export function formatEth(value: EthAmount | Big, opts: { unit?: boolean; minDp?: number } = {}): string {
  const { unit = true, minDp = 2 } = opts
  const b = eth(value)
  const fixed = b.toFixed(6)
  const [int, frac = ''] = fixed.split('.')
  const trimmed = frac.replace(/0+$/, '')
  const dec = trimmed.length < minDp ? trimmed.padEnd(minDp, '0') : trimmed
  const out = dec ? `${int}.${dec}` : int
  return unit ? `${out} ETH` : out
}

export function isValidEthInput(value: string): boolean {
  return /^\d+(\.\d{1,18})?$/.test(value.trim())
}
