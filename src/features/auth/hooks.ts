import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/endpoints'
import type { Cart, LoginInput, RegisterInput, Session } from '@/api/types'
import { guestCartId, rotateGuestCartId, sessionStore } from '@/lib/session-store'

// Mescla o carrinho do visitante antes de publicar a sessão.
async function establishSession(session: Session, queryClient: ReturnType<typeof useQueryClient>) {
  const guestId = guestCartId()
  let cart: Cart | null = null
  try {
    cart = await api.cart.merge(guestId, session.token)
  } catch {
    /* falha no merge não impede o login; o carrinho é recarregado da API */
  }
  if (cart) queryClient.setQueryData(['user', session.user.id, 'cart'], cart)
  sessionStore.set(session)
  queryClient.removeQueries({ queryKey: ['cart', guestId] })
  rotateGuestCartId()
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) => api.auth.login(input),
    onSuccess: (session) => establishSession(session, queryClient),
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterInput) => api.auth.register(input),
    onSuccess: (session) => establishSession(session, queryClient),
  })
}

export function useLogout() {
  return useMutation({
    // Logout local imediato; revogar na API é best-effort.
    mutationFn: async () => {
      const token = sessionStore.token()
      sessionStore.clear("logout")
      if (token) await api.auth.logout(token).catch(() => undefined)
    },
  })
}
