/**
 * Barreira de rede: o app renderiza imediatamente (shell + skeletons), mas
 * nenhuma requisição REST nem conexão Socket.IO sai antes de o MSW estar
 * ativo. Sem mocks (VITE_ENABLE_MOCKS=false) a barreira já nasce aberta.
 */
let resolveReady: () => void = () => undefined
export const mocksReady: Promise<void> = new Promise<void>((resolve) => {
  resolveReady = resolve
})

export function markMocksReady() {
  resolveReady()
  // Sinal observável (ex.: testes E2E) de que a camada de rede está pronta.
  document.documentElement.dataset.network = "ready"
}
