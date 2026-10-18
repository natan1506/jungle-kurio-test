import { addToCart, expect, gotoApp, login, test } from './fixtures'

test.describe('Acessibilidade', () => {
  test('navegação por teclado, foco de diálogo e validação de formulário @main', async ({ page }) => {
    await gotoApp(page, '/')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused()

    await page.goto('/nft/emerald-ape-042')
    const zoom = page.getByRole('button', { name: 'Ampliar imagem' })
    await zoom.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Foco preso no diálogo
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(zoom).toBeFocused()

    // Formulário de login: erros associados aos campos
    await page.goto('/entrar')
    const form = page.getByRole('dialog')
    await form.getByRole('button', { name: 'Entrar', exact: true }).press('Enter')
    const email = form.getByLabel('E-mail', { exact: true })
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    const describedBy = await email.getAttribute('aria-describedby')
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('Informe um e-mail válido.')
  })

  test('alterações em tempo real são anunciadas', async ({ page, mock }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    await page.goto('/nft/emerald-ape-042')
    await mock.updateNft('emerald-ape-042', { editionId: 'e50', priceEth: '1.25' })
    await expect(page.getByText('Emerald Ape #042 atualizado')).toBeVisible()
  })
})

test.describe('Carregamento e falhas', () => {
  test.use({ mockSetup: { scenario: 'slow' } })

  test('skeletons durante carregamento lento', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('nft-card-skeleton').first()).toBeVisible()
    await expect(page.getByTestId('catalog-grid')).toBeVisible({ timeout: 10_000 })
    await page.goto('/nft/emerald-ape-042')
    await expect(page.getByTestId('detail-skeleton')).toBeVisible()
    await page.goto('/carrinho')
    await expect(page.getByTestId('summary-skeleton')).toBeVisible()
  })
})

test.describe('Falha e recuperação', () => {
  test.use({ mockSetup: { scenario: 'server-error', latencyMs: 0 } })

  test('feedback de falha e recuperação após nova tentativa', async ({ page, mock }) => {
    await page.goto('/')
    await expect(page.getByText('Não foi possível carregar o catálogo.')).toBeVisible({ timeout: 15_000 })
    await mock.scenario('default', { latencyMs: 0 })
    await page.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByTestId('catalog-grid').getByRole('listitem')).toHaveCount(9)
  })
})
