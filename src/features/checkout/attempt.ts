// Mesma tentativa => mesma Idempotency-Key, inclusive após refresh.
export interface OrderAttempt {
  key: string
  quoteId: string
  walletId: string
  network: string
  userId: string
  createdAt: number
}

const KEY = 'kurio.checkout.attempt'

export function loadAttempt(userId: string): OrderAttempt | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    const attempt = raw ? (JSON.parse(raw) as OrderAttempt) : null
    return attempt && attempt.userId === userId ? attempt : null
  } catch {
    return null
  }
}

export function attemptFor(input: Omit<OrderAttempt, 'key' | 'createdAt'>): OrderAttempt {
  const existing = loadAttempt(input.userId)
  if (existing && existing.quoteId === input.quoteId && existing.walletId === input.walletId && existing.network === input.network) {
    return existing
  }
  const attempt: OrderAttempt = { ...input, key: `idem_${crypto.randomUUID()}`, createdAt: Date.now() }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(attempt))
  } catch {
    /* ignora */
  }
  return attempt
}

export function clearAttempt() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignora */
  }
}

const DRAFT_KEY = 'kurio.checkout.draft'

export function loadDraft<T>(userId: string): T | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    const parsed = raw ? (JSON.parse(raw) as { userId: string; value: T }) : null
    return parsed?.userId === userId ? parsed.value : null
  } catch {
    return null
  }
}

export function saveDraft<T>(userId: string, value: T) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ userId, value }))
  } catch {
    /* ignora */
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignora */
  }
}
