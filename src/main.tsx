import './index.css'
import { renderApp } from './app'
import { markMocksReady } from './lib/mocks-ready'

// O app renderiza já (pintura inicial sem esperar o MSW); as requisições
// aguardam `mocksReady` no interceptor do Axios e no RealtimeClient.
renderApp(document.getElementById('root')!)

if (import.meta.env.VITE_ENABLE_MOCKS !== 'false') {
  // Chunk de mocks avaliado depois da primeira pintura.
  void import('./mocks/browser').then(({ startMocks }) => startMocks()).then(markMocksReady)
} else {
  markMocksReady()
}
