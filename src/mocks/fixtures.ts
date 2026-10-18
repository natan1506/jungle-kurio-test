import Big from 'big.js'
import type { CategoryKey, Edition, ImageKey, NetworkKey, Nft, Wallet } from '@/api/types'
import { CATEGORIES, NETWORKS } from '@/api/types'
import { toEthString } from '@/lib/money'
import { seededRandom } from './scenarios'

// 60 NFTs determinísticos; os 8 primeiros são os do Figma.

const FIGMA_NFTS: { name: string; num: string; image: ImageKey; price: string; prev?: string; badge?: 'drop' }[] = [
  { name: 'Emerald Ape', num: '042', image: 'emerald-ape', price: '1.19' },
  { name: 'Sage Nomad', num: '009', image: 'sage-nomad', price: '1.69' },
  { name: 'Neon Vessel', num: '552', image: 'ivory-baron', price: '1.99', prev: '2.29', badge: 'drop' },
  { name: 'Cosmic Bloom', num: '118', image: 'sage-nomad', price: '1.29' },
  { name: 'Violet Nomad', num: '314', image: 'sage-nomad', price: '1.39' },
  { name: 'Ivory Baron', num: '088', image: 'ivory-baron', price: '1.79' },
  { name: 'Golden Beat', num: '207', image: 'golden-beat', price: '0.99' },
  { name: 'Golden Signal', num: '160', image: 'golden-beat', price: '0.39' },
]

const ADJECTIVES = ['Amber', 'Velvet', 'Lunar', 'Crimson', 'Silent', 'Rustic', 'Solar', 'Jade', 'Copper', 'Midnight', 'Pale', 'Wild', 'Royal', 'Dusty']
const NOUNS: { noun: string; image: ImageKey }[] = [
  { noun: 'Ape', image: 'emerald-ape' },
  { noun: 'Monarch', image: 'emerald-ape' },
  { noun: 'Nomad', image: 'sage-nomad' },
  { noun: 'Wanderer', image: 'sage-nomad' },
  { noun: 'Baron', image: 'ivory-baron' },
  { noun: 'Vessel', image: 'ivory-baron' },
  { noun: 'Beat', image: 'golden-beat' },
  { noun: 'Signal', image: 'golden-beat' },
]
const ATTRIBUTES: Record<ImageKey, string[]> = {
  'emerald-ape': ['Óculos', 'Esmeralda', 'Raro'],
  'sage-nomad': ['Chapéu', 'Moletom', 'Incomum'],
  'ivory-baron': ['Blazer', 'Gola alta', 'Épico'],
  'golden-beat': ['Fones', 'Dourado', 'Comum'],
}
const CREATORS = ['Kurio Studio', 'Lia Moraes', 'Atelier 0x', 'Rafa Pixel', 'Nina Bloom']

function makeEditions(base: Big, rnd: () => number, nftIndex: number): Edition[] {
  const pick = (max: number) => Math.floor(rnd() * (max + 1))
  const editions: Edition[] = [
    { id: 'e10', label: '1/10', supply: 10, available: pick(3), maxPerOrder: 2, priceEth: toEthString(base.times('1.8')) },
    { id: 'e25', label: '1/25', supply: 25, available: 2 + pick(8), maxPerOrder: 3, priceEth: toEthString(base.times('1.35')) },
    { id: 'e50', label: '1/50', supply: 50, available: 6 + pick(20), maxPerOrder: 10, priceEth: toEthString(base) },
    { id: 'open', label: 'ABERTA', supply: null, available: 999, maxPerOrder: 10, priceEth: toEthString(base.times('0.6')) },
  ]
  // Algumas edições esgotadas de propósito.
  if (nftIndex % 3 === 0) editions[0].available = 0
  return editions
}

