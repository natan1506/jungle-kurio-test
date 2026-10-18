import type { Page } from '@playwright/test'
import { addToCart, expect, login, test } from './fixtures'

/** Regressão visual com dados determinísticos (seed fixo, latência 0). */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => Promise.all(Array.from(document.images).filter((i) => !i.complete && i.loading !== 'lazy').map((i) => new Promise((r) => (i.onload = i.onerror = r)))))
}

const mask = (page: Page) => [page.locator('[data-sonner-toaster]'), page.getByRole('button', { name: 'Abrir painel de mocks' })]

test.describe('Regressão visual @main', () => {
  test('início', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('catalog-grid')).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('inicio.png', { mask: mask(page) })
  })

  test('detalhe', async ({ page }) => {
    await page.goto('/nft/emerald-ape-042')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('detalhe.png', { mask: mask(page) })
  })

  test('carrinho', async ({ page }) => {
    await addToCart(page, 'emerald-ape-042', { quantity: 2 })
    await addToCart(page, 'sage-nomad-009')
    await page.goto('/carrinho')
    await expect(page.getByTestId('cart-item')).toHaveCount(2)
    await settle(page)
    await expect(page).toHaveScreenshot('carrinho.png', { mask: mask(page) })
  })

  test('pagamento', async ({ page }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    await page.goto('/checkout')
    await expect(page.getByLabel(/^Nome de exibição/)).toHaveValue('Ana Souza')
    await settle(page)
    await expect(page).toHaveScreenshot('pagamento.png', { mask: mask(page) })
  })
})
