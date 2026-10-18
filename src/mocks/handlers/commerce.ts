import { delay, HttpResponse } from 'msw'
import type { CreateOrderInput, NetworkKey, Order, QuoteStaleDetails } from '@/api/types'
import { NETWORKS } from '@/api/types'
import {
  buildQuote,
  cartView,
  couponFor,
  diffQuotes,
  getOrCreateCart,
  maybeTriggerCheckoutScenario,
  publicOrder,
  publicQuote,
  scheduleOrder,
  settleIfDue,
  touch,
  userCart,
} from '../commerce'
import { db, findNft, persist, randomId, type CartRecord, type OrderRecord } from '../db'
import { apiError, bearer, ETH_ADDRESS_RE, EMAIL_RE, readJson, requireUser, route } from '../http'
import { mockConfig } from '../scenarios'

// Usuário logado usa o próprio carrinho; visitante, o de X-Cart-Id.
function resolveCart(request: Request): { cart: CartRecord } | { response: Response } {
  if (bearer(request)) {
    const auth = requireUser(request)
    if ('response' in auth) return auth
    return { cart: userCart(auth.user.id) }
  }
  const id = request.headers.get('x-cart-id')
  if (!id || !/^guest_[a-z0-9-]{8,64}$/i.test(id)) {
    return { response: apiError(400, 'VALIDATION_ERROR', 'Identificador de carrinho ausente.') }
  }
  const cart = getOrCreateCart(id, null)
  if (cart.ownerId) return { response: apiError(403, 'FORBIDDEN', 'Carrinho pertence a outro usuário.') }
  return { cart }
}

function addToCart(cart: CartRecord, nftId: string, editionId: string, quantity: number) {
  const nft = findNft(nftId)
  const edition = nft?.editions.find((e) => e.id === editionId)
  if (!nft) return apiError(404, 'NOT_FOUND', 'NFT não encontrado.')
  if (!edition || edition.available === 0) {
    return apiError(409, 'EDITION_UNAVAILABLE', 'Esta edição está indisponível.')
  }
  const existing = cart.items.find((i) => i.nftId === nftId && i.editionId === editionId)
  const nextQty = (existing?.quantity ?? 0) + quantity
  const limit = Math.min(edition.available, edition.maxPerOrder)
  if (nextQty > limit) {
    return apiError(409, 'INSUFFICIENT_AVAILABILITY', `Limite de ${limit} unidade(s) para esta edição.`, {
      details: { limit, inCart: existing?.quantity ?? 0 },
    })
  }
  if (existing) {
    existing.quantity = nextQty
    existing.seenQuantity = nextQty
    existing.seenUnitPriceEth = edition.priceEth
  } else {
    cart.items.push({
      id: randomId('ci'),
      nftId,
      editionId,
      quantity,
      seenUnitPriceEth: edition.priceEth,
      seenQuantity: quantity,
    })
  }
  return null
}

