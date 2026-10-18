
export type EthAmount = string

export const CATEGORIES = [
  { key: 'arte-digital', label: 'Arte digital' },
  { key: 'fotografia', label: 'Fotografia' },
  { key: 'musica', label: 'Música' },
  { key: 'arte-3d', label: 'Arte 3D' },
  { key: 'colecionaveis', label: 'Colecionáveis' },
  { key: 'generativa', label: 'Generativa' },
  { key: 'jogos', label: 'Jogos' },
  { key: 'assinaturas', label: 'Assinaturas' },
  { key: 'utilidade', label: 'Utilidade' },
] as const
export type CategoryKey = (typeof CATEGORIES)[number]['key']

export const NETWORKS = [
  { key: 'ethereum', label: 'Ethereum' },
  { key: 'polygon', label: 'Polygon' },
  { key: 'solana', label: 'Solana' },
] as const
export type NetworkKey = (typeof NETWORKS)[number]['key']

export const SORTS = [
  { key: 'recent', label: 'Listados recentemente' },
  { key: 'price_asc', label: 'Menor preço' },
  { key: 'price_desc', label: 'Maior preço' },
  { key: 'popular', label: 'Mais populares' },
] as const
export type SortKey = (typeof SORTS)[number]['key']

export const TABS = [
  { key: 'all', label: 'Todos os NFTs' },
  { key: 'new', label: 'Novos lançamentos' },
  { key: 'trending', label: 'Em alta' },
] as const
export type TabKey = (typeof TABS)[number]['key']

export type ImageKey = 'emerald-ape' | 'sage-nomad' | 'ivory-baron' | 'golden-beat'

export interface Edition {
  id: string
  label: string
  /** null = edição aberta */
  supply: number | null
  available: number
  maxPerOrder: number
  priceEth: EthAmount
}

export interface NftSummary {
  id: string
  name: string
  tokenId: string
  image: ImageKey
  collection: string
  category: CategoryKey
  network: NetworkKey
  priceEth: EthAmount
  previousPriceEth: EthAmount | null
  badge: 'drop' | null
  available: number
  version: number
}

export interface Nft extends NftSummary {
  description: string
  longDescription: string[]
  rating: number
  reviewsCount: number
  attributes: string[]
  creator: string
  contract: string
  royalties: string
  editions: Edition[]
  createdAt: string
}

export interface NftListParams {
  q?: string
  categories?: CategoryKey[]
  networks?: NetworkKey[]
  priceMin?: string
  priceMax?: string
  tab?: TabKey
  sort?: SortKey
  page?: number
  pageSize?: number
  favoritesOnly?: boolean
}

export interface Facet<K extends string> {
  key: K
  count: number
}