export function buildNfts(): Nft[] {
  const rnd = seededRandom(20260417)
  const nfts: Nft[] = []
  const baseDate = Date.UTC(2026, 8, 30, 12)

  for (let i = 0; i < 60; i++) {
    const figma = FIGMA_NFTS[i]
    let name: string
    let num: string
    let image: ImageKey
    let price: Big
    let prev: string | null = null
    let badge: 'drop' | null = null
    if (figma) {
      name = figma.name
      num = figma.num
      image = figma.image
      price = new Big(figma.price)
      prev = figma.prev ?? null
      badge = figma.badge ?? null
    } else {
      const noun = NOUNS[Math.floor(rnd() * NOUNS.length)]
      name = `${ADJECTIVES[Math.floor(rnd() * ADJECTIVES.length)]} ${noun.noun}`
      num = String(100 + Math.floor(rnd() * 899)).padStart(3, '0')
      image = noun.image
      price = new Big((0.05 + rnd() * 12).toFixed(2))
      if (rnd() < 0.12) {
        prev = toEthString(price.times('1.15'))
        badge = 'drop'
      }
    }
    const category: CategoryKey = i === 0 ? 'arte-digital' : CATEGORIES[Math.floor(rnd() * CATEGORIES.length)].key
    const network: NetworkKey = i === 0 ? 'ethereum' : NETWORKS[rnd() < 0.55 ? 0 : rnd() < 0.6 ? 1 : 2].key
    const editions = makeEditions(price, rnd, i)
    const id = `${name.toLowerCase().replace(/\s+/g, '-')}-${num}`
    const tokenId = `#0${num}`
    const collection = image === 'emerald-ape' ? 'Kurio Apes' : image === 'sage-nomad' ? 'Nomad Club' : image === 'ivory-baron' ? 'Baron Society' : 'Golden Frequencies'
    nfts.push({
      id,
      name: `${name} #${num}`,
      tokenId,
      image,
      collection,
      category,
      network,
      priceEth: toEthString(price),
      previousPriceEth: prev,
      badge,
      available: editions.reduce((acc, e) => acc + e.available, 0),
      version: 1,
      description: `Um colecionável digital 1/50 finalizado à mão da coleção ${collection}, verificado na ${NETWORKS.find((n) => n.key === network)!.label}.`,
      longDescription: [
        `${name} #${num} é uma obra digital 1/50 finalizada à mão da coleção ${collection}. Cada atributo foi armazenado nos metadados do token e verificado on-chain, unindo identidade, movimento e luz em um mundo digital sem fronteiras.`,
        'A propriedade inclui a arte em alta resolução, licenciamento para uso pessoal e o registro permanente de procedência na rede. Royalties de 5% revertem ao criador em vendas secundárias.',
      ],
      rating: 4 + Math.round(rnd() * 10) / 10,
      reviewsCount: 3 + Math.floor(rnd() * 40),
      attributes: ATTRIBUTES[image],
      creator: CREATORS[Math.floor(rnd() * CREATORS.length)],
      contract: 'ERC-721 verificado',
      royalties: '5% em vendas secundárias',
      editions,
      createdAt: new Date(baseDate - i * 36e5 * 7).toISOString(),
    })
  }
  // Emerald Ape #042 com estoque fixo (usado nos testes).
  const emerald = nfts[0]
  emerald.rating = 4.8
  emerald.reviewsCount = 19
  emerald.editions = [
    { id: 'e10', label: '1/10', supply: 10, available: 0, maxPerOrder: 2, priceEth: '2.14' },
    { id: 'e25', label: '1/25', supply: 25, available: 4, maxPerOrder: 3, priceEth: '1.61' },
    { id: 'e50', label: '1/50', supply: 50, available: 12, maxPerOrder: 10, priceEth: '1.19' },
    { id: 'open', label: 'ABERTA', supply: null, available: 999, maxPerOrder: 10, priceEth: '0.71' },
  ]
  emerald.available = emerald.editions.reduce((a, e) => a + e.available, 0)
  return nfts
}

export interface SeedUser {
  id: string
  username: string
  displayName: string
  email: string
  password: string
  ensName: string
  walletNickname: string
}

// Credenciais do README; no banco só fica o hash.
export const SEED_USERS: SeedUser[] = [
  {
    id: 'u_ana',
    username: 'ana.colecionadora',
    displayName: 'Ana Souza',
    email: 'ana@kurio.dev',
    password: 'Kurio@123',
    ensName: 'ana',
    walletNickname: 'Reserva',
  },
  {
    id: 'u_bruno',
    username: 'bruno.nft',
    displayName: 'Bruno Lima',
    email: 'bruno@kurio.dev',
    password: 'Kurio@123',
    ensName: 'bruno',
    walletNickname: 'Principal',
  },
]

export function seedWallets(userId: string): Wallet[] {
  if (userId === 'u_ana') {
    return [
      {
        id: 'w_ana_1',
        slot: 'primary',
        displayName: 'Ana Souza',
        nickname: 'Reserva',
        network: 'polygon',
        profileName: 'ana',
        address: '0x4A1F9c2E7b3D8a6F0e5C4b9A7d2E1f3C8b6A9E2c',
        secondaryAddress: '',
        ensName: 'nova.kurio',
        walletType: 'metamask',
        referralCode: '',
        email: 'ana@kurio.dev',
        updatedAt: '2026-09-01T12:00:00.000Z',
      },
      {
        id: 'w_ana_2',
        slot: 'secondary',
        displayName: 'Ana Souza',
        nickname: 'Principal',
        network: 'ethereum',
        profileName: 'ana',
        address: '0x8b3E2d9A1c7F4e6B0a5D3c8E9f2A1b7C4d6E3c2D',
        secondaryAddress: '',
        ensName: 'ana.kurio',
        walletType: 'coinbase',
        referralCode: '',
        email: 'ana@kurio.dev',
        updatedAt: '2026-09-01T12:00:00.000Z',
      },
    ]
  }
  return []
}

export const COUPONS: Record<string, { label: string; percentOff: number; expired?: boolean }> = {
  KURIO10: { label: 'Desconto do lançamento', percentOff: 10 },
  GENESIS5: { label: 'Genesis 5%', percentOff: 5 },
  VERAO2025: { label: 'Verão 2025', percentOff: 15, expired: true },
}

export const NETWORK_FEES: Record<NetworkKey, string> = {
  ethereum: '0.016',
  polygon: '0.002',
  solana: '0.001',
}
