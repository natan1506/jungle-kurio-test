import Big from 'big.js'
import { HttpResponse } from 'msw'
import {
  CATEGORIES,
  NETWORKS,
  SORTS,
  TABS,
  type CategoryKey,
  type FeaturedResponse,
  type NetworkKey,
  type Nft,
  type NftListResponse,
  type NftSummary,
  type SortKey,
  type TabKey,
} from '@/api/types'
import { db, findNft, persist } from '../db'
import { apiError, optionalUser, requireUser, route } from '../http'
import { mockConfig } from '../scenarios'

export function toSummary(n: Nft): NftSummary {
  return {
    id: n.id,
    name: n.name,
    tokenId: n.tokenId,
    image: n.image,
    collection: n.collection,
    category: n.category,
    network: n.network,
    priceEth: n.priceEth,
    previousPriceEth: n.previousPriceEth,
    badge: n.badge,
    available: n.available,
    version: n.version,
  }
}

function list<T extends string>(params: URLSearchParams, key: string, allowed: readonly { key: T }[]): T[] {
  const raw = params.getAll(key).flatMap((v) => v.split(','))
  return raw.filter((v): v is T => allowed.some((a) => a.key === v))
}

function parsePrice(v: string | null): Big | null {
  if (!v || !/^\d+(\.\d+)?$/.test(v)) return null
  return new Big(v)
}

export const catalogHandlers = [
  route('get', '/nfts/featured', 'catalog', () => {
    const nfts = db.state.nfts
    return HttpResponse.json<FeaturedResponse>({
      hero: [nfts[0], nfts[5], nfts[6]].map(toSummary),
      spotlight: toSummary(nfts[1]),
    })
  }),

  route('get', '/nfts', 'catalog', ({ request }) => {
    const params = new URL(request.url).searchParams
    const q = (params.get('q') ?? '').trim().toLowerCase()
    const categories = list<CategoryKey>(params, 'categories', CATEGORIES)
    const networks = list<NetworkKey>(params, 'networks', NETWORKS)
    const priceMin = parsePrice(params.get('priceMin'))
    const priceMax = parsePrice(params.get('priceMax'))
    const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'all') as TabKey
    const sort = (SORTS.find((s) => s.key === params.get('sort'))?.key ?? 'recent') as SortKey
    const pageSize = Math.min(Math.max(Number(params.get('pageSize')) || 9, 1), 48)

    let base = mockConfig.current.scenario === 'empty' ? [] : [...db.state.nfts]
    if (params.get('favorites') === '1') {
      const user = optionalUser(request)
      if (!user) return apiError(401, 'UNAUTHENTICATED', 'Entre para ver seus favoritos.')
      base = base.filter((n) => user.favorites.includes(n.id))
    }
    if (q) base = base.filter((n) => `${n.name} ${n.collection} ${n.tokenId}`.toLowerCase().includes(q))
    if (tab === 'new') {
      const recent = new Set(
        [...base]
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .slice(0, 24)
          .map((n) => n.id),
      )
      base = base.filter((n) => recent.has(n.id))
    }
    if (tab === 'trending') base = base.filter((n) => n.reviewsCount >= 15)
    if (priceMin) base = base.filter((n) => new Big(n.priceEth).gte(priceMin))
    if (priceMax) base = base.filter((n) => new Big(n.priceEth).lte(priceMax))

    // Facetas contam considerando os demais filtros (combináveis).
    const byNetwork = networks.length ? base.filter((n) => networks.includes(n.network)) : base
    const byCategory = categories.length ? base.filter((n) => categories.includes(n.category)) : base
    const facets = {
      categories: CATEGORIES.map((c) => ({ key: c.key, count: byNetwork.filter((n) => n.category === c.key).length })),
      networks: NETWORKS.map((nw) => ({ key: nw.key, count: byCategory.filter((n) => n.network === nw.key).length })),
    }

    let items = base.filter(
      (n) => (!categories.length || categories.includes(n.category)) && (!networks.length || networks.includes(n.network)),
    )
    items.sort((a, b) => {
      switch (sort) {
        case 'price_asc':
          return new Big(a.priceEth).cmp(new Big(b.priceEth)) || a.id.localeCompare(b.id)
        case 'price_desc':
          return new Big(b.priceEth).cmp(new Big(a.priceEth)) || a.id.localeCompare(b.id)
        case 'popular':
          return b.reviewsCount - a.reviewsCount || a.id.localeCompare(b.id)
        default:
          return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id)
      }
    })
    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(Math.max(Number(params.get('page')) || 1, 1), totalPages)
    items = items.slice((page - 1) * pageSize, page * pageSize)

    const prices = db.state.nfts.map((n) => new Big(n.priceEth))
    const min = prices.reduce((a, b) => (b.lt(a) ? b : a), prices[0] ?? new Big(0))
    const max = prices.reduce((a, b) => (b.gt(a) ? b : a), prices[0] ?? new Big(0))

    return HttpResponse.json<NftListResponse>({
      items: items.map(toSummary),
      page,
      pageSize,
      total,
      totalPages,
      facets,
      priceRange: { min: min.toFixed(2), max: max.toFixed(2) },
    })
  }),

  route<{ id: string }>('get', '/nfts/:id', 'detail', ({ params }) => {
    const nft = findNft(params.id)
    if (!nft) return apiError(404, 'NOT_FOUND', 'NFT não encontrado.')
    return HttpResponse.json<Nft>(nft)
  }),

  route('get', '/me/favorites', 'favorite', ({ request }) => {
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    return HttpResponse.json({ nftIds: auth.user.favorites })
  }),

  route<{ id: string }>('put', '/me/favorites/:id', 'favorite', ({ request, params }) => {
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    if (!findNft(params.id)) return apiError(404, 'NOT_FOUND', 'NFT não encontrado.')
    if (!auth.user.favorites.includes(params.id)) auth.user.favorites.push(params.id)
    persist()
    return HttpResponse.json({ nftIds: auth.user.favorites })
  }),

  route<{ id: string }>('delete', '/me/favorites/:id', 'favorite', ({ request, params }) => {
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    auth.user.favorites = auth.user.favorites.filter((id) => id !== params.id)
    persist()
    return HttpResponse.json({ nftIds: auth.user.favorites })
  }),
]
