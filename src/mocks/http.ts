import { delay, http, HttpResponse, type DefaultBodyType, type HttpResponseResolver, type PathParams } from 'msw'
import type { ApiErrorBody, ApiErrorCode } from '@/api/types'
import { db, type UserRecord } from './db'
import { mockConfig, seededRandom } from './scenarios'

export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export type RouteKind = 'catalog' | 'detail' | 'auth' | 'private' | 'favorite' | 'control'

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  extra: { fieldErrors?: Record<string, string>; details?: unknown } = {},
) {
  return HttpResponse.json<ApiErrorBody>({ error: { code, message, ...extra } }, { status })
}

/* ---------- Falhas injetadas (fila controlada pelos testes) ---------- */

export interface Fault {
  method: string
  path: string
  status: number
  code: ApiErrorCode
  times: number
  networkError?: boolean
  delayMs?: number
}
export const faults: Fault[] = []

let requestCounter = 0
const variableRandom = seededRandom(7)
const flakySeen = new Set<string>()

export function resetNetworkState() {
  faults.length = 0
  flakySeen.clear()
  requestCounter = 0
}

async function gate(request: Request, kind: RouteKind): Promise<Response | undefined> {
  if (kind === 'control') return undefined
  const { scenario, latencyMs } = mockConfig.current
  const url = new URL(request.url)
  requestCounter += 1

  const fault = faults.find((f) => f.method === request.method && url.pathname.includes(f.path))
  if (fault) {
    fault.times -= 1
    if (fault.times <= 0) faults.splice(faults.indexOf(fault), 1)
    if (fault.delayMs) await delay(fault.delayMs)
    if (fault.networkError) return HttpResponse.error()
    // status < 400 só atrasa (respostas fora de ordem).
    if (fault.status < 400) return undefined
    return apiError(fault.status, fault.code, 'Falha simulada pelo cenário de testes.')
  }

  let wait = latencyMs ?? (import.meta.env.MODE === 'test' ? 0 : 180)
  if (scenario === 'slow') wait = 2500
  if (scenario === 'variable' && (kind === 'catalog' || kind === 'detail')) {
    wait = Math.round(150 + variableRandom() * 1650)
  }
  if (wait > 0) await delay(wait)

  if (scenario === 'offline') return HttpResponse.error()
  if (scenario === 'server-error' && (kind === 'catalog' || kind === 'detail')) {
    return apiError(500, 'INTERNAL_ERROR', 'Erro interno ao consultar o catálogo.')
  }
  if (scenario === 'flaky' && (kind === 'catalog' || kind === 'detail')) {
    const key = `${request.method} ${url.pathname}${url.search}`
    if (!flakySeen.has(key)) {
      flakySeen.add(key)
      return apiError(503, 'SERVICE_UNAVAILABLE', 'Serviço temporariamente indisponível.')
    }
  }
  if (scenario === 'favorite-fail' && kind === 'favorite' && request.method !== 'GET') {
    return apiError(500, 'INTERNAL_ERROR', 'Não foi possível atualizar os favoritos.')
  }
  return undefined
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

export function route<Params extends PathParams = PathParams, Body extends DefaultBodyType = DefaultBodyType>(
  method: Method,
  path: string,
  kind: RouteKind,
  resolver: HttpResponseResolver<Params, Body>,
) {
  return http[method]<Params, Body>(`${API}${path}`, async (info) => {
    const early = await gate(info.request, kind)
    if (early) return early
    return resolver(info)
  })
}

/* ---------- Sessão ---------- */

export function bearer(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

export type AuthResult = { user: UserRecord; token: string } | { response: Response }

export function requireUser(request: Request): AuthResult {
  const token = bearer(request)
  if (!token) return { response: apiError(401, 'UNAUTHENTICATED', 'Faça login para continuar.') }
  const session = db.state.sessions.find((s) => s.token === token)
  if (!session) return { response: apiError(401, 'UNAUTHENTICATED', 'Sessão inválida.') }
  if (session.expiresAt <= Date.now()) {
    return { response: apiError(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.') }
  }
  const user = db.state.users.find((u) => u.id === session.userId)
  if (!user) return { response: apiError(401, 'UNAUTHENTICATED', 'Sessão inválida.') }
  return { user, token }
}

export function optionalUser(request: Request): UserRecord | null {
  const result = requireUser(request)
  return 'user' in result ? result.user : null
}

export async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    return (await request.json()) as Partial<T>
  } catch {
    return {}
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
