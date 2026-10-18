import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'
import { qk } from '@/api/endpoints'
import type { Nft, NftListResponse, NftUpdatedEvent } from '@/api/types'
import { RealtimeClient } from './realtime'

type Internals = { onNft(e: NftUpdatedEvent): void }

const nft = { id: 'emerald-ape-042', name: 'Emerald Ape #042', priceEth: '1.19', previousPriceEth: null, available: 16, version: 1, editions: [{ id: 'e50', label: '1/50', supply: 50, available: 12, maxPerOrder: 10, priceEth: '1.19' }] } as unknown as Nft

function event(eventId: string, version: number, priceEth: string): NftUpdatedEvent {
  return {
    eventId,
    type: 'nft.updated',
    resource: { type: 'nft', id: nft.id },
    version,
    occurredAt: new Date().toISOString(),
    data: { priceEth, previousPriceEth: '1.19', available: 16, editions: [{ id: 'e50', available: 12, priceEth }] },
  }
}

describe('RealtimeClient', () => {
  let qc: QueryClient
  let client: Internals
  const price = () => qc.getQueryData<Nft>(qk.nft(nft.id))?.priceEth
  const listPrice = () => qc.getQueryData<NftListResponse>(qk.catalog({ page: 1 }))?.items[0].priceEth

  beforeEach(() => {
    qc = new QueryClient()
    qc.setQueryData(qk.nft(nft.id), nft)
    qc.setQueryData(qk.catalog({ page: 1 }), { items: [{ ...nft }] } as unknown as NftListResponse)
    client = new RealtimeClient(qc) as unknown as Internals
  })

  it('aplica evento mais novo no detalhe e na lista', () => {
    client.onNft(event('a', 2, '1.29'))
    expect(price()).toBe('1.29')
    expect(listPrice()).toBe('1.29')
    expect(qc.getQueryData<Nft>(qk.nft(nft.id))?.editions[0].priceEth).toBe('1.29')
  })

  it('ignora evento duplicado (mesmo eventId)', () => {
    client.onNft(event('a', 2, '1.29'))
    client.onNft({ ...event('a', 3, '9.99') })
    expect(price()).toBe('1.29')
  })

  it('não regride com evento de versão antiga', () => {
    client.onNft(event('a', 3, '1.50'))
    client.onNft(event('b', 2, '0.01'))
    expect(price()).toBe('1.50')
  })

  it('respeita a versão que já veio do REST', () => {
    qc.setQueryData(qk.nft(nft.id), { ...nft, priceEth: '2.00', version: 5 })
    client.onNft(event('a', 4, '0.50'))
    expect(price()).toBe('2.00')
  })
})
