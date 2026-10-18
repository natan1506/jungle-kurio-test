import { addToCart, expect, login, openReview, test } from './fixtures'

// page.clock controla os timers do app e do MSW (que roda na página).
test.describe('Relógio controlado', () => {
  test.use({ mockSetup: { latencyMs: 0, orderResolveMs: 5000 } })

  test('sessão expira pelo tempo durante a navegação e retoma o destino', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-17T12:00:00-03:00') })
    await login(page, 'ana')
    await page.goto('/conta/carteiras')
    await expect(page.getByRole('heading', { name: 'Carteira principal' })).toBeVisible()
    // TTL de 30 min: em 29 min ainda está logado
    await page.clock.fastForward('29:00')
    await expect(page).toHaveURL(/\/conta\/carteiras/)
    // passou do limite: revalida e pede login
    await page.clock.fastForward('02:00')
    await expect(page).toHaveURL(/\/entrar\?.*reason=expired/)
    await expect(page.getByRole('dialog').getByText('Sua sessão expirou')).toBeVisible()
  })

  test('pedido pendente só confirma após o tempo de liquidação', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-17T12:00:00-03:00') })
    await login(page, 'ana')
    await addToCart(page, 'golden-beat-207')
    const dialog = await openReview(page)
    await dialog.getByRole('button', { name: 'Confirmar compra' }).click()
    await expect(page.getByTestId('order-pending')).toBeVisible()
    await page.clock.runFor(3000)
    await expect(page.getByTestId('order-pending')).toBeVisible()
    // liquida em 5 s (socket ou polling)
    await page.clock.runFor(2500)
    await page.clock.runFor(5000)
    await expect(page.getByTestId('receipt')).toBeVisible()
  })

  test('busca é aplicada só após o debounce', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-17T12:00:00-03:00') })
    await page.goto('/')
    await expect(page.getByTestId('catalog-grid')).toBeVisible()
    await page.clock.pauseAt(new Date('2026-10-17T12:05:00-03:00'))
    const search = page.getByRole('searchbox', { name: 'Buscar no catálogo' })
    await search.fill('Ivory')
    await page.clock.runFor(200)
    await expect(page).not.toHaveURL(/q=Ivory/)
    await page.clock.runFor(200)
    await expect(page).toHaveURL(/q=Ivory/)
  })
})
