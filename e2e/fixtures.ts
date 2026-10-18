import { test as base, expect, type Page } from '@playwright/test'

/** Configuração inicial dos mocks injetada antes do app carregar. */
export interface MockSetup {
  scenario?: string
  latencyMs?: number | null
  orderResolveMs?: number
  checkoutChangeDelayMs?: number
}

export const USERS = {
  ana: { email: 'ana@kurio.dev', password: 'Kurio@123', name: 'Ana Souza' },
  bruno: { email: 'bruno@kurio.dev', password: 'Kurio@123', name: 'Bruno Lima' },
}

/**
 * Controle da simulação via endpoints MSW (`/api/__mock/*`), executados de
 * dentro da página: passam pelo service worker como qualquer chamada REST e os
 * eventos chegam ao app pelo socket.io-client.
 */
export class MockControl {
  private readonly page: Page
  constructor(page: Page) {
    this.page = page
  }

  async call<T = unknown>(path: string, body: unknown = {}): Promise<T> {
    // Garante que o MSW já controla a página antes de chamar o controle.
    await this.page.waitForFunction(() => document.documentElement.dataset.network === "ready")
    return this.page.evaluate(
      async ({ path, body }) => {
        const res = await fetch(`/api/__mock${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        return res.json()
      },
      { path, body },
    ) as Promise<T>
  }

  scenario(scenario: string, extra: Partial<MockSetup> = {}) {
    return this.call('/scenario', { scenario, ...extra })
  }
  fault(f: { method: string; path: string; status?: number; code?: string; times?: number; networkError?: boolean; delayMs?: number }) {
    return this.call('/faults', f)
  }
  updateNft(id: string, patch: { editionId?: string; priceEth?: string; available?: number }) {
    return this.call(`/nfts/${id}`, patch)
  }
  replayLastEvent() {
    return this.call('/events/replay')
  }
  staleEvent(id: string, priceEth: string) {
    return this.call(`/events/stale/${id}`, { priceEth })
  }
  dropSocket(offlineMs = 0) {
    return this.call('/socket/drop', { offlineMs })
  }
  expireSessions() {
    return this.call('/session/expire')
  }
  resolveOrder(id: string, status: 'confirmed' | 'declined') {
    return this.call(`/orders/${id}/resolve`, { status })
  }
}

export const test = base.extend<{ mock: MockControl; mockSetup: MockSetup }>({
  mockSetup: [{ scenario: 'default', latencyMs: 0, orderResolveMs: 60_000, checkoutChangeDelayMs: 300 }, { option: true }],
  page: async ({ page, mockSetup }, use) => {
    await page.addInitScript((setup) => {
      // Apenas na primeira carga: recargas preservam o estado do teste.
      if (!sessionStorage.getItem('e2e.init')) {
        sessionStorage.setItem('e2e.init', '1')
        localStorage.setItem('kurio.mock.hidePanel', '1')
        localStorage.setItem('kurio.mock.config', JSON.stringify({ scenario: 'default', latencyMs: 0, orderResolveMs: 60000, checkoutChangeDelayMs: 300, ...setup }))
      }
    }, mockSetup)
    await use(page)
  },
  mock: async ({ page }, use) => {
    await use(new MockControl(page))
  },
})

export { expect }

export async function gotoApp(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.locator('html')).toHaveAttribute('data-network', 'ready')
}

export async function login(page: Page, user: keyof typeof USERS = 'ana', from = '/entrar') {
  await page.goto(from)
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('E-mail', { exact: true }).fill(USERS[user].email)
  await dialog.getByLabel('Senha', { exact: true }).fill(USERS[user].password)
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  // Espera a navegação pós-login do app terminar antes de o teste navegar.
  await expect(page).not.toHaveURL(/\/entrar/)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: `Menu da conta de ${USERS[user].name}` }).or(page.getByRole('link', { name: 'Perfil' })).first()).toBeVisible()
}

export async function addToCart(page: Page, nftId: string, opts: { quantity?: number; edition?: string } = {}) {
  await page.goto(`/nft/${nftId}`)
  if (opts.edition) await page.getByRole('radio', { name: opts.edition, exact: true }).click()
  for (let i = 1; i < (opts.quantity ?? 1); i++) await page.getByRole('button', { name: 'Aumentar Quantidade' }).click()
  await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click()
  await expect(page.getByText('adicionado ao carrinho').first()).toBeVisible()
}

/** Preenche o checkout (dados pré-carregados da carteira), conecta e abre a revisão. */
export async function openReview(page: Page) {
  await page.goto('/checkout')
  await expect(page.getByLabel(/^Nome de exibição/)).toHaveValue(/.+/)
  await page.getByRole('button', { name: 'Conectar', exact: true }).click()
  await expect(page.getByText(/Conectada ·/)).toBeVisible()
  await page.getByRole('button', { name: 'Revisar e confirmar compra' }).click()
  const dialog = page.getByRole('dialog', { name: 'Revise seu pedido' })
  await expect(dialog).toBeVisible()
  return dialog
}
