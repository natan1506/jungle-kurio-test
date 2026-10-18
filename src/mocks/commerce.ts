import Big from 'big.js'
import type { Cart, CartItem, CartNotice, Coupon, NetworkKey, PriceSummary, Quote, QuoteChange, QuoteLine } from '@/api/types'
import { toEthString } from '@/lib/money'
import { db, findNft, persist, randomId, type CartRecord, type OrderRecord, type QuoteRecord } from './db'
import { COUPONS, NETWORK_FEES } from './fixtures'
import { emitNftUpdated, emitOrderUpdated } from './realtime'
import { mockConfig } from './scenarios'

/* ---------- Carrinho ---------- */

export function getOrCreateCart(id: string, ownerId: string | null): CartRecord {
  let cart = db.state.carts[id]
  if (!cart) {
    cart = { id, ownerId, items: [], couponCode: null, version: 1, updatedAt: new Date().toISOString() }
    db.state.carts[id] = cart
  }
  return cart
}

export function userCart(userId: string): CartRecord {
  const existing = Object.values(db.state.carts).find((c) => c.ownerId === userId)
  return existing ?? getOrCreateCart(`cart_${userId}`, userId)
}

export function touch(cart: CartRecord) {
  cart.version += 1
  cart.updatedAt = new Date().toISOString()
  persist()
}

export function couponFor(code: string | null): { coupon: Coupon | null; error: 'COUPON_INVALID' | 'COUPON_EXPIRED' | null } {
  if (!code) return { coupon: null, error: null }
  const def = COUPONS[code.toUpperCase()]
  if (!def) return { coupon: null, error: 'COUPON_INVALID' }
  if (def.expired) return { coupon: null, error: 'COUPON_EXPIRED' }
  return { coupon: { code: code.toUpperCase(), label: def.label, percentOff: def.percentOff }, error: null }
}

export function summarize(lineTotals: Big[], coupon: Coupon | null, network: NetworkKey | null): PriceSummary {
  const subtotal = lineTotals.reduce((a, b) => a.plus(b), new Big(0))
  const discount = coupon ? subtotal.times(coupon.percentOff).div(100).round(6) : new Big(0)
  const fee = subtotal.gt(0) && network ? new Big(NETWORK_FEES[network]) : new Big(0)
  return {
    subtotalEth: toEthString(subtotal),
    discountEth: toEthString(discount),
    networkFeeEth: toEthString(fee),
    totalEth: toEthString(subtotal.minus(discount).plus(fee)),
  }
}

export function cartView(cart: CartRecord): Cart {
  let mutated = false
  const items: CartItem[] = []
  for (const record of cart.items) {
    const nft = findNft(record.nftId)
    const edition = nft?.editions.find((e) => e.id === record.editionId)
    if (!nft || !edition) continue
    const notices: CartNotice[] = []
    if (edition.priceEth !== record.seenUnitPriceEth) {
      notices.push({ type: 'price_changed', fromEth: record.seenUnitPriceEth, toEth: edition.priceEth })
    }
    if (edition.available === 0) {
      notices.push({ type: 'sold_out' })
    } else if (record.quantity > edition.available) {
      record.quantity = edition.available
      mutated = true
    }
    if (edition.available > 0 && record.seenQuantity > record.quantity) {
      notices.push({ type: 'quantity_reduced', from: record.seenQuantity, to: record.quantity })
    }
    const unit = new Big(edition.priceEth)
    const effectiveQty = edition.available === 0 ? 0 : record.quantity
    items.push({
      id: record.id,
      nftId: nft.id,
      editionId: edition.id,
      editionLabel: edition.label,
      name: nft.name,
      tokenId: nft.tokenId,
      image: nft.image,
      quantity: record.quantity,
      unitPriceEth: edition.priceEth,
      lineTotalEth: toEthString(unit.times(effectiveQty)),
      available: edition.available,
      maxPerOrder: edition.maxPerOrder,
      notices,
    })
  }
  if (mutated) touch(cart)
  const { coupon } = couponFor(cart.couponCode)
  const owner = cart.ownerId ? db.state.users.find((u) => u.id === cart.ownerId) : undefined
  const feeNetwork: NetworkKey = owner?.wallets.find((w) => w.slot === 'primary')?.network ?? 'ethereum'
  return {
    id: cart.id,
    items,
    feeNetwork,
    coupon,
    summary: summarize(
      items.map((i) => new Big(i.lineTotalEth)),
      coupon,
      items.length ? feeNetwork : null,
    ),
    itemCount: items.reduce((a, i) => a + i.quantity, 0),
    version: cart.version,
    updatedAt: cart.updatedAt,
  }
}

