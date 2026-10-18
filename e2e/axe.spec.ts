import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { addToCart, expect, gotoApp, login, openReview, test } from './fixtures'

/** Varredura automática (axe-core, WCAG 2.1 AA) de todas as telas. */
async function scan(page: Page, name: string) {
  await page.waitForLoadState('networkidle')
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${name}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([])
}

test.describe('Acessibilidade automatizada (axe) @main', () => {
  test.use({ mockSetup: { latencyMs: 0, orderResolveMs: 800 } })

  test('telas públicas', async ({ page }) => {
    for (const [path, name] of [
      ['/', 'início'],
      ['/nft/emerald-ape-042', 'detalhe'],
      ['/carrinho', 'carrinho vazio'],
      ['/entrar', 'login'],
      ['/cadastro', 'cadastro'],
      ['/rota-inexistente', '404'],
    ] as const) {
      await gotoApp(page, path)
      await scan(page, name)
    }
  })

  test('telas autenticadas e fluxo de compra', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    await gotoApp(page, '/carrinho')
    await scan(page, 'carrinho')
    await gotoApp(page, '/conta/perfil')
    await scan(page, 'perfil')
    await gotoApp(page, '/conta/carteiras')
    await scan(page, 'carteiras')
    const dialog = await openReview(page)
    await scan(page, 'revisão do pedido')
    await dialog.getByRole('button', { name: 'Confirmar compra' }).click()
    await expect(page.getByTestId('receipt')).toBeVisible({ timeout: 10_000 })
    await scan(page, 'recibo')
  })
})
