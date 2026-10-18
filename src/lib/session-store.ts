import { useSyncExternalStore } from 'react'
import type { Session, User } from '@/api/types'


const SESSION_KEY = 'kurio.session'
const GUEST_CART_KEY = 'kurio.guestCartId'

export type SessionEndReason = 'logout' | 'expired' | 'switch'

let current: Session | null = read()
const listeners = new Set<() => void>()
const endListeners = new Set<(reason: SessionEndReason, previous: Session | null) => void>()

function read(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function emit() {
  for (const l of listeners) l()
}

export const sessionStore = {
  get: () => current,
  token: () => current?.token ?? null,
  set(session: Session) {
    const previous = current
    if (previous && previous.user.id !== session.user.id) {
      for (const l of endListeners) l('switch', previous)
    }
    current = session
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
      /* ignora */
    }
    emit()
  },
  updateUser(user: User) {
    if (!current) return
    sessionStore.set({ ...current, user })
  },
  clear(reason: SessionEndReason) {
    const previous = current
    if (!previous) return
    current = null
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignora */
    }
    for (const l of endListeners) l(reason, previous)
    emit()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  onEnd(listener: (reason: SessionEndReason, previous: Session | null) => void) {
    endListeners.add(listener)
    return () => {
      endListeners.delete(listener)
    }
  },
}

// Sincroniza logout/troca de usuário entre abas.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== SESSION_KEY) return
    const next = read()
    if (!next && current) sessionStore.clear('logout')
    else if (next) sessionStore.set(next)
  })
}

export function useSession() {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get)
}

export function guestCartId(): string {
  try {
    let id = localStorage.getItem(GUEST_CART_KEY)
    if (!id) {
      id = `guest_${crypto.randomUUID()}`
      localStorage.setItem(GUEST_CART_KEY, id)
    }
    return id
  } catch {
    return 'guest_volatile-cart'
  }
}

export function rotateGuestCartId() {
  try {
    localStorage.removeItem(GUEST_CART_KEY)
  } catch {
    /* ignora */
  }
}