export const commerceHandlers = [
  route('get', '/cart', 'private', ({ request }) => {
    const r = resolveCart(request)
    if ('response' in r) return r.response
    return HttpResponse.json(cartView(r.cart))
  }),

  route('post', '/cart/items', 'private', async ({ request }) => {
    const r = resolveCart(request)
    if ('response' in r) return r.response
    const body = await readJson<{ nftId: string; editionId: string; quantity: number }>(request)
    const quantity = Number(body.quantity)
    if (!Number.isInteger(quantity) || quantity < 1) {
      return apiError(422, 'VALIDATION_ERROR', 'Quantidade inválida.', { fieldErrors: { quantity: 'Informe um número inteiro maior que zero.' } })
    }
    const err = addToCart(r.cart, String(body.nftId), String(body.editionId), quantity)
    if (err) return err
    touch(r.cart)
    return HttpResponse.json(cartView(r.cart), { status: 201 })
  }),

  route<{ id: string }>('patch', '/cart/items/:id', 'private', async ({ request, params }) => {
    const r = resolveCart(request)
    if ('response' in r) return r.response
    const item = r.cart.items.find((i) => i.id === params.id)
    if (!item) return apiError(404, 'NOT_FOUND', 'Item não está no carrinho.')
    const body = await readJson<{ quantity: number }>(request)
    const quantity = Number(body.quantity)
    if (!Number.isInteger(quantity) || quantity < 1) {
      return apiError(422, 'VALIDATION_ERROR', 'Quantidade inválida.')
    }
    const edition = findNft(item.nftId)?.editions.find((e) => e.id === item.editionId)
    const limit = Math.min(edition?.available ?? 0, edition?.maxPerOrder ?? 0)
    if (quantity > limit) {
      return apiError(409, 'INSUFFICIENT_AVAILABILITY', `Limite de ${limit} unidade(s) para esta edição.`, { details: { limit } })
    }
    item.quantity = quantity
    item.seenQuantity = quantity
    touch(r.cart)
    return HttpResponse.json(cartView(r.cart))
  }),

  route<{ id: string }>('delete', '/cart/items/:id', 'private', ({ request, params }) => {
    const r = resolveCart(request)
    if ('response' in r) return r.response
    r.cart.items = r.cart.items.filter((i) => i.id !== params.id)
    if (!r.cart.items.length) r.cart.couponCode = null
    touch(r.cart)
    return HttpResponse.json(cartView(r.cart))
  }),

  route('post', '/cart/ack', 'private', ({ request }) => {
    const r = resolveCart(request)
    if ('response' in r) return r.response
    for (const item of r.cart.items) {
      const ed = findNft(item.nftId)?.editions.find((e) => e.id === item.editionId)
      if (ed) item.seenUnitPriceEth = ed.priceEth
      item.seenQuantity = item.quantity
    }
    touch(r.cart)
    return HttpResponse.json(cartView(r.cart))
  }),

  route('put', '/cart/coupon', 'private', async ({ request }) => {
    const r = resolveCart(request)
    if ('response' in r) return r.response
    const { code } = await readJson<{ code: string }>(request)
    if (!code?.trim()) {
      return apiError(422, 'VALIDATION_ERROR', 'Informe o código.', { fieldErrors: { code: 'Informe o código.' } })
    }
    const { error } = couponFor(code.trim())
    if (error === 'COUPON_EXPIRED') {
      return apiError(422, 'COUPON_EXPIRED', 'Este cupom expirou.', { fieldErrors: { code: 'Este cupom expirou.' } })
    }
    if (error) return apiError(422, 'COUPON_INVALID', 'Cupom inválido.', { fieldErrors: { code: 'Cupom inválido.' } })
    if (!r.cart.items.length) return apiError(422, 'VALIDATION_ERROR', 'Adicione itens antes de aplicar um cupom.')
    r.cart.couponCode = code.trim().toUpperCase()
    touch(r.cart)
    return HttpResponse.json(cartView(r.cart))
  }),

  route('delete', '/cart/coupon', 'private', ({ request }) => {
    const r = resolveCart(request)
    if ('response' in r) return r.response
    r.cart.couponCode = null
    touch(r.cart)
    return HttpResponse.json(cartView(r.cart))
  }),

  route('post', '/cart/merge', 'private', async ({ request }) => {
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const { guestCartId } = await readJson<{ guestCartId: string }>(request)
    const target = userCart(auth.user.id)
    const guest = guestCartId ? db.state.carts[guestCartId] : undefined
    if (guest && !guest.ownerId) {
      for (const item of guest.items) {
        const edition = findNft(item.nftId)?.editions.find((e) => e.id === item.editionId)
        if (!edition || edition.available === 0) continue
        const existing = target.items.find((i) => i.nftId === item.nftId && i.editionId === item.editionId)
        const limit = Math.min(edition.available, edition.maxPerOrder)
        if (existing) {
          existing.quantity = Math.min(limit, Math.max(existing.quantity, item.quantity))
          existing.seenQuantity = existing.quantity
        } else {
          target.items.push({ ...item, id: randomId('ci'), quantity: Math.min(limit, item.quantity), seenQuantity: Math.min(limit, item.quantity) })
        }
      }
      if (guest.couponCode && !target.couponCode) target.couponCode = guest.couponCode
      delete db.state.carts[guest.id]
      touch(target)
    }
    persist()
    return HttpResponse.json(cartView(target))
  }),

  /* ---------- Checkout ---------- */

  route('post', '/checkout/quote', 'private', async ({ request }) => {
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const { network } = await readJson<{ network: NetworkKey }>(request)
    if (!NETWORKS.some((n) => n.key === network)) {
      return apiError(422, 'VALIDATION_ERROR', 'Selecione uma rede.', { fieldErrors: { network: 'Selecione uma rede.' } })
    }
    const cart = userCart(auth.user.id)
    const quote = buildQuote(cart, network!, auth.user.id)
    if (!quote.lines.length) return apiError(422, 'VALIDATION_ERROR', 'Seu carrinho não tem itens disponíveis.')
    db.state.quotes[quote.id] = quote
    persist()
    maybeTriggerCheckoutScenario(quote)
    return HttpResponse.json(publicQuote(quote), { status: 201 })
  }),

  route('get', '/orders', 'private', ({ request }) => {
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const status = new URL(request.url).searchParams.get('status')
    const orders = db.state.orders
      .filter((o) => o.userId === auth.user.id)
      .map(settleIfDue)
      .filter((o) => !status || o.status === status)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    return HttpResponse.json({ items: orders.map(publicOrder) })
  }),

  route<{ id: string }>('get', '/orders/:id', 'private', ({ request, params }) => {
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const order = db.state.orders.find((o) => o.id === params.id)
    if (!order) return apiError(404, 'NOT_FOUND', 'Pedido não encontrado.')
    if (order.userId !== auth.user.id) return apiError(403, 'FORBIDDEN', 'Este pedido pertence a outra conta.')
    return HttpResponse.json<Order>(publicOrder(settleIfDue(order)))
  }),

  route('post', '/orders', 'private', async ({ request }) => {
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const key = request.headers.get('idempotency-key')
    if (!key || key.length < 8) return apiError(400, 'VALIDATION_ERROR', 'Cabeçalho Idempotency-Key obrigatório.')
    const body = await readJson<CreateOrderInput>(request)
    const requestHash = JSON.stringify([body.quoteId, body.walletId, body.network])
    const idemKey = `${auth.user.id}:${key}`

    const previous = db.state.idempotency[idemKey]
    if (previous) {
      if (previous.requestHash !== requestHash) {
        return apiError(409, 'IDEMPOTENCY_CONFLICT', 'Esta chave de idempotência já foi usada com outro conteúdo.')
      }
      const order = db.state.orders.find((o) => o.id === previous.orderId)!
      return HttpResponse.json<Order>(publicOrder(settleIfDue(order)), { status: 200 })
    }

    const buyer = body.buyer
    const fieldErrors: Record<string, string> = {}
    if (!buyer?.displayName?.trim()) fieldErrors.displayName = 'Informe o nome de exibição.'
    if (!buyer?.username?.trim()) fieldErrors.username = 'Informe o nome de usuário.'
    if (!buyer?.profileName?.trim()) fieldErrors.profileName = 'Informe o nome do perfil.'
    if (!buyer?.walletAddress || !ETH_ADDRESS_RE.test(buyer.walletAddress)) fieldErrors.walletAddress = 'Endereço de carteira inválido.'
    if (!buyer?.email || !EMAIL_RE.test(buyer.email)) fieldErrors.email = 'Informe um e-mail válido.'
    if (Object.keys(fieldErrors).length) return apiError(422, 'VALIDATION_ERROR', 'Revise os dados do colecionador.', { fieldErrors })

    const wallet = auth.user.wallets.find((w) => w.id === body.walletId)
    if (!wallet) return apiError(422, 'VALIDATION_ERROR', 'Selecione uma carteira cadastrada.', { fieldErrors: { walletId: 'Selecione uma carteira.' } })

    const quote = body.quoteId ? db.state.quotes[body.quoteId] : undefined
    if (!quote || quote.userId !== auth.user.id) return apiError(404, 'NOT_FOUND', 'Cotação não encontrada.')

    // Revalida preço, disponibilidade, cupom e taxas.
    const fresh = buildQuote(userCart(auth.user.id), body.network ?? quote.network, auth.user.id)
    const changes = diffQuotes(quote, fresh)
    const expired = Date.parse(quote.expiresAt) < Date.now()
    if (changes.length || expired || body.network !== quote.network) {
      db.state.quotes[fresh.id] = fresh
      persist()
      return apiError(409, 'QUOTE_STALE', 'A cotação mudou. Revise e confirme novamente.', {
        details: {
          quote: publicQuote(fresh),
          changes: expired && !changes.length ? [{ nftId: '', name: 'Cotação', kind: 'fee', message: 'A cotação expirou.' }] : changes,
        } satisfies QuoteStaleDetails,
      })
    }

    const now = new Date().toISOString()
    const order: OrderRecord = {
      id: randomId('ord'),
      status: 'pending',
      declineReason: null,
      txHash: null,
      explorerUrl: null,
      quoteId: quote.id,
      network: quote.network,
      walletLabel: `${wallet.nickname} · ${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`,
      lines: quote.lines,
      coupon: quote.coupon,
      summary: quote.summary,
      createdAt: now,
      updatedAt: now,
      version: 1,
      userId: auth.user.id,
      idempotencyKey: key,
      resolveAt: Date.now() + mockConfig.current.orderResolveMs,
      outcome: mockConfig.current.scenario === 'payment-declined' ? 'declined' : 'confirmed',
    }
    db.state.orders.push(order)
    db.state.idempotency[idemKey] = { orderId: order.id, requestHash }
    persist()
    scheduleOrder(order)

    if (mockConfig.current.scenario === 'order-timeout') {
      // O pedido foi criado, mas a resposta não chega antes do timeout do cliente.
      await delay(15_000)
    }
    return HttpResponse.json<Order>(publicOrder(order), { status: 201 })
  }),
]
