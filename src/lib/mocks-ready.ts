// Nenhuma requisição ou socket sai antes de o MSW estar ativo.
let resolveReady: () => void = () => undefined
export const mocksReady: Promise<void> = new Promise<void>((resolve) => {
  resolveReady = resolve
})

export function markMocksReady() {
  resolveReady()
  // Usado pelos testes E2E.
  document.documentElement.dataset.network = "ready"
}
