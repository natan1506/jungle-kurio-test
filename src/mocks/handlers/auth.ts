import { HttpResponse } from 'msw'
import type { LoginInput, RegisterInput, Session } from '@/api/types'
import { db, hashPassword, persist, randomId, toPublicUser, type UserRecord } from '../db'
import { apiError, bearer, EMAIL_RE, readJson, requireUser, route } from '../http'
import { mockConfig } from '../scenarios'

const DEFAULT_TTL_MS = 30 * 60 * 1000
const SHORT_TTL_MS = 20 * 1000

function createSession(user: UserRecord): Session {
  const ttl = mockConfig.current.scenario === 'session-expired' ? SHORT_TTL_MS : DEFAULT_TTL_MS
  const token = randomId('tok')
  const expiresAt = Date.now() + ttl
  db.state.sessions = db.state.sessions.filter((s) => s.expiresAt > Date.now())
  db.state.sessions.push({ token, userId: user.id, expiresAt })
  persist()
  return { token, expiresAt: new Date(expiresAt).toISOString(), user: toPublicUser(user) }
}

export function validatePassword(password: string | undefined): string | null {
  if (!password || password.length < 8) return 'A senha deve ter pelo menos 8 caracteres.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use letras e números na senha.'
  return null
}

export const authHandlers = [
  route('post', '/auth/register', 'auth', async ({ request }) => {
    const body = await readJson<RegisterInput>(request)
    const fieldErrors: Record<string, string> = {}
    const username = body.username?.trim() ?? ''
    const email = body.email?.trim().toLowerCase() ?? ''
    if (!/^[a-z0-9._-]{3,24}$/i.test(username)) fieldErrors.username = 'Use 3 a 24 caracteres: letras, números, ponto, hífen ou _.'
    if (!EMAIL_RE.test(email)) fieldErrors.email = 'Informe um e-mail válido.'
    const pwdError = validatePassword(body.password)
    if (pwdError) fieldErrors.password = pwdError
    if (Object.keys(fieldErrors).length) {
      return apiError(422, 'VALIDATION_ERROR', 'Revise os campos destacados.', { fieldErrors })
    }
    if (db.state.users.some((u) => u.email === email)) {
      return apiError(409, 'EMAIL_TAKEN', 'Este e-mail já está cadastrado.', { fieldErrors: { email: 'Este e-mail já está cadastrado.' } })
    }
    if (db.state.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return apiError(409, 'USERNAME_TAKEN', 'Este nome de usuário já está em uso.', {
        fieldErrors: { username: 'Este nome de usuário já está em uso.' },
      })
    }
    const id = randomId('u')
    const salt = randomId('salt')
    const user: UserRecord = {
      id,
      username,
      displayName: username,
      email,
      ensName: '',
      walletNickname: '',
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      salt,
      passwordHash: await hashPassword(body.password!, salt),
      favorites: [],
      wallets: [],
    }
    db.state.users.push(user)
    persist()
    return HttpResponse.json(createSession(user), { status: 201 })
  }),

  route('post', '/auth/login', 'auth', async ({ request }) => {
    const body = await readJson<LoginInput>(request)
    const email = body.email?.trim().toLowerCase() ?? ''
    const fieldErrors: Record<string, string> = {}
    if (!EMAIL_RE.test(email)) fieldErrors.email = 'Informe um e-mail válido.'
    if (!body.password) fieldErrors.password = 'Informe sua senha.'
    if (Object.keys(fieldErrors).length) {
      return apiError(422, 'VALIDATION_ERROR', 'Revise os campos destacados.', { fieldErrors })
    }
    const user = db.state.users.find((u) => u.email === email)
    if (!user || (await hashPassword(body.password!, user.salt)) !== user.passwordHash) {
      return apiError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.')
    }
    return HttpResponse.json(createSession(user))
  }),

  route('get', '/auth/session', 'auth', ({ request }) => {
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const session = db.state.sessions.find((s) => s.token === auth.token)!
    return HttpResponse.json<Session>({
      token: auth.token,
      expiresAt: new Date(session.expiresAt).toISOString(),
      user: toPublicUser(auth.user),
    })
  }),

  route('post', '/auth/logout', 'auth', ({ request }) => {
    const token = bearer(request)
    db.state.sessions = db.state.sessions.filter((s) => s.token !== token)
    persist()
    return new HttpResponse(null, { status: 204 })
  }),
]
