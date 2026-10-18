import { expect, gotoApp, test } from './fixtures'

const cards = (page: import('@playwright/test').Page) => page.getByTestId('catalog-grid').getByRole('heading', { level: 3 })

test.describe('Catálogo', () => {
  test('busca, filtros combinados, ordenação, paginação e histórico @main', async ({ page }) => {
    await gotoApp(page, '/')
    await expect(cards(page)).toHaveCount(9)

    // Paginação
    await page.getByRole('button', { name: 'Página 2' }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page')

    // Filtro reinicia a paginação (no mobile os filtros ficam no drawer)
    const isMobile = (page.viewportSize()?.width ?? 1440) < 768
    if (isMobile) await page.getByRole('button', { name: /^Filtros/ }).click()
    const scope = isMobile ? page.getByRole('dialog') : page.getByRole('complementary', { name: 'Filtros' })
    await scope.getByText('Arte digital', { exact: true }).click()
    await expect(page).not.toHaveURL(/page=2/)
    await expect(page).toHaveURL(/categories/)
    await scope.getByRole('checkbox', { name: 'Ethereum' }).click()
    await expect(page).toHaveURL(/networks/)
    if (isMobile) await page.keyboard.press('Escape')

    // Ordenação por preço crescente
    await page.getByRole('combobox', { name: 'Ordenar por:' }).click()
    await page.getByRole('option', { name: 'Menor preço' }).click()
    await expect(page).toHaveURL(/sort=price_asc/)
    const prices = await page.getByTestId('nft-price').allTextContents()
    const nums = prices.map((p) => Number(p.replace(' ETH', '')))
    expect(nums).toEqual([...nums].sort((a, b) => a - b))

    // Busca
    await page.getByRole('searchbox', { name: 'Buscar no catálogo' }).fill('Emerald')
    await expect(page).toHaveURL(/q=Emerald/)
    await expect(cards(page).first()).toHaveText('Emerald Ape #042')

    // Restaura pelo histórico e após refresh
    await page.reload()
    await expect(page.getByRole('searchbox', { name: 'Buscar no catálogo' })).toHaveValue('Emerald')
    await expect(cards(page).first()).toHaveText('Emerald Ape #042')
    await page.goBack()
    await expect(page).not.toHaveURL(/q=Emerald/)
    await expect(page).toHaveURL(/sort=price_asc/)
  })

  test('resultado vazio e limpeza dos filtros', async ({ page }) => {
    await gotoApp(page, '/?q=inexistente-xyz')
    await expect(page.getByText('Nenhum NFT encontrado')).toBeVisible()
    await page.getByRole('button', { name: 'Limpar filtros' }).click()
    await expect(cards(page)).toHaveCount(9)
  })

  test('parâmetros enviados à API refletem o estado da URL', async ({ page }) => {
    const req = page.waitForRequest((r) => r.url().includes('/api/nfts?') && r.url().includes('sort=price_desc'))
    await gotoApp(page, '/?sort=price_desc&categories=%5B%22musica%22%5D&page=1')
    const url = new URL((await req).url())
    expect(url.searchParams.get('categories')).toBe('musica')
    expect(url.searchParams.get('sort')).toBe('price_desc')
  })

  test('respostas fora de ordem não sobrescrevem a busca atual', async ({ page, mock }) => {
    await gotoApp(page, '/')
    // A primeira busca demora mais que a segunda.
    await mock.fault({ method: 'GET', path: '/api/nfts', delayMs: 1500, status: 200, times: 1 })
    const search = page.getByRole('searchbox', { name: 'Buscar no catálogo' })
    await search.fill('Golden')
    await page.waitForTimeout(450)
    await search.fill('Ivory')
    await expect(cards(page).first()).toHaveText('Ivory Baron #088')
    await page.waitForTimeout(1600)
    await expect(cards(page).first()).toHaveText('Ivory Baron #088')
  })
})