/* ---------- Cotação ---------- */

export function buildQuote(cart: CartRecord, network: NetworkKey, userId: string): QuoteRecord {
  const view = cartView(cart)
  const lines: QuoteLine[] = view.items
    .filter((i) => i.available > 0 && i.quantity > 0)
    .map((i) => ({
      cartItemId: i.id,
      nftId: i.nftId,
      editionId: i.editionId,
      editionLabel: i.editionLabel,
      name: i.name,
      tokenId: i.tokenId,
      image: i.image,
      quantity: i.quantity,
      unitPriceEth: i.unitPriceEth,
      lineTotalEth: i.lineTotalEth,
    }))
  const now = Date.now()
  return {
    id: randomId('q'),
    userId,
    cartId: cart.id,
    network,
    lines,
    coupon: view.coupon,
    summary: summarize(
      lines.map((l) => new Big(l.lineTotalEth)),
      view.coupon,
      network,
    ),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
  }
}

export function publicQuote(q: QuoteRecord): Quote {
  const { userId: _u, cartId: _c, ...quote } = q
  return quote
}

export function diffQuotes(previous: Quote, fresh: Quote): QuoteChange[] {
  const changes: QuoteChange[] = []
  for (const line of previous.lines) {
    const now = fresh.lines.find((l) => l.cartItemId === line.cartItemId)
    if (!now) {
      changes.push({ nftId: line.nftId, name: line.name, kind: 'availability', message: `${line.name} (${line.editionLabel}) esgotou.` })
      continue
    }
    if (now.unitPriceEth !== line.unitPriceEth) {
      changes.push({
        nftId: line.nftId,
        name: line.name,
        kind: 'price',
        message: `Preço de ${line.name} mudou de ${line.unitPriceEth} ETH para ${now.unitPriceEth} ETH.`,
      })
    }
    if (now.quantity !== line.quantity) {
      changes.push({
        nftId: line.nftId,
        name: line.name,
        kind: 'availability',
        message: `Quantidade disponível de ${line.name} mudou de ${line.quantity} para ${now.quantity}.`,
      })
    }
  }
  for (const line of fresh.lines) {
    if (!previous.lines.some((l) => l.cartItemId === line.cartItemId)) {
      changes.push({ nftId: line.nftId, name: line.name, kind: 'availability', message: `${line.name} foi adicionado ao pedido.` })
    }
  }
  if ((previous.coupon?.code ?? null) !== (fresh.coupon?.code ?? null)) {
    changes.push({ nftId: '', name: 'Cupom', kind: 'coupon', message: 'O cupom aplicado não é mais válido.' })
  }
  if (previous.summary.networkFeeEth !== fresh.summary.networkFeeEth) {
    changes.push({
      nftId: '',
      name: 'Taxa de rede',
      kind: 'fee',
      message: `Taxa de rede mudou de ${previous.summary.networkFeeEth} ETH para ${fresh.summary.networkFeeEth} ETH.`,
    })
  }
  return changes
}

/* ---------- Mudanças de catálogo (com evento em tempo real) ---------- */

export function updateNft(nftId: string, patch: { editionId?: string; priceEth?: string; available?: number }) {
  const nft = findNft(nftId)
  if (!nft) return null
  const edition = nft.editions.find((e) => e.id === (patch.editionId ?? 'e50')) ?? nft.editions[0]
  if (patch.priceEth !== undefined) {
    if (edition.id === 'e50') {
      nft.previousPriceEth = nft.priceEth
      nft.priceEth = patch.priceEth
    }
    edition.priceEth = patch.priceEth
  }
  if (patch.available !== undefined) edition.available = Math.max(0, patch.available)
  nft.available = nft.editions.reduce((a, e) => a + e.available, 0)
  nft.version += 1
  persist()
  emitNftUpdated(nft)
  return nft
}

