import { HttpResponse } from 'msw'
import type { PasswordInput, ProfileInput, Wallet, WalletInput } from '@/api/types'
import { NETWORKS, WALLET_TYPES } from '@/api/types'
import { db, hashPassword, persist, randomId, toPublicUser, type UserRecord } from '../db'
import { apiError, EMAIL_RE, ETH_ADDRESS_RE, readJson, requireUser, route } from '../http'
import { mockConfig } from '../scenarios'
import { validatePassword } from './auth'

const MAX_AVATAR_BYTES = 1_000_000

function validateWallet(input: Partial<WalletInput>): Record<string, string> {
  const e: Record<string, string> = {}
  if (!input.displayName?.trim()) e.displayName = 'Informe o nome de exibição.'
  if (!input.nickname?.trim()) e.nickname = 'Informe o apelido da carteira.'
  if (!NETWORKS.some((n) => n.key === input.network)) e.network = 'Selecione uma rede.'
  if (!input.profileName?.trim()) e.profileName = 'Informe o nome do perfil.'
  if (!input.address || !ETH_ADDRESS_RE.test(input.address)) e.address = 'Endereço inválido (0x + 40 hexadecimais).'
  if (!WALLET_TYPES.some((t) => t.key === input.walletType)) e.walletType = 'Selecione o tipo de carteira.'
  if (!input.email || !EMAIL_RE.test(input.email)) e.email = 'Informe um e-mail válido.'
  if (input.secondaryAddress && !ETH_ADDRESS_RE.test(input.secondaryAddress) && !/\.(eth|kurio)$/.test(input.secondaryAddress)) {
    e.secondaryAddress = 'Informe um endereço 0x ou um nome ENS.'
  }
  if (input.ensName && !/^[a-z0-9-]{2,32}(\.[a-z0-9-]+)*$/i.test(input.ensName)) e.ensName = 'Nome ENS inválido.'
  return e
}

function sanitizeWallet(input: Partial<WalletInput>): Omit<WalletInput, 'slot'> {
  return {
    displayName: input.displayName!.trim(),
    nickname: input.nickname!.trim(),
    network: input.network!,
    profileName: input.profileName!.trim(),
    address: input.address!,
    secondaryAddress: input.secondaryAddress?.trim() ?? '',
    ensName: input.ensName?.trim() ?? '',
    walletType: input.walletType!,
    referralCode: input.referralCode?.trim() ?? '',
    email: input.email!.trim(),
  }
}

function withUser<T>(request: Request, fn: (user: UserRecord) => T | Promise<T>) {
  const auth = requireUser(request)
  if ('response' in auth) return auth.response
  return fn(auth.user)
}

