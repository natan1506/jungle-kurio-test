import { toSocketIo } from '@mswjs/socket.io-binding'
import { ws } from 'msw'
import type { Nft, NftUpdatedEvent, Order, OrderUpdatedEvent, RealtimeEvent } from '@/api/types'
import { db, nextEventSeq } from './db'

// Servidor Socket.IO simulado: MSW ws + @mswjs/socket.io-binding.

export const REALTIME_URL = (import.meta.env.VITE_REALTIME_URL as string | undefined) ?? 'wss://realtime.kurio.mock'

type Io = ReturnType<typeof toSocketIo>

interface Peer {
  id: number
  io: Io
  userId: string | null
  close: () => void
  pingTimer: ReturnType<typeof setInterval>
}

const peers = new Set<Peer>()
let peerSeq = 0
let offlineUntil = 0
const history: RealtimeEvent[] = []

const link = ws.link(`${REALTIME_URL}/*`)

function userFromToken(token: unknown): string | null {
  if (typeof token !== 'string') return null
  const session = db.state.sessions.find((s) => s.token === token && s.expiresAt > Date.now())
  return session?.userId ?? null
}

export const realtimeHandlers = [
  link.addEventListener('connection', (connection) => {
    if (Date.now() < offlineUntil) {
      connection.client.close()
      return
    }
    const io = toSocketIo(connection)
    const peer: Peer = {
      id: ++peerSeq,
      io,
      userId: null,
      close: () => connection.client.close(),
      // Engine.IO exige pings do servidor; sem eles o cliente encerra por timeout.
      pingTimer: setInterval(() => connection.client.send('2'), 20_000),
    }
    peers.add(peer)

    connection.client.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : ''
      // CONNECT com auth: 40{"token":"..."}
      if (raw.startsWith('40')) {
        try {
          const auth = JSON.parse(raw.slice(2) || '{}') as { token?: string }
          peer.userId = userFromToken(auth.token)
        } catch {
          peer.userId = null
        }
      }
    })

    io.client.on('session', (_event, payload: { token?: string | null }) => {
      peer.userId = userFromToken(payload?.token)
    })

    connection.client.addEventListener('close', () => {
      clearInterval(peer.pingTimer)
      peers.delete(peer)
    })
  }),
]

function deliver(event: RealtimeEvent, targetUserId: string | null) {
  history.push(event)
  if (history.length > 50) history.shift()
  for (const peer of peers) {
    if (targetUserId && peer.userId !== targetUserId) continue
    peer.io.client.emit(event.type, event)
  }
}

export function emitNftUpdated(nft: Nft) {
  const event: NftUpdatedEvent = {
    eventId: `evt_${nextEventSeq()}_${nft.id}`,
    type: 'nft.updated',
    resource: { type: 'nft', id: nft.id },
    version: nft.version,
    occurredAt: new Date().toISOString(),
    data: {
      priceEth: nft.priceEth,
      previousPriceEth: nft.previousPriceEth,
      available: nft.available,
      editions: nft.editions.map((e) => ({ id: e.id, available: e.available, priceEth: e.priceEth })),
    },
  }
  deliver(event, null)
  return event
}

export function emitOrderUpdated(order: Order & { userId: string }) {
  const event: OrderUpdatedEvent = {
    eventId: `evt_${nextEventSeq()}_${order.id}`,
    type: 'order.updated',
    resource: { type: 'order', id: order.id },
    version: order.version,
    occurredAt: new Date().toISOString(),
    data: { status: order.status, txHash: order.txHash, declineReason: order.declineReason },
  }
  deliver(event, order.userId)
  return event
}

export function replayLastEvent() {
  const last = history.at(-1)
  if (!last) return null
  for (const peer of peers) peer.io.client.emit(last.type, last)
  return last
}

export function emitStaleNftEvent(nft: Nft, staleVersion: number, priceEth: string) {
  const event: NftUpdatedEvent = {
    eventId: `evt_stale_${nextEventSeq()}_${nft.id}`,
    type: 'nft.updated',
    resource: { type: 'nft', id: nft.id },
    version: staleVersion,
    occurredAt: new Date(Date.now() - 60_000).toISOString(),
    data: {
      priceEth,
      previousPriceEth: null,
      available: nft.available,
      editions: nft.editions.map((e) => ({ id: e.id, available: e.available, priceEth: e.priceEth })),
    },
  }
  for (const peer of peers) peer.io.client.emit(event.type, event)
  return event
}

export function dropConnections(offlineMs = 0) {
  offlineUntil = Date.now() + offlineMs
  for (const peer of [...peers]) peer.close()
}

export function connectedPeers() {
  return [...peers].map((p) => ({ id: p.id, userId: p.userId }))
}
