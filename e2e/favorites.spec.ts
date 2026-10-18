import { expect, login, test } from './fixtures'

test.describe('Favoritos', () => {
  test('favorita com atualização otimista e persiste @main', async ({ page }) => {
    await login(page, 'ana')
    await page.goto('/nft/emerald-ape-042')
    const fav = page.getByRole('button', { name: 'Favoritar Emerald Ape #042' })
    await fav.click()
    await expect(page.getByRole('button', { name: 'Remover Emerald Ape #042 dos favoritos' })).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Remover Emerald Ape #042 dos favoritos' })).toBeVisible()
    await page.goto('/?favorites=true')
    await expect(page.getByTestId('catalog-grid').getByRole('heading', { name: 'Emerald Ape #042' })).toBeVisible()
  })

  test('falha da mutation faz rollback e permite nova tentativa', async ({ page, mock }) => {
    await login(page, 'ana')
    await page.goto('/nft/ivory-baron-088')
    await mock.fault({ method: 'PUT', path: '/me/favorites', status: 500, code: 'INTERNAL_ERROR', times: 1, delayMs: 400 })
    await page.getByRole('button', { name: 'Favoritar Ivory Baron #088' }).click()
    // otimista
    await expect(page.getByRole('button', { name: 'Remover Ivory Baron #088 dos favoritos' })).toBeVisible()
    // rollback após a falha
    await expect(page.getByText('Não foi possível favoritar Ivory Baron #088.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Favoritar Ivory Baron #088' })).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: 'Favoritar Ivory Baron #088' }).click()
    await expect(page.getByText('Ivory Baron #088 adicionado aos favoritos.')).toBeVisible()
  })

  test('visitante é levado ao login ao favoritar', async ({ page }) => {
    await page.goto('/nft/emerald-ape-042')
    await page.getByRole('button', { name: 'Favoritar Emerald Ape #042' }).click()
    await expect(page).toHaveURL(/\/entrar\?redirect=%2Fnft%2Femerald-ape-042/)
  })
})
