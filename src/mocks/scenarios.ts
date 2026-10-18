/**
 * Cenários determinísticos da API simulada. Selecionáveis por:
 *  - query string `?scenario=<nome>` (persistido no localStorage);
 *  - painel de mocks na interface (botão "Mocks");
 *  - endpoint de controle `POST /api/__mock/scenario`.
 */

export const SCENARIOS = {
  default: 'Sucesso (padrão)',
  empty: 'Catálogo vazio',
  slow: 'Rede lenta (2.5s)',
  variable: 'Latência variável / respostas fora de ordem',
  offline: 'Sem conexão (falha de rede)',
  'server-error': 'Erro 500 no catálogo e detalhe',
  flaky: 'Falha transitória (503 na 1ª tentativa)',
  'session-expired': 'Sessão expira em 20s',
  'favorite-fail': 'Falha ao favoritar (500)',
  'price-change': 'Preço muda durante o checkout',
  'sold-out': 'Edição esgota durante o checkout',
  'order-timeout': 'Timeout após criar pedido',
  'payment-declined': 'Pagamento recusado',
  'wallet-reject': 'Carteira recusa a conexão',
} as const

export type ScenarioName = keyof typeof SCENARIOS

export interface MockConfig {
  scenario: ScenarioName
  /** Sobrescreve a latência base (ms). */
  latencyMs: number | null
  /** Tempo até o pedido pendente ser resolvido (ms). */
  orderResolveMs: number
  /** Atraso das mudanças disparadas nos cenários de checkout (ms). */
  checkoutChangeDelayMs: number
}

const STORAGE_KEY = 'kurio.mock.config'

export const DEFAULT_CONFIG: MockConfig = {
  scenario: 'default',
  latencyMs: null,
  orderResolveMs: 2500,
  checkoutChangeDelayMs: 1500,
}

export function isScenario(value: unknown): value is ScenarioName {
  return typeof value === 'string' && value in SCENARIOS
}

export function loadConfig(): MockConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<MockConfig>) : {}
    const config = { ...DEFAULT_CONFIG, ...parsed }
    const fromUrl = new URLSearchParams(location.search).get('scenario')
    if (isScenario(fromUrl)) config.scenario = fromUrl
    if (!isScenario(config.scenario)) config.scenario = 'default'
    saveConfig(config)
    return config
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: MockConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    /* armazenamento indisponível: mantém em memória */
  }
}

export const mockConfig: { current: MockConfig } = { current: DEFAULT_CONFIG }

export function setConfig(patch: Partial<MockConfig>) {
  mockConfig.current = { ...mockConfig.current, ...patch }
  saveConfig(mockConfig.current)
  return mockConfig.current
}

/** PRNG determinístico (mulberry32) usado em fixtures e latência variável. */
export function seededRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