export interface NftListResponse {
  items: NftSummary[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  facets: { categories: Facet<CategoryKey>[]; networks: Facet<NetworkKey>[] }
  priceRange: { min: EthAmount; max: EthAmount }
}

export interface FeaturedResponse {
  hero: NftSummary[]
  spotlight: NftSummary
}

/* ---------- Conta e sessão ---------- */

export interface User {
  id: string
  username: string
  displayName: string
  email: string
  ensName: string
  walletNickname: string
  avatarUrl: string | null
  createdAt: string
}

export interface Session {
  token: string
  expiresAt: string
  user: User
}

export interface LoginInput {
  email: string
  password: string
}
export interface RegisterInput {
  username: string
  email: string
  password: string
}

export interface ProfileInput {
  displayName: string
  username: string
  email: string
  ensName: string
  walletNickname: string
}

export interface PasswordInput {
  currentPassword: string
  newPassword: string
}

/* ---------- Carteiras ---------- */

export type WalletType = 'metamask' | 'walletconnect' | 'coinbase'
export const WALLET_TYPES: { key: WalletType; label: string }[] = [
  { key: 'metamask', label: 'MetaMask' },
  { key: 'walletconnect', label: 'WalletConnect' },
  { key: 'coinbase', label: 'Coinbase Wallet' },
]

export interface Wallet {
  id: string
  slot: 'primary' | 'secondary'
  displayName: string
  nickname: string
  network: NetworkKey
  profileName: string
  address: string
  secondaryAddress: string
  ensName: string
  walletType: WalletType
  referralCode: string
  email: string
  updatedAt: string
}
export type WalletInput = Omit<Wallet, 'id' | 'updatedAt'>

/* ---------- Carrinho e cotação ---------- */

export interface CartItem {
  id: string
  nftId: string
  editionId: string
  editionLabel: string
  name: string
  tokenId: string
  image: ImageKey
  quantity: number
  unitPriceEth: EthAmount
  lineTotalEth: EthAmount
  available: number
  maxPerOrder: number
  notices: CartNotice[]
}

export type CartNotice =
  | { type: 'price_changed'; fromEth: EthAmount; toEth: EthAmount }
  | { type: 'quantity_reduced'; from: number; to: number }
  | { type: 'sold_out' }

export interface Coupon {
  code: string
  label: string
  percentOff: number
}

export interface PriceSummary {
  subtotalEth: EthAmount
  discountEth: EthAmount
  networkFeeEth: EthAmount
  totalEth: EthAmount
}

export interface Cart {
  id: string
  items: CartItem[]
  coupon: Coupon | null
  summary: PriceSummary
  itemCount: number
  version: number
  updatedAt: string
}

export interface QuoteLine {
  cartItemId: string
  nftId: string
  editionId: string
  editionLabel: string
  name: string
  tokenId: string
  image: ImageKey
  quantity: number
  unitPriceEth: EthAmount
  lineTotalEth: EthAmount
}

export interface Quote {
  id: string
  network: NetworkKey
  lines: QuoteLine[]
  coupon: Coupon | null
  summary: PriceSummary
  createdAt: string
  expiresAt: string
}

export interface QuoteChange {
  nftId: string
  name: string
  kind: 'price' | 'availability' | 'coupon' | 'fee'
  message: string
}

/* ---------- Pedidos ---------- */

export type OrderStatus = 'pending' | 'confirmed' | 'declined'

export interface BuyerInfo {
  displayName: string
  username: string
  network: NetworkKey
  profileName: string
  walletAddress: string
  secondaryAddress: string
  walletType: WalletType
  referralCode: string
  email: string
  ensName: string
  useAnotherWallet: boolean
  notes: string
}

export interface CreateOrderInput {
  quoteId: string
  walletId: string
  network: NetworkKey
  buyer: BuyerInfo
}

export interface Order {
  id: string
  status: OrderStatus
  declineReason: string | null
  txHash: string | null
  explorerUrl: string | null
  quoteId: string
  network: NetworkKey
  walletLabel: string
  lines: QuoteLine[]
  coupon: Coupon | null
  summary: PriceSummary
  createdAt: string
  updatedAt: string
  version: number
}

/* ---------- Erros ---------- */

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EMAIL_TAKEN'
  | 'USERNAME_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'INSUFFICIENT_AVAILABILITY'
  | 'EDITION_UNAVAILABLE'
  | 'COUPON_INVALID'
  | 'COUPON_EXPIRED'
  | 'QUOTE_STALE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'WALLET_REJECTED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR'

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode
    message: string
    fieldErrors?: Record<string, string>
    details?: unknown
  }
}

export interface QuoteStaleDetails {
  quote: Quote
  changes: QuoteChange[]
}

/* ---------- Eventos em tempo real (Socket.IO) ---------- */

export interface RealtimeEnvelope<TType extends string, TResource extends string, TData> {
  eventId: string
  type: TType
  resource: { type: TResource; id: string }
  version: number
  occurredAt: string
  data: TData
}

export type NftUpdatedEvent = RealtimeEnvelope<
  'nft.updated',
  'nft',
  {
    priceEth: EthAmount
    previousPriceEth: EthAmount | null
    available: number
    editions: Pick<Edition, 'id' | 'available' | 'priceEth'>[]
  }
>

export type OrderUpdatedEvent = RealtimeEnvelope<
  'order.updated',
  'order',
  { status: OrderStatus; txHash: string | null; declineReason: string | null }
>

export type RealtimeEvent = NftUpdatedEvent | OrderUpdatedEvent
