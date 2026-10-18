import './index.css'
import { renderApp } from './app'
import { markMocksReady } from './lib/mocks-ready'

// Renderiza já; Axios e socket esperam o MSW (mocksReady).
renderApp(document.getElementById('root')!)

if (import.meta.env.VITE_ENABLE_MOCKS !== 'false') {
  void import('./mocks/browser').then(({ startMocks }) => startMocks()).then(markMocksReady)
} else {
  markMocksReady()
}
