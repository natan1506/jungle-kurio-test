import { http } from './http'
import type {
  Cart,
  CreateOrderInput,
  FeaturedResponse,
  LoginInput,
  NetworkKey,
  Nft,
  NftListParams,
  NftListResponse,
  Order,
  PasswordInput,
  ProfileInput,
  Quote,
  RegisterInput,
  Session,
  User,
  Wallet,
  WalletInput,
} from './types'

type Opts = { signal?: AbortSignal }

function listParams(p: NftListParams) {
  const params = new URLSearchParams()
  if (p.q) params.set('q', p.q)
  if (p.categories?.length) params.set('categories', p.categories.join(','))
  if (p.networks?.length) params.set('networks', p.networks.join(','))
  if (p.priceMin) params.set('priceMin', p.priceMin)
  if (p.priceMax) params.set('priceMax', p.priceMax)
  if (p.tab && p.tab !== 'all') params.set('tab', p.tab)
  if (p.sort) params.set('sort', p.sort)
  if (p.favoritesOnly) params.set('favorites', '1')
  params.set('page', String(p.page ?? 1))
  params.set('pageSize', String(p.pageSize ?? 9))
  return params
}

export const api = {
  catalog: {
    list: (p: NftListParams, o?: Opts) => http.get<NftListResponse>('/nfts', { params: listParams(p), signal: o?.signal }).then((r) => r.data),
    featured: (o?: Opts) => http.get<FeaturedResponse>('/nfts/featured', { signal: o?.signal }).then((r) => r.data),
    detail: (id: string, o?: Opts) => http.get<Nft>(`/nfts/${encodeURIComponent(id)}`, { signal: o?.signal }).then((r) => r.data),
  },
  auth: {
    login: (input: LoginInput) => http.post<Session>('/auth/login', input).then((r) => r.data),
    register: (input: RegisterInput) => http.post<Session>('/auth/register', input).then((r) => r.data),
    session: () => http.get<Session>('/auth/session').then((r) => r.data),
    logout: (token: string) => http.post('/auth/logout', null, { headers: { Authorization: `Bearer ${token}` } }).then(() => undefined),
  },
  favorites: {
    list: (o?: Opts) => http.get<{ nftIds: string[] }>('/me/favorites', { signal: o?.signal }).then((r) => r.data),
    add: (id: string) => http.put<{ nftIds: string[] }>(`/me/favorites/${id}`).then((r) => r.data),
    remove: (id: string) => http.delete<{ nftIds: string[] }>(`/me/favorites/${id}`).then((r) => r.data),
  },
  cart: {
    get: (o?: Opts) => http.get<Cart>('/cart', { signal: o?.signal }).then((r) => r.data),
    add: (input: { nftId: string; editionId: string; quantity: number }) => http.post<Cart>('/cart/items', input).then((r) => r.data),
    update: (id: string, quantity: number) => http.patch<Cart>(`/cart/items/${id}`, { quantity }).then((r) => r.data),
    remove: (id: string) => http.delete<Cart>(`/cart/items/${id}`).then((r) => r.data),
    ack: () => http.post<Cart>('/cart/ack').then((r) => r.data),
    applyCoupon: (code: string) => http.put<Cart>('/cart/coupon', { code }).then((r) => r.data),
    removeCoupon: () => http.delete<Cart>('/cart/coupon').then((r) => r.data),
    merge: (guestCartId: string, token?: string) =>
      http
        .post<Cart>('/cart/merge', { guestCartId }, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
        .then((r) => r.data),
  },
  checkout: {
    quote: (network: NetworkKey) => http.post<Quote>('/checkout/quote', { network }).then((r) => r.data),
  },
  orders: {
    create: (input: CreateOrderInput, idempotencyKey: string) =>
      http
        .post<Order>('/orders', input, {
          headers: { 'Idempotency-Key': idempotencyKey },
          timeout: Number(import.meta.env.VITE_ORDER_TIMEOUT_MS ?? 8000),
        })
        .then((r) => r.data),
    get: (id: string, o?: Opts) => http.get<Order>(`/orders/${id}`, { signal: o?.signal }).then((r) => r.data),
    list: (status?: Order['status'], o?: Opts) =>
      http.get<{ items: Order[] }>('/orders', { params: status ? { status } : {}, signal: o?.signal }).then((r) => r.data.items),
  },
  account: {
    profile: (o?: Opts) => http.get<User>('/me/profile', { signal: o?.signal }).then((r) => r.data),
    updateProfile: (input: ProfileInput) => http.patch<User>('/me/profile', input).then((r) => r.data),
    setAvatar: (dataUrl: string) => http.put<User>('/me/avatar', { dataUrl }).then((r) => r.data),
    removeAvatar: () => http.delete<User>('/me/avatar').then((r) => r.data),
    changePassword: (input: PasswordInput) => http.post('/me/password', input).then(() => undefined),
    wallets: (o?: Opts) => http.get<Wallet[]>('/me/wallets', { signal: o?.signal }).then((r) => r.data),
    createWallet: (input: WalletInput) => http.post<Wallet>('/me/wallets', input).then((r) => r.data),
    updateWallet: (id: string, input: WalletInput) => http.put<Wallet>(`/me/wallets/${id}`, input).then((r) => r.data),
    connectWallet: (id: string) =>
      http.post<{ walletId: string; address: string; connectedAt: string }>(`/me/wallets/${id}/connect`).then((r) => r.data),
  },
}

/**
 * Chaves de cache. Dados privados ficam sob ['user', userId, ...] para
 * isolamento por usuário e limpeza total no logout/troca de conta.
 */
export const qk = {
  catalog: (p: NftListParams) => ['catalog', 'list', p] as const,
  catalogAll: ['catalog'] as const,
  featured: ['catalog', 'featured'] as const,
  nft: (id: string) => ['nft', id] as const,
  cart: (owner: string) => ['cart', owner] as const,
  user: (userId: string) => ['user', userId] as const,
  favorites: (userId: string) => ['user', userId, 'favorites'] as const,
  profile: (userId: string) => ['user', userId, 'profile'] as const,
  wallets: (userId: string) => ['user', userId, 'wallets'] as const,
  order: (userId: string, id: string) => ['user', userId, 'order', id] as const,
  pendingOrders: (userId: string) => ['user', userId, 'orders', 'pending'] as const,
}
