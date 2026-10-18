import type { Nft, Order, Quote, User, Wallet } from '@/api/types'
import { buildNfts, SEED_USERS, seedWallets } from './fixtures'

/**
 * "Banco" da API simulada. Mantém estado consistente entre catálogo,
 * favoritos, carrinho, perfil, carteiras e pedidos e persiste no
 * localStorage para sobreviver a refresh. `resetDb()` restaura o seed.
 */

export interface UserRecord extends User {
  passwordHash: string
  salt: string
  favorites: string[]
  wallets: Wallet[]
}

export interface SessionRecord {
  token: string
  userId: string
  expiresAt: number
}

export interface CartItemRecord {
  id: string
  nftId: string
  editionId: string
  quantity: number
  /** Último preço/quantidade reconhecidos pelo usuário (para avisos). */
  seenUnitPriceEth: string
  seenQuantity: number
}

export interface CartRecord {
  id: string
  ownerId: string | null
  items: CartItemRecord[]
  couponCode: string | null
  version: number
  updatedAt: string
}

export interface QuoteRecord extends Quote {
  userId: string
  cartId: string
}

export interface OrderRecord extends Order {
  userId: string
  idempotencyKey: string
  resolveAt: number
  outcome: 'confirmed' | 'declined'
}

export interface DbState {
  schema: 3
  nfts: Nft[]
  users: UserRecord[]
  sessions: SessionRecord[]
  carts: Record<string, CartRecord>
  quotes: Record<string, QuoteRecord>
  orders: OrderRecord[]
  idempotency: Record<string, { orderId: string; requestHash: string }>
  eventSeq: number
}

const STORAGE_KEY = 'kurio.mock.db'

export async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}

async function seed(): Promise<DbState> {
  const users: UserRecord[] = []
  for (const u of SEED_USERS) {
    const salt = `salt-${u.id}`
    users.push({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      ensName: u.ensName,
      walletNickname: u.walletNickname,
      avatarUrl: null,
      createdAt: '2026-08-01T12:00:00.000Z',
      salt,
      passwordHash: await hashPassword(u.password, salt),
      favorites: u.id === 'u_ana' ? ['sage-nomad-009'] : [],
      wallets: seedWallets(u.id),
    })
  }
  return {
    schema: 3,
    nfts: buildNfts(),
    users,
    sessions: [],
    carts: {},
    quotes: {},
    orders: [],
    idempotency: {},
    eventSeq: 0,
  }
}

export const db: { state: DbState } = { state: null as unknown as DbState }

export async function initDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DbState
      if (parsed.schema === 3) {
        db.state = parsed
        return
      }
    }
  } catch {
    /* estado corrompido: recria a partir do seed */
  }
  db.state = await seed()
  persist()
}

export async function resetDb() {
  db.state = await seed()
  persist()
}

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db.state))
  } catch {
    /* sem persistência disponível */
  }
}

export function toPublicUser(u: UserRecord): User {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    ensName: u.ensName,
    walletNickname: u.walletNickname,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
  }
}

export function findNft(id: string) {
  return db.state.nfts.find((n) => n.id === id)
}

export function nextEventSeq() {
  db.state.eventSeq += 1
  return db.state.eventSeq
}
