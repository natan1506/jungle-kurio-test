import { addToCart, expect, login, openReview, test } from './fixtures'

test.describe('Falhas de pagamento', () => {
  test.use({ mockSetup: { latencyMs: 0, orderResolveMs: 1000, scenario: 'payment-declined' } })

  test('pagamento recusado preserva os itens no carrinho', async ({ page }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    const dialog = await openReview(page)
    await dialog.getByRole('button', { name: 'Confirmar compra' }).click()
    await expect(page.getByTestId('order-declined')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('receipt')).toHaveCount(0)
    await page.getByRole('link', { name: 'Voltar ao carrinho' }).click()
    await expect(page.getByTestId('cart-item')).toHaveCount(1)
  })
})

test.describe('Idempotência', () => {
  test.use({ mockSetup: { latencyMs: 0, orderResolveMs: 60_000 } })

  test('cliques repetidos criam um único pedido', async ({ page }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    const dialog = await openReview(page)
    let posts = 0
    page.on('request', (r) => r.method() === 'POST' && r.url().endsWith('/api/orders') && posts++)
    const confirm = dialog.getByRole('button', { name: 'Confirmar compra' })
    await confirm.click()
    await confirm.click({ force: true, timeout: 1000 }).catch(() => undefined)
    await expect(page).toHaveURL(/\/pedidos\/ord_/)
    expect(posts).toBe(1)
    const orders = await page.evaluate(async () => {
      const token = JSON.parse(localStorage.getItem('kurio.session')!).token
      const r = await fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } })
      return (await r.json()).items.length
    })
    expect(orders).toBe(1)
  })

  test('timeout após criar o pedido recupera o mesmo pedido', async ({ page }) => {
    test.setTimeout(60_000)
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    await page.evaluate(() => fetch('/api/__mock/scenario', { method: 'POST', body: JSON.stringify({ scenario: 'order-timeout' }) }))
    const dialog = await openReview(page)
    const keys: string[] = []
    page.on('request', (r) => r.url().endsWith('/api/orders') && r.method() === 'POST' && keys.push(r.headers()['idempotency-key']))
    await dialog.getByRole('button', { name: 'Confirmar compra' }).click()
    await expect(dialog.getByText('Não recebemos a confirmação do pedido')).toBeVisible({ timeout: 15_000 })
    await dialog.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page).toHaveURL(/\/pedidos\/ord_/)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    const count = await page.evaluate(async () => {
      const token = JSON.parse(localStorage.getItem('kurio.session')!).token
      const r = await fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } })
      return (await r.json()).items.length
    })
    expect(count).toBe(1)
  })
})
