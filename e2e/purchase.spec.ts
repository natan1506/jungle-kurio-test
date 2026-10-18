import { addToCart, expect, login, openReview, test } from './fixtures'

test.describe('Compra', () => {
  test.use({ mockSetup: { latencyMs: 0, orderResolveMs: 1200 } })

  test('compra completa do catálogo ao recibo confirmado @main', async ({ page }) => {
    await login(page, 'ana')
    await page.goto('/')
    await page.getByTestId('catalog-grid').getByRole('link', { name: 'Emerald Ape #042' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible()
    await page.getByRole('button', { name: 'Aumentar Quantidade' }).click()
    await page.getByRole('button', { name: 'Comprar' }).click()
    await expect(page).toHaveURL(/\/carrinho/)
    await addToCart(page, 'golden-beat-207')
    await page.goto('/carrinho')
    await page.getByLabel('Código promocional').fill('KURIO10')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByTestId('summary-discount')).toHaveText('(-) 0.337 ETH')
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(page).toHaveURL(/\/checkout/)

    const dialog = await openReview(page)
    await expect(dialog.getByTestId('summary-total')).toHaveText('3.035 ETH') // 3.37 - 0.337 + 0.002 (taxa Polygon)
    await dialog.getByRole('button', { name: 'Confirmar compra' }).click()
    await expect(page).toHaveURL(/\/pedidos\/ord_/)
    await expect(page.getByTestId('order-pending')).toBeVisible()
    const receipt = page.getByTestId('receipt')
    await expect(receipt).toBeVisible({ timeout: 10_000 })
    await expect(receipt.getByText('Seus NFTs agora estão na sua carteira')).toBeVisible()
    await expect(receipt.getByTestId('tx-hash')).toHaveText(/^0x/)
    await expect(receipt.getByTestId('receipt-total')).toHaveText('3.035 ETH')

    // Somente itens comprados saem do carrinho; recibo é um snapshot.
    await page.goto('/carrinho')
    await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible()
  })

  test('recibo não muda após alteração posterior do catálogo', async ({ page, mock }) => {
    await login(page, 'ana')
    await addToCart(page, 'sage-nomad-009')
    const dialog = await openReview(page)
    await dialog.getByRole('button', { name: 'Confirmar compra' }).click()
    await expect(page.getByTestId('receipt')).toBeVisible({ timeout: 10_000 })
    const total = await page.getByTestId('receipt-total').textContent()
    await mock.updateNft('sage-nomad-009', { priceEth: '9.99' })
    await page.reload()
    await expect(page.getByTestId('receipt-total')).toHaveText(total!)
  })
})
