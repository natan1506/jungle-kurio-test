import { z } from 'zod'
import { CATEGORIES, NETWORKS, SORTS, TABS, type NftListParams } from '@/api/types'

const keys = <T extends readonly { key: string }[]>(list: T) => list.map((i) => i.key) as [T[number]['key'], ...T[number]['key'][]]

const csvOf = <T extends string>(values: [T, ...T[]]) =>
  z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => {
      const raw = Array.isArray(v) ? v : v ? v.split(',') : []
      const valid = raw.filter((x): x is T => (values as string[]).includes(x))
      return valid.length ? [...new Set(valid)].sort() : undefined
    })

const price = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    const s = v === undefined ? undefined : String(v)
    return s && /^\d+(\.\d+)?$/.test(s) ? s : undefined
  })

export const catalogSearchSchema = z.object({
  q: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim().slice(0, 80) : undefined)),
  categories: csvOf(keys(CATEGORIES)),
  networks: csvOf(keys(NETWORKS)),
  priceMin: price,
  priceMax: price,
  tab: z.enum(keys(TABS)).optional().catch(undefined),
  sort: z.enum(keys(SORTS)).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  favorites: z.coerce.boolean().optional().catch(undefined),
})

export type CatalogSearch = Partial<z.output<typeof catalogSearchSchema>>

export function toListParams(s: CatalogSearch): NftListParams {
  return {
    q: s.q,
    categories: s.categories,
    networks: s.networks,
    priceMin: s.priceMin,
    priceMax: s.priceMax,
    tab: s.tab ?? 'all',
    sort: s.sort ?? 'recent',
    page: s.page ?? 1,
    pageSize: 9,
    favoritesOnly: s.favorites || undefined,
  }
}
