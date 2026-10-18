import path from 'node:path'
import { expect, login, test, USERS } from './fixtures'

test.describe('Perfil e carteiras', () => {
  test('edição de perfil, avatar e senha com erros de validação', async ({ page }, info) => {
    await login(page, 'ana')
    await page.goto('/conta/perfil')
    await page.getByLabel(/^Nome de usuário/).fill('a')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Use 3 a 24 caracteres')).toBeVisible()

    // Conflito retornado pela API
    await page.getByLabel(/^Nome de usuário/).fill('bruno.nft')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Este nome de usuário já está em uso.')).toBeVisible()

    await page.getByLabel(/^Nome de usuário/).fill('ana.nova')
    await page.getByLabel(/^Nome de exibição/).fill('Ana Nova')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Perfil atualizado.')).toBeVisible()
    await page.reload()
    await expect(page.getByLabel(/^Nome de exibição/)).toHaveValue('Ana Nova')

    // Avatar: formato inválido e envio válido
    const input = page.locator('#avatar-input')
    const bad = path.join(info.outputDir, 'not-image.txt')
    const fs = await import('node:fs/promises')
    await fs.mkdir(info.outputDir, { recursive: true })
    await fs.writeFile(bad, 'oi')
    await input.setInputFiles(bad)
    await expect(page.getByText('Envie uma imagem PNG, JPG, WEBP ou GIF.')).toBeVisible()
    await input.setInputFiles('public/nfts/emerald-ape-320.webp')
    await expect(page.getByText('Avatar atualizado.')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Remover' })).toBeVisible()

    // Senha: atual incorreta, depois sucesso e login com a nova
    await page.getByLabel('Senha atual').fill('errada000')
    await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenha123')
    await page.getByLabel('Confirmar nova senha').fill('NovaSenha123')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Senha atual incorreta.')).toBeVisible()
    await page.getByLabel('Senha atual').fill(USERS.ana.password)
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Senha alterada com sucesso.')).toBeVisible()
  })

  test('cadastro e edição das carteiras principal e secundária', async ({ page }) => {
    await login(page, 'bruno')
    await page.goto('/conta/carteiras')
    const primary = page.getByRole('form', { name: 'Carteira principal' })
    await primary.getByRole('button', { name: 'Salvar carteira' }).click()
    await expect(primary.getByText('Endereço inválido (0x + 40 hexadecimais).')).toBeVisible()
    await primary.getByLabel(/^Nome de exibição/).fill('Bruno Lima')
    await primary.getByLabel(/^Apelido da carteira/).fill('Principal')
    await primary.getByLabel(/^Nome do perfil/).fill('bruno')
    await primary.getByLabel(/^Endereço da carteira/).fill('0x1111111111111111111111111111111111111111')
    await primary.getByLabel(/^E-mail/).fill(USERS.bruno.email)
    await primary.getByRole('button', { name: 'Salvar carteira' }).click()
    await expect(page.getByText('Carteira principal salva.')).toBeVisible()

    await page.getByLabel('Igual à carteira principal').check()
    await page.getByRole('button', { name: 'Adicionar' }).click()
    const secondary = page.getByRole('form', { name: 'Carteira secundária' })
    await expect(secondary.getByLabel(/^Nome de exibição/)).toHaveValue('Bruno Lima')
    await secondary.getByLabel(/^Endereço da carteira/).fill('0x1111111111111111111111111111111111111111')
    await secondary.getByRole('button', { name: 'Salvar carteira' }).click()
    await expect(secondary.getByText('Este endereço já está cadastrado.')).toBeVisible()
    await secondary.getByLabel(/^Endereço da carteira/).fill('0x2222222222222222222222222222222222222222')
    await secondary.getByRole('button', { name: 'Salvar carteira' }).click()
    await expect(page.getByText('Carteira secundária salva.')).toBeVisible()

    await page.reload()
    await expect(page.getByRole('form', { name: 'Carteira secundária' }).getByLabel(/^Endereço da carteira/)).toHaveValue('0x2222222222222222222222222222222222222222')
  })
})