export const accountHandlers = [
  route('get', '/me/profile', 'private', ({ request }) => withUser(request, (u) => HttpResponse.json(toPublicUser(u)))),

  route('patch', '/me/profile', 'private', async ({ request }) =>
    withUser(request, async (user) => {
      const body = await readJson<ProfileInput>(request)
      const e: Record<string, string> = {}
      const username = body.username?.trim() ?? ''
      const email = body.email?.trim().toLowerCase() ?? ''
      if (!body.displayName?.trim()) e.displayName = 'Informe o nome de exibição.'
      if (!/^[a-z0-9._-]{3,24}$/i.test(username)) e.username = 'Use 3 a 24 caracteres: letras, números, ponto, hífen ou _.'
      if (!EMAIL_RE.test(email)) e.email = 'Informe um e-mail válido.'
      if (!body.walletNickname?.trim()) e.walletNickname = 'Informe o apelido da carteira.'
      if (body.ensName && !/^[a-z0-9-]{2,32}$/i.test(body.ensName)) e.ensName = 'Use 2 a 32 letras, números ou hífen.'
      if (!e.email && db.state.users.some((u) => u.id !== user.id && u.email === email)) e.email = 'Este e-mail já está em uso.'
      if (!e.username && db.state.users.some((u) => u.id !== user.id && u.username.toLowerCase() === username.toLowerCase())) {
        e.username = 'Este nome de usuário já está em uso.'
      }
      if (Object.keys(e).length) return apiError(422, 'VALIDATION_ERROR', 'Revise os campos destacados.', { fieldErrors: e })
      Object.assign(user, {
        displayName: body.displayName!.trim(),
        username,
        email,
        ensName: body.ensName?.trim() ?? '',
        walletNickname: body.walletNickname!.trim(),
      })
      persist()
      return HttpResponse.json(toPublicUser(user))
    }),
  ),

  route('put', '/me/avatar', 'private', async ({ request }) =>
    withUser(request, async (user) => {
      const { dataUrl } = await readJson<{ dataUrl: string }>(request)
      if (!dataUrl || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(dataUrl)) {
        return apiError(422, 'VALIDATION_ERROR', 'Envie uma imagem PNG, JPG, WEBP ou GIF.', { fieldErrors: { avatar: 'Formato não suportado.' } })
      }
      if (dataUrl.length * 0.75 > MAX_AVATAR_BYTES) {
        return apiError(422, 'VALIDATION_ERROR', 'A imagem deve ter até 1 MB.', { fieldErrors: { avatar: 'A imagem deve ter até 1 MB.' } })
      }
      user.avatarUrl = dataUrl
      persist()
      return HttpResponse.json(toPublicUser(user))
    }),
  ),

  route('delete', '/me/avatar', 'private', ({ request }) =>
    withUser(request, (user) => {
      user.avatarUrl = null
      persist()
      return HttpResponse.json(toPublicUser(user))
    }),
  ),

  route('post', '/me/password', 'private', async ({ request }) =>
    withUser(request, async (user) => {
      const body = await readJson<PasswordInput>(request)
      if (!body.currentPassword || (await hashPassword(body.currentPassword, user.salt)) !== user.passwordHash) {
        return apiError(422, 'VALIDATION_ERROR', 'Senha atual incorreta.', { fieldErrors: { currentPassword: 'Senha atual incorreta.' } })
      }
      const err = validatePassword(body.newPassword)
      if (err) return apiError(422, 'VALIDATION_ERROR', err, { fieldErrors: { newPassword: err } })
      if (body.newPassword === body.currentPassword) {
        return apiError(422, 'VALIDATION_ERROR', 'A nova senha deve ser diferente da atual.', {
          fieldErrors: { newPassword: 'A nova senha deve ser diferente da atual.' },
        })
      }
      user.salt = randomId('salt')
      user.passwordHash = await hashPassword(body.newPassword!, user.salt)
      persist()
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  route('get', '/me/wallets', 'private', ({ request }) => withUser(request, (u) => HttpResponse.json<Wallet[]>(u.wallets))),

  route('post', '/me/wallets', 'private', async ({ request }) =>
    withUser(request, async (user) => {
      const body = await readJson<WalletInput>(request)
      const slot = body.slot === 'secondary' ? 'secondary' : 'primary'
      if (user.wallets.some((w) => w.slot === slot)) {
        return apiError(409, 'CONFLICT', `Já existe uma carteira ${slot === 'primary' ? 'principal' : 'secundária'}.`)
      }
      const e = validateWallet(body)
      if (Object.keys(e).length) return apiError(422, 'VALIDATION_ERROR', 'Revise os dados da carteira.', { fieldErrors: e })
      if (user.wallets.some((w) => w.address.toLowerCase() === body.address!.toLowerCase())) {
        return apiError(409, 'CONFLICT', 'Este endereço já está cadastrado.', { fieldErrors: { address: 'Este endereço já está cadastrado.' } })
      }
      const wallet: Wallet = { id: randomId('w'), slot, ...sanitizeWallet(body), updatedAt: new Date().toISOString() }
      user.wallets.push(wallet)
      persist()
      return HttpResponse.json(wallet, { status: 201 })
    }),
  ),

  route<{ id: string }>('put', '/me/wallets/:id', 'private', async ({ request, params }) =>
    withUser(request, async (user) => {
      const wallet = user.wallets.find((w) => w.id === params.id)
      if (!wallet) return apiError(404, 'NOT_FOUND', 'Carteira não encontrada.')
      const body = await readJson<WalletInput>(request)
      const e = validateWallet(body)
      if (Object.keys(e).length) return apiError(422, 'VALIDATION_ERROR', 'Revise os dados da carteira.', { fieldErrors: e })
      if (user.wallets.some((w) => w.id !== wallet.id && w.address.toLowerCase() === body.address!.toLowerCase())) {
        return apiError(409, 'CONFLICT', 'Este endereço já está cadastrado.', { fieldErrors: { address: 'Este endereço já está cadastrado.' } })
      }
      Object.assign(wallet, sanitizeWallet(body), { updatedAt: new Date().toISOString() })
      persist()
      return HttpResponse.json(wallet)
    }),
  ),

  /** Simula a conexão com a extensão da carteira (aprovação ou recusa). */
  route<{ id: string }>('post', '/me/wallets/:id/connect', 'private', async ({ request, params }) =>
    withUser(request, async (user) => {
      const wallet = user.wallets.find((w) => w.id === params.id)
      if (!wallet) return apiError(404, 'NOT_FOUND', 'Carteira não encontrada.')
      if (mockConfig.current.scenario === 'wallet-reject') {
        return apiError(403, 'WALLET_REJECTED', 'A conexão foi recusada na carteira.')
      }
      return HttpResponse.json({ walletId: wallet.id, address: wallet.address, connectedAt: new Date().toISOString() })
    }),
  ),
]
