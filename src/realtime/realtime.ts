import type { QueryClient } from '@tanstack/react-query'
import type { Socket } from 'socket.io-client'
import { qk } from '@/api/endpoints'
import type { Cart, Nft, NftListResponse, NftUpdatedEvent, Order, OrderUpdatedEvent } from '@/api/types'
import { mocksReady } from '@/lib/mocks-ready'
import { sessionStore } from '@/lib/session-store'

export const REALTIME_URL = (import.meta.env.VITE_REALTIME_URL as string | undefined) ?? 'wss://realtime.kurio.mock'

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

type Listener<T> = (payload: T) => void

class Emitter<Events extends Record<string, unknown>> {
  private map = new Map<keyof Events, Set<Listener<never>>>()
  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>) {
    if (!this.map.has(event)) this.map.set(event, new Set())
    this.map.get(event)!.add(fn as Listener<never>)
    return () => {
      this.map.get(event)?.delete(fn as Listener<never>)
    }
  }
  emit<K extends keyof Events>(event: K, payload: Events[K]) {
    for (const fn of this.map.get(event) ?? []) (fn as Listener<Events[K]>)(payload)
  }
}

export const realtimeBus = new Emitter<{
  'nft.applied': NftUpdatedEvent
  'order.applied': OrderUpdatedEvent
  'connection': ConnectionState
  'reconciled': undefined
}>()

const SEEN_LIMIT = 500

// Dedup por eventId, ignora versão antiga e reconcilia com REST ao reconectar.
export class RealtimeClient {
  private socket: Socket | null = null
  private seen = new Set<string>()
  private versions = new Map<string, number>()
  private userId: string | null = null
  state: ConnectionState = 'disconnected'
  private unsubs: (() => void)[] = []

  private readonly queryClient: QueryClient

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient
  }

  private generation = 0

  async start() {
    const generation = ++this.generation
    this.userId = sessionStore.get()?.user.id ?? null
    // Import tardio: o engine.io captura o WebSocket global no import (precisa ser o do MSW).
    await mocksReady
    const { io } = await import('socket.io-client')
    // StrictMode monta duas vezes.
    if (generation !== this.generation) return
    const socket = io(REALTIME_URL, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: sessionStore.token() }),
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 5000,
    })
    this.socket = socket
    this.setState('connecting')

    socket.on('connect', () => {
      const wasReconnect = this.state === 'reconnecting'
      this.setState('connected')
      if (wasReconnect) this.reconcile()
    })
    socket.on('disconnect', (reason) => {
      this.setState(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting')
    })
    socket.io.on('reconnect_attempt', () => this.setState('reconnecting'))
    socket.on('nft.updated', (e: NftUpdatedEvent) => this.onNft(e))
    socket.on('order.updated', (e: OrderUpdatedEvent) => this.onOrder(e))

    // Outro usuário: reconecta com o novo token.
    this.unsubs.push(
      sessionStore.subscribe(() => {
        const next = sessionStore.get()?.user.id ?? null
        if (next === this.userId) return
        this.userId = next
        this.resetOrderVersions()
        socket.disconnect()
        this.setState('connecting')
        socket.connect()
      }),
    )
  }

  stop() {
    this.generation += 1
    this.unsubs.forEach((u) => u())
    this.unsubs = []
    this.socket?.removeAllListeners()
    this.socket?.io.removeAllListeners()
    this.socket?.disconnect()
    this.socket = null
    this.setState('disconnected')
  }

  private setState(state: ConnectionState) {
    this.state = state
    realtimeBus.emit('connection', state)
  }

  private resetOrderVersions() {
    for (const key of [...this.versions.keys()]) if (key.startsWith('order:')) this.versions.delete(key)
  }

  private accept(e: { eventId: string; resource: { type: string; id: string }; version: number }) {
    if (this.seen.has(e.eventId)) return false
    this.seen.add(e.eventId)
    if (this.seen.size > SEEN_LIMIT) this.seen.delete(this.seen.values().next().value!)
    const key = `${e.resource.type}:${e.resource.id}`
    const known = this.versions.get(key) ?? 0
    if (e.version <= known) return false
    this.versions.set(key, e.version)
    return true
  }

  // Versão vinda do REST, para não regredir com evento antigo.
  observeVersion(type: 'nft' | 'order', id: string, version: number) {
    const key = `${type}:${id}`
    if ((this.versions.get(key) ?? 0) < version) this.versions.set(key, version)
  }

  private onNft(e: NftUpdatedEvent) {
    const id = e.resource.id
    const cachedDetail = this.queryClient.getQueryData<Nft>(qk.nft(id))
    if (cachedDetail) this.observeVersion('nft', id, cachedDetail.version)
    if (!this.accept(e)) return

    this.queryClient.setQueryData<Nft>(qk.nft(id), (old) =>
      old && old.version < e.version
        ? {
            ...old,
            priceEth: e.data.priceEth,
            previousPriceEth: e.data.previousPriceEth,
            available: e.data.available,
            version: e.version,
            editions: old.editions.map((ed) => {
              const next = e.data.editions.find((x) => x.id === ed.id)
              return next ? { ...ed, available: next.available, priceEth: next.priceEth } : ed
            }),
          }
        : old,
    )
    this.queryClient.setQueriesData<NftListResponse>({ queryKey: ['catalog', 'list'] }, (old) =>
      old
        ? {
            ...old,
            items: old.items.map((n) =>
              n.id === id && n.version < e.version
                ? { ...n, priceEth: e.data.priceEth, previousPriceEth: e.data.previousPriceEth, available: e.data.available, version: e.version }
                : n,
            ),
          }
        : old,
    )
    // O resumo do carrinho vem da API.
    const carts = this.queryClient.getQueriesData<Cart>({ queryKey: ['cart'] }).concat(
      this.queryClient.getQueriesData<Cart>({ queryKey: ['user'] }).filter(([key]) => key[2] === 'cart'),
    )
    if (carts.some(([, cart]) => cart?.items?.some((i) => i.nftId === id))) {
      void this.queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'cart' || (q.queryKey[0] === 'user' && q.queryKey[2] === 'cart') })
    }
    realtimeBus.emit('nft.applied', e)
  }

  private onOrder(e: OrderUpdatedEvent) {
    const userId = sessionStore.get()?.user.id
    if (!userId || userId !== this.userId) return
    const key = qk.order(userId, e.resource.id)
    const cached = this.queryClient.getQueryData<Order>(key)
    if (cached) this.observeVersion('order', e.resource.id, cached.version)
    if (!this.accept(e)) return
    this.queryClient.setQueryData<Order>(key, (old) =>
      old && old.version < e.version && old.status === 'pending'
        ? { ...old, status: e.data.status, txHash: e.data.txHash, declineReason: e.data.declineReason, version: e.version }
        : old,
    )
    void this.queryClient.invalidateQueries({ queryKey: key })
    void this.queryClient.invalidateQueries({ queryKey: qk.pendingOrders(userId) })
    if (e.data.status === 'confirmed') {
      void this.queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'user' && q.queryKey[2] === 'cart' })
    }
    realtimeBus.emit('order.applied', e)
  }

  private reconcile() {
    void this.queryClient.invalidateQueries({ refetchType: 'active' })
    realtimeBus.emit('reconciled', undefined)
  }
}

let instance: RealtimeClient | null = null
export function getRealtime(queryClient: QueryClient) {
  if (!instance) instance = new RealtimeClient(queryClient)
  return instance
}
