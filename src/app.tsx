import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createQueryClient } from '@/lib/query-client'
import { RealtimeProvider } from '@/realtime/hooks'
import { createAppRouter } from '@/router'

export function renderApp(container: HTMLElement) {
  const queryClient = createQueryClient()
  const router = createAppRouter(queryClient)
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          <RouterProvider router={router} />
        </RealtimeProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}
