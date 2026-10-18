import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api/endpoints'
import { isApiError } from '@/api/http'
import type { Cart } from '@/api/types'
import { guestCartId, useSession } from '@/lib/session-store'

export function useCartKey() {
  const session = useSession()
  return session ? (['user', session.user.id, 'cart'] as const) : (['cart', guestCartId()] as const)
}

export function useCart() {
  const key = useCartKey()
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.cart.get({ signal }),
    staleTime: 0,
  })
}

function useCartMutation<TVars>(fn: (vars: TVars) => Promise<Cart>, opts: { success?: (vars: TVars) => string } = {}) {
  const queryClient = useQueryClient()
  const key = useCartKey()
  return useMutation({
    mutationFn: fn,
    onSuccess: (cart, vars) => {
      queryClient.setQueryData(key, cart)
      if (opts.success) toast.success(opts.success(vars))
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'VALIDATION_ERROR' && Object.keys(error.fieldErrors).length) return
      if (isApiError(error) && (error.code === 'COUPON_INVALID' || error.code === 'COUPON_EXPIRED')) return
      if (isApiError(error) && error.status === 401) return
      toast.error(isApiError(error) ? error.message : 'Não foi possível atualizar o carrinho.')
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useAddToCart() {
  return useCartMutation(
    (v: { nftId: string; editionId: string; quantity: number; name: string }) => api.cart.add(v),
    { success: (v) => `${v.name} adicionado ao carrinho.` },
  )
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient()
  const key = useCartKey()
  return useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => api.cart.update(id, quantity),
    onMutate: async ({ id, quantity }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Cart>(key)
      queryClient.setQueryData<Cart>(key, (old) =>
        old ? { ...old, items: old.items.map((i) => (i.id === id ? { ...i, quantity } : i)) } : old,
      )
      return { previous }
    },
    onError: (error, _v, ctx) => {
      queryClient.setQueryData(key, ctx?.previous)
      if (!(isApiError(error) && error.status === 401)) {
        toast.error(isApiError(error) ? error.message : 'Não foi possível alterar a quantidade.')
      }
    },
    onSuccess: (cart) => queryClient.setQueryData(key, cart),
  })
}

export function useRemoveCartItem() {
  return useCartMutation((v: { id: string; name: string }) => api.cart.remove(v.id), {
    success: (v) => `${v.name} removido do carrinho.`,
  })
}

export function useApplyCoupon() {
  return useCartMutation((code: string) => api.cart.applyCoupon(code), { success: (c) => `Cupom ${c.toUpperCase()} aplicado.` })
}

export function useRemoveCoupon() {
  return useCartMutation(() => api.cart.removeCoupon(), { success: () => 'Cupom removido.' })
}

export function useAckCart() {
  return useCartMutation(() => api.cart.ack())
}
