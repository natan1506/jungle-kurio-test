import { addToCart, expect, login, test, USERS } from './fixtures'

test.describe('Carrinho', () => {
  test('quantidades, remoção, cupom e persistência após refresh @main', async ({ page }) => {
    await addToCart(page, 'emerald-ape-042', { quantity: 2 })
    await addToCart(page, 'sage-nomad-009')
    await page.goto('/carrinho')
    const items = page.getByTestId('cart-item')
    await expect(items).toHaveCount(2)
    await expect(page.getByTestId('summary-subtotal')).toHaveText('4.07 ETH') // 2×1.19 + 1.69

    await items.first().getByRole('button', { name: /Aumentar/ }).click()
    await expect(page.getByTestId('summary-subtotal')).toHaveText('5.26 ETH')

    // Cupom inválido, expirado e válido
    const coupon = page.getByLabel('Código promocional')
    await coupon.fill('NAOEXISTE')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByText('Cupom inválido.')).toBeVisible()
    await coupon.fill('VERAO2025')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByText('Este cupom expirou.')).toBeVisible()
    await coupon.fill('kurio10')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByTestId('summary-discount')).toHaveText('(-) 0.526 ETH')
    await expect(page.getByTestId('summary-total')).toHaveText('4.75 ETH') // 5.26 - 0.526 + 0.016

    await page.reload()
    await expect(items).toHaveCount(2)
    await expect(page.getByTestId('summary-total')).toHaveText('4.75 ETH')

    await page.getByRole('button', { name: 'Remover Sage Nomad #009 do carrinho' }).click()
    await expect(items).toHaveCount(1)
    await page.getByRole('button', { name: 'Remover', exact: true }).click()
    await expect(page.getByTestId('summary-discount')).toHaveText('(-) 0.00 ETH')
  })

  test('itens do visitante são preservados ao autenticar', async ({ page }) => {
    await addToCart(page, 'golden-beat-207', { quantity: 2 })
    await page.goto('/carrinho')
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(page).toHaveURL(/\/entrar/)
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('E-mail', { exact: true }).fill(USERS.ana.email)
    await dialog.getByLabel('Senha', { exact: true }).fill(USERS.ana.password)
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(/\/checkout/)
    await page.goto('/carrinho')
    await expect(page.getByTestId('cart-item')).toHaveCount(1)
    await expect(page.getByTestId('cart-item').getByRole('group').locator('output')).toHaveText('2')
  })

  test('respeita o limite de disponibilidade da edição', async ({ page }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042', { edition: '1/25', quantity: 3 })
    await page.goto('/nft/emerald-ape-042')
    await page.getByRole('radio', { name: '1/25', exact: true }).click()
    await expect(page.getByText('Você já atingiu o limite desta edição no carrinho.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Adicionar ao carrinho' })).toBeDisabled()
  })
})
