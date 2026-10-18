import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, qk } from '@/api/endpoints'
import { isApiError } from '@/api/http'
import type { NftListParams } from '@/api/types'
import { useSession } from '@/lib/session-store'

export function useCatalog(params: NftListParams) {
  const session = useSession()
  return useQuery({
    // Favoritos variam por usuário.
    queryKey: params.favoritesOnly ? [...qk.catalog(params), session?.user.id ?? 'anon'] : qk.catalog(params),
    enabled: !params.favoritesOnly || !!session,
    // O signal cancela a busca anterior; resposta antiga nunca sobrescreve a atual.
    queryFn: ({ signal }) => api.catalog.list(params, { signal }),
    placeholderData: keepPreviousData,
  })
}

export function useFeatured() {
  return useQuery({ queryKey: qk.featured, queryFn: ({ signal }) => api.catalog.featured({ signal }), staleTime: 60_000 })
}

export function useNft(id: string) {
  return useQuery({ queryKey: qk.nft(id), queryFn: ({ signal }) => api.catalog.detail(id, { signal }), staleTime: 15_000 })
}

export function useFavorites() {
  const session = useSession()
  return useQuery({
    queryKey: qk.favorites(session?.user.id ?? 'anon'),
    queryFn: ({ signal }) => api.favorites.list({ signal }),
    enabled: !!session,
    select: (d) => new Set(d.nftIds),
  })
}

export function useToggleFavorite() {
  const session = useSession()
  const queryClient = useQueryClient()
  const key = qk.favorites(session?.user.id ?? 'anon')
  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean; name: string }) =>
      favorite ? api.favorites.add(id) : api.favorites.remove(id),
    onMutate: async ({ id, favorite }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<{ nftIds: string[] }>(key)
      queryClient.setQueryData<{ nftIds: string[] }>(key, (old) => {
        const ids = new Set(old?.nftIds ?? [])
        if (favorite) ids.add(id)
        else ids.delete(id)
        return { nftIds: [...ids] }
      })
      return { previous }
    },
    onError: (error, { name, favorite }, ctx) => {
      queryClient.setQueryData(key, ctx?.previous)
      if (isApiError(error) && error.status === 401) return
      toast.error(`Não foi possível ${favorite ? 'favoritar' : 'remover dos favoritos'} ${name}.`, {
        description: 'Restauramos o estado anterior. Tente novamente.',
      })
    },
    onSuccess: (data, { name, favorite }) => {
      queryClient.setQueryData(key, data)
      toast.success(favorite ? `${name} adicionado aos favoritos.` : `${name} removido dos favoritos.`)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}
