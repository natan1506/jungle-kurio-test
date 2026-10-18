import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isApiError } from '@/api/http'

/**
 * Política de cache/retry:
 *  - queries repetem até 2x apenas falhas transitórias (rede, timeout, 5xx);
 *    4xx nunca são repetidos;
 *  - mutations não repetem automaticamente (operações não idempotentes);
 *    a criação de pedido tem retry explícito com a mesma chave de idempotência.
 */
export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache(),
    mutationCache: new MutationCache(),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (isApiError(error) && !error.isTransient) return false
          if (isApiError(error) && error.code === 'CANCELED') return false
          return failureCount < 2
        },
        retryDelay: (attempt) => Math.min(400 * 2 ** attempt, 2000),
      },
      mutations: { retry: false },
    },
  })
}
