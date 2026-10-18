import { http, passthrough } from 'msw'
import { setupWorker } from 'msw/browser'
import { schedulePendingOrders } from './commerce'
import { initDb } from './db'
import { accountHandlers } from './handlers/account'
import { authHandlers } from './handlers/auth'
import { catalogHandlers } from './handlers/catalog'
import { commerceHandlers } from './handlers/commerce'
import { controlHandlers } from './handlers/control'
import { realtimeHandlers } from './realtime'
import { loadConfig, mockConfig } from './scenarios'

export async function startMocks() {
  mockConfig.current = loadConfig()
  await initDb()
  const worker = setupWorker(
    ...controlHandlers,
    ...authHandlers,
    ...catalogHandlers,
    ...commerceHandlers,
    ...accountHandlers,
    ...realtimeHandlers,
    http.get(/\.(avif|webp|png|svg|woff2?|js|css)$/, () => passthrough()),
  )
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: import.meta.env.PROD,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
  schedulePendingOrders()
  return worker
}
