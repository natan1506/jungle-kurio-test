import { expect, test } from './fixtures'

test.describe('Detalhe do NFT', () => {
  test('acesso direto, edição indisponível e limite de quantidade @main', async ({ page }) => {
    await page.goto('/nft/emerald-ape-042')
    await expect(page.getByRole('heading', { level: 1, name: 'Emerald Ape #042' })).toBeVisible()
    await expect(page.getByTestId('detail-price')).toContainText('1.19 ETH')

    // 1/10 está esgotada
    const soldOut = page.getByRole('radio', { name: /1\/10/ })
    await expect(soldOut).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByRole('radio', { name: '1/50', exact: true })).toHaveAttribute('aria-checked', 'true')

    // 1/25: 4 disponíveis, máximo 3 por pedido
    await page.getByRole('radio', { name: '1/25', exact: true }).click()
    const plus = page.getByRole('button', { name: 'Aumentar Quantidade' })
    await plus.click()
    await plus.click()
    await expect(plus).toBeDisabled()
    await expect(page.getByRole('group', { name: 'Quantidade' }).locator('output')).toHaveText('3')
  })

  test('NFT inexistente mostra estado de não encontrado', async ({ page }) => {
    await page.goto('/nft/nao-existe-000')
    await expect(page.getByRole('heading', { name: 'NFT não encontrado' })).toBeVisible()
    await page.getByRole('link', { name: 'Voltar ao catálogo' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('rota inexistente mostra 404', async ({ page }) => {
    await page.goto('/rota/que/nao/existe')
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
  })
})