let checkoutScenarioFired = false
export function resetCommerceRuntime() {
  checkoutScenarioFired = false
  for (const t of orderTimers.values()) clearTimeout(t)
  orderTimers.clear()
}

// price-change/sold-out: altera o 1º item enquanto o usuário revisa.
export function maybeTriggerCheckoutScenario(quote: QuoteRecord) {
  const { scenario, checkoutChangeDelayMs } = mockConfig.current
  if (checkoutScenarioFired || !quote.lines.length) return
  if (scenario !== 'price-change' && scenario !== 'sold-out') return
  checkoutScenarioFired = true
  const line = quote.lines[0]
  setTimeout(() => {
    if (scenario === 'price-change') {
      const next = new Big(line.unitPriceEth).plus('0.15')
      updateNft(line.nftId, { editionId: line.editionId, priceEth: toEthString(next) })
    } else {
      updateNft(line.nftId, { editionId: line.editionId, available: 0 })
    }
  }, checkoutChangeDelayMs)
}

/* ---------- Pedidos ---------- */

export const EXPLORERS = {
  ethereum: { name: 'Etherscan', url: 'https://etherscan.io' },
  polygon: { name: 'Polygonscan', url: 'https://polygonscan.com' },
  solana: { name: 'Solscan', url: 'https://solscan.io' },
} as const

const orderTimers = new Map<string, ReturnType<typeof setTimeout>>()

function randomHex(len: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(len / 2))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function resolveOrder(order: OrderRecord, forced?: 'confirmed' | 'declined') {
  if (order.status !== 'pending') return order
  const outcome = forced ?? order.outcome
  let declineReason: string | null = outcome === 'declined' ? 'Pagamento recusado pela carteira.' : null

  if (outcome === 'confirmed') {
    // Revalida o estoque no momento da liquidação.
    for (const line of order.lines) {
      const ed = findNft(line.nftId)?.editions.find((e) => e.id === line.editionId)
      if (!ed || ed.available < line.quantity) {
        declineReason = `Edição ${line.editionLabel} de ${line.name} esgotou antes da liquidação.`
      }
    }
  }

  if (!declineReason) {
    for (const line of order.lines) {
      const nft = findNft(line.nftId)
      const ed = nft?.editions.find((e) => e.id === line.editionId)
      if (nft && ed) {
        updateNft(nft.id, { editionId: ed.id, available: ed.available - line.quantity })
      }
    }
    // Remove do carrinho apenas os itens e quantidades comprados.
    const cart = userCart(order.userId)
    for (const line of order.lines) {
      const item = cart.items.find((i) => i.nftId === line.nftId && i.editionId === line.editionId)
      if (!item) continue
      item.quantity -= line.quantity
      item.seenQuantity = item.quantity
    }
    cart.items = cart.items.filter((i) => i.quantity > 0)
    if (!cart.items.length) cart.couponCode = null
    touch(cart)
    order.status = 'confirmed'
    order.txHash = `0x${randomHex(64)}`
    order.explorerUrl = `${EXPLORERS[order.network].url}/tx/${order.txHash}`
  } else {
    order.status = 'declined'
    order.declineReason = declineReason
  }
  order.version += 1
  order.updatedAt = new Date().toISOString()
  persist()
  emitOrderUpdated(order)
  return order
}

export function scheduleOrder(order: OrderRecord) {
  if (order.status !== 'pending' || orderTimers.has(order.id)) return
  const wait = Math.max(0, order.resolveAt - Date.now())
  orderTimers.set(
    order.id,
    setTimeout(() => {
      orderTimers.delete(order.id)
      const current = db.state.orders.find((o) => o.id === order.id)
      if (current) resolveOrder(current)
    }, wait),
  )
}

export function schedulePendingOrders() {
  for (const order of db.state.orders) scheduleOrder(order)
}

// Resolve pendências vencidas mesmo sem timer (ex.: após refresh).
export function settleIfDue(order: OrderRecord) {
  if (order.status === 'pending' && order.resolveAt <= Date.now() && !orderTimers.has(order.id)) {
    resolveOrder(order)
  }
  return order
}

export function publicOrder(o: OrderRecord) {
  const { userId: _u, idempotencyKey: _k, resolveAt: _r, outcome: _o, ...order } = o
  return order
}
