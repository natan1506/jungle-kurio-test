import { addToCart, expect, gotoApp, login, openReview, test, USERS } from './fixtures'

/** Requisitos transversais do enunciado não cobertos pelos fluxos principais. */

test.describe('Responsividade e zoom', () => {
  const PUBLIC = ['/', '/nft/emerald-ape-042', '/carrinho', '/entrar', '/cadastro', '/rota-inexistente']
  const PRIVATE = ['/conta/perfil', '/conta/carteiras', '/checkout']
  // 320 px equivale a 400% de zoom em 1280 px (reflow WCAG 1.4.10).
  const WIDTHS = [320, 390, 768, 1440]

  test('sem overflow horizontal em 320/390/768/1440', async ({ page }) => {
    test.setTimeout(90_000)
    const check = async (path: string, width: number) => {
      await page.setViewportSize({ width, height: 900 })
      await gotoApp(page, path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${path} @ ${width}px`).toBeLessThanOrEqual(0)
    }
    for (const width of WIDTHS) for (const path of PUBLIC) await check(path, width)
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    for (const width of WIDTHS) for (const path of PRIVATE) await check(path, width)
  })
})

test.describe('Sessão no checkout', () => {
  test('expiração durante o checkout preserva o contexto para retomada', async ({ page, mock }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    await page.goto('/checkout')
    await page.getByLabel(/^Observação do colecionador/).fill('Entregar na carteira Reserva')
    await mock.expireSessions()
    await page.getByRole('button', { name: 'Conectar', exact: true }).click()
    await expect(page).toHaveURL(/\/entrar\?.*redirect=%2Fcheckout.*reason=expired/)
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('E-mail', { exact: true }).fill(USERS.ana.email)
    await dialog.getByLabel('Senha', { exact: true }).fill(USERS.ana.password)
    await dialog.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(/\/checkout/)
    await expect(page.getByLabel(/^Observação do colecionador/)).toHaveValue('Entregar na carteira Reserva')
    await expect(page.getByTestId('price-summary').first()).toBeVisible()
  })
})

test.describe('Isolamento entre usuários', () => {
  test.use({ mockSetup: { latencyMs: 0, orderResolveMs: 60_000 } })

  test('pedido e eventos de outra sessão não chegam ao usuário atual', async ({ page, mock }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    const dialog = await openReview(page)
    await dialog.getByRole('button', { name: 'Confirmar compra' }).click()
    await expect(page.getByTestId('order-pending')).toBeVisible()
    const orderId = page.url().split('/').pop()!

    await page.goto('/conta/perfil')
    await page.getByRole('navigation', { name: 'Conta' }).getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/entrar/)
    await login(page, 'bruno')

    await gotoApp(page, `/pedidos/${orderId}`)
    await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible()
    // O pedido da Ana é liquidado: o evento não pode afetar a sessão do Bruno.
    await mock.resolveOrder(orderId, 'confirmed')
    await page.waitForTimeout(500)
    await expect(page.getByTestId('receipt')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible()
  })
})

test.describe('Idempotência na API simulada', () => {
  test('mesma chave recupera o pedido; conteúdo diferente gera conflito', async ({ page }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    const result = await page.evaluate(async () => {
      const token = JSON.parse(localStorage.getItem('kurio.session')!).token as string
      const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
      const quote = await (await fetch('/api/checkout/quote', { method: 'POST', headers, body: JSON.stringify({ network: 'ethereum' }) })).json()
      const buyer = {
        displayName: 'Ana Souza', username: 'ana', network: 'ethereum', profileName: 'ana',
        walletAddress: '0x4A1F9c2E7b3D8a6F0e5C4b9A7d2E1f3C8b6A9E2c', secondaryAddress: '', walletType: 'metamask',
        referralCode: '', email: 'ana@kurio.dev', ensName: 'ana', useAnotherWallet: false, notes: '',
      }
      const send = (walletId: string) =>
        fetch('/api/orders', {
          method: 'POST',
          headers: { ...headers, 'Idempotency-Key': 'idem_teste_fixo' },
          body: JSON.stringify({ quoteId: quote.id, walletId, network: 'ethereum', buyer }),
        })
      const first = await send('w_ana_1')
      const again = await send('w_ana_1')
      const conflict = await send('w_ana_2')
      return {
        first: [first.status, (await first.json()).id],
        again: [again.status, (await again.json()).id],
        conflict: [conflict.status, (await conflict.json()).error.code],
      }
    })
    expect(result.first[0]).toBe(201)
    expect(result.again).toEqual([200, result.first[1]])
    expect(result.conflict).toEqual([409, 'IDEMPOTENCY_CONFLICT'])
  })
})

test.describe('Reconexão com pedido pendente', () => {
  test.use({ mockSetup: { latencyMs: 0, orderResolveMs: 60_000 } })

  test('pedido liquidado durante a desconexão é recuperado ao reconectar', async ({ page, mock }) => {
    await login(page, 'ana')
    await addToCart(page, 'golden-beat-207')
    const dialog = await openReview(page)
    await dialog.getByRole('button', { name: 'Confirmar compra' }).click()
    await expect(page.getByTestId('order-pending')).toBeVisible()
    const orderId = page.url().split('/').pop()!
    await mock.dropSocket(2500)
    await expect(page.getByText('Tempo real desconectado. Reconectando…')).toBeVisible()
    await mock.resolveOrder(orderId, 'confirmed') // evento perdido: socket fora
    await expect(page.getByText('Tempo real desconectado. Reconectando…')).toBeHidden({ timeout: 10_000 })
    await expect(page.getByTestId('receipt')).toBeVisible()
    // Estado terminal: reenviar eventos não altera o recibo.
    const total = await page.getByTestId('receipt-total').textContent()
    await mock.replayLastEvent()
    await expect(page.getByTestId('receipt-total')).toHaveText(total!)
  })
})

test.describe('Atualização em segundo plano', () => {
  test('carrinho indica atualização enquanto refaz o resumo após evento', async ({ page, mock }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    await page.goto('/carrinho')
    await expect(page.getByTestId('summary-subtotal')).toHaveText('1.19 ETH')
    await mock.scenario('default', { latencyMs: 1200 })
    await mock.updateNft('emerald-ape-042', { editionId: 'e50', priceEth: '1.25' })
    await expect(page.getByTestId('cart-refreshing')).toBeVisible()
    await expect(page.getByTestId('summary-subtotal')).toHaveText('1.25 ETH')
    await expect(page.getByTestId('cart-refreshing')).toHaveCount(0)
  })
})

test.describe('Edição esgota durante a compra (cenário sold-out)', () => {
  test('revisão é encerrada e o carrinho orienta a remover o item', async ({ page, mock }) => {
    await login(page, 'ana')
    await addToCart(page, 'emerald-ape-042')
    await mock.scenario('sold-out', { latencyMs: 0, checkoutChangeDelayMs: 800 })
    const dialog = await openReview(page)
    await expect(dialog.getByTestId('quote-changes')).toContainText('disponibilidade')
    await dialog.getByRole('button', { name: 'Atualizar cotação' }).click()
    await expect(page.getByRole('dialog', { name: 'Revise seu pedido' })).toBeHidden()
    await expect(page.getByText('Nenhum item do carrinho está disponível para compra.')).toBeVisible()
    await page.goto('/carrinho')
    await expect(page.getByTestId('cart-notice')).toContainText('Edição esgotada')
    await expect(page.getByRole('button', { name: 'Conectar e finalizar' })).toBeDisabled()
  })
})
