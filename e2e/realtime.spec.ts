import { addToCart, expect, login, openReview, test } from './fixtures'

test.describe('Tempo real (Socket.IO)', () => {
  test('preço alterado durante o checkout bloqueia cotação desatualizada @main', async ({ page, mock }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    await page.goto('/carrinho')
    await expect(page.getByTestId('summary-subtotal')).toHaveText('1.19 ETH')

    // Mudança chega pelo socket enquanto o carrinho está aberto.
    await mock.updateNft('emerald-ape-042', { editionId: 'e50', priceEth: '1.29' })
    await expect(page.getByTestId('cart-notice')).toContainText('Preço alterado de 1.19 ETH para 1.29 ETH')
    await expect(page.getByTestId('summary-subtotal')).toHaveText('1.29 ETH')

    const dialog = await openReview(page)
    await mock.updateNft('emerald-ape-042', { editionId: 'e50', priceEth: '1.49' })
    await expect(dialog.getByTestId('quote-changes')).toContainText('A cotação ficou desatualizada')
    await expect(dialog.getByRole('button', { name: 'Confirmar compra' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Atualizar cotação' }).click()
    await expect(dialog.getByTestId('quote-changes')).toContainText('1.29 ETH → 1.49 ETH')
    await expect(dialog.getByTestId('summary-subtotal')).toHaveText('1.49 ETH')
    await expect(dialog.getByRole('button', { name: 'Confirmar compra' })).toBeEnabled()
  })

  test('servidor rejeita cotação desatualizada e exige nova confirmação', async ({ page, mock }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    const dialog = await openReview(page)
    // Derruba o socket para que a mudança não seja vista pelo cliente.
    await mock.dropSocket(3000)
    await mock.updateNft('emerald-ape-042', { editionId: 'e50', available: 0 })
    await dialog.getByRole('button', { name: 'Confirmar compra' }).click()
    await expect(dialog.getByTestId('quote-changes')).toContainText('esgotou')
    await expect(page).toHaveURL(/\/checkout/)
  })

  test('eventos duplicados ou antigos não regridem o estado', async ({ page, mock }) => {
    await page.goto('/nft/ivory-baron-088')
    await expect(page.getByTestId('detail-price')).toContainText('1.79 ETH')
    await mock.updateNft('ivory-baron-088', { editionId: 'e50', priceEth: '2.10' })
    await expect(page.getByTestId('detail-price')).toContainText('2.10 ETH')
    await mock.staleEvent('ivory-baron-088', '0.01')
    await mock.replayLastEvent()
    await page.waitForTimeout(500)
    await expect(page.getByTestId('detail-price')).toContainText('2.10 ETH')
  })

  test('desconexão mostra aviso e reconcilia com REST ao reconectar', async ({ page, mock }) => {
    await page.goto('/nft/golden-beat-207')
    await expect(page.getByTestId('detail-price')).toContainText('0.99 ETH')
    await mock.dropSocket(2500)
    await expect(page.getByText('Tempo real desconectado. Reconectando…')).toBeVisible()
    // Mudança enquanto offline: só chega via reconciliação REST.
    await mock.updateNft('golden-beat-207', { editionId: 'e50', priceEth: '1.05' })
    await expect(page.getByText('Tempo real desconectado. Reconectando…')).toBeHidden({ timeout: 10_000 })
    await expect(page.getByTestId('detail-price')).toContainText('1.05 ETH')
  })

  test('pedido pendente é retomado após recarregar, sem nova compra', async ({ page, mock }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    const dialog = await openReview(page)
    await dialog.getByRole('button', { name: 'Confirmar compra' }).click()
    await expect(page.getByTestId('order-pending')).toBeVisible()
    const orderId = page.url().split('/').pop()!
    await page.reload()
    await expect(page.getByTestId('order-pending')).toBeVisible()
    await page.goto('/checkout')
    await expect(page.getByRole('link', { name: 'Acompanhar pedido' })).toBeVisible()
    await page.getByRole('link', { name: 'Acompanhar pedido' }).click()
    await mock.resolveOrder(orderId, 'confirmed')
    await expect(page.getByTestId('receipt')).toBeVisible()
  })
})
