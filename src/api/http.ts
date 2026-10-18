import axios, { AxiosError } from 'axios'
import { mocksReady } from '@/lib/mocks-ready'
import { guestCartId, sessionStore } from '@/lib/session-store'
import type { ApiErrorBody, ApiErrorCode } from './types'

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode | 'NETWORK_ERROR' | 'TIMEOUT' | 'CANCELED'
  readonly fieldErrors: Record<string, string>
  readonly details: unknown

  constructor(opts: {
    status: number
    code: ApiError['code']
    message: string
    fieldErrors?: Record<string, string>
    details?: unknown
  }) {
    super(opts.message)
    this.name = 'ApiError'
    this.status = opts.status
    this.code = opts.code
    this.fieldErrors = opts.fieldErrors ?? {}
    this.details = opts.details
  }

  get isTransient() {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT' || this.status >= 500 || this.status === 429
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

export const http = axios.create({
  baseURL: API_URL,
  timeout: 10_000,
  headers: { Accept: 'application/json' },
})

http.interceptors.request.use(async (config) => {
  await mocksReady
  const token = sessionStore.token()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  else config.headers.set('X-Cart-Id', guestCartId())
  return config
})

http.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiErrorBody>) => {
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      return Promise.reject(new ApiError({ status: 0, code: 'CANCELED', message: 'Requisição cancelada.' }))
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return Promise.reject(new ApiError({ status: 0, code: 'TIMEOUT', message: 'O servidor demorou para responder.' }))
    }
    if (!error.response) {
      return Promise.reject(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Sem conexão com o servidor. Verifique sua rede.' }),
      )
    }
    const body = error.response.data?.error
    const apiError = new ApiError({
      status: error.response.status,
      code: body?.code ?? (error.response.status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR'),
      message: body?.message ?? 'Algo deu errado. Tente novamente.',
      fieldErrors: body?.fieldErrors,
      details: body?.details,
    })
    // 401: encerra a sessão; rotas privadas levam ao login guardando o destino.
    if (error.response.status === 401 && sessionStore.token() && error.config?.headers?.Authorization) {
      sessionStore.clear(apiError.code === 'SESSION_EXPIRED' ? 'expired' : 'logout')
    }
    return Promise.reject(apiError)
  },
)
