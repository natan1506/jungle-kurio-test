import { HttpResponse } from 'msw'
import { resetCommerceRuntime, resolveOrder, updateNft } from '../commerce'
import { db, findNft, persist, resetDb } from '../db'
import { apiError, faults, readJson, resetNetworkState, route, type Fault } from '../http'
import { connectedPeers, dropConnections, emitStaleNftEvent, replayLastEvent } from '../realtime'
import { DEFAULT_CONFIG, isScenario, mockConfig, SCENARIOS, setConfig, type MockConfig } from '../scenarios'

/**
 * Endpoints de controle da simulação (`/api/__mock/*`). Usados pelo painel
 * de mocks e pelos testes Playwright. Passam pela mesma camada MSW e os
 * eventos resultantes chegam ao app pelo socket.io-client.
 */
export const controlHandlers = [
  route('get', '/__mock/state', 'control', () =>
    HttpResponse.json({ config: mockConfig.current, scenarios: SCENARIOS, peers: connectedPeers() }),
  ),

  route('post', '/__mock/scenario', 'control', async ({ request }) => {
    const body = await readJson<Partial<MockConfig>>(request)
    if (body.scenario !== undefined && !isScenario(body.scenario)) return apiError(422, 'VALIDATION_ERROR', 'Cenário desconhecido.')
    resetNetworkState()
    return HttpResponse.json(setConfig(body))
  }),

  route('post', '/__mock/reset', 'control', async ({ request }) => {
    const body = await readJson<{ keepScenario?: boolean }>(request)
    await resetDb()
    resetNetworkState()
    resetCommerceRuntime()
    if (!body.keepScenario) setConfig(DEFAULT_CONFIG)
    return HttpResponse.json({ ok: true, config: mockConfig.current })
  }),

  route('post', '/__mock/faults', 'control', async ({ request }) => {
    const body = await readJson<Fault>(request)
    faults.push({
      method: body.method ?? 'GET',
      path: body.path ?? '/',
      status: body.status ?? 500,
      code: body.code ?? 'INTERNAL_ERROR',
      times: body.times ?? 1,
      networkError: body.networkError,
      delayMs: body.delayMs,
    })
    return HttpResponse.json({ pending: faults.length })
  }),

  /** Altera preço/disponibilidade e emite `nft.updated`. */
  route<{ id: string }>('post', '/__mock/nfts/:id', 'control', async ({ request, params }) => {
    const body = await readJson<{ editionId?: string; priceEth?: string; available?: number }>(request)
    const nft = updateNft(params.id, body)
    if (!nft) return apiError(404, 'NOT_FOUND', 'NFT não encontrado.')
    return HttpResponse.json(nft)
  }),

  route('post', '/__mock/events/replay', 'control', () => HttpResponse.json({ replayed: replayLastEvent() })),

  route<{ id: string }>('post', '/__mock/events/stale/:id', 'control', async ({ params, request }) => {
    const nft = findNft(params.id)
    if (!nft) return apiError(404, 'NOT_FOUND', 'NFT não encontrado.')
    const { priceEth = '0.01' } = await readJson<{ priceEth: string }>(request)
    return HttpResponse.json({ event: emitStaleNftEvent(nft, Math.max(0, nft.version - 1), priceEth) })
  }),

  route('post', '/__mock/socket/drop', 'control', async ({ request }) => {
    const { offlineMs = 0 } = await readJson<{ offlineMs: number }>(request)
    dropConnections(offlineMs)
    return HttpResponse.json({ ok: true })
  }),

  route('post', '/__mock/session/expire', 'control', () => {
    for (const s of db.state.sessions) s.expiresAt = Date.now() - 1
    persist()
    return HttpResponse.json({ ok: true })
  }),

  route<{ id: string }>('post', '/__mock/orders/:id/resolve', 'control', async ({ params, request }) => {
    const order = db.state.orders.find((o) => o.id === params.id)
    if (!order) return apiError(404, 'NOT_FOUND', 'Pedido não encontrado.')
    const { status = 'confirmed' } = await readJson<{ status: 'confirmed' | 'declined' }>(request)
    return HttpResponse.json(resolveOrder(order, status))
  }),
]
