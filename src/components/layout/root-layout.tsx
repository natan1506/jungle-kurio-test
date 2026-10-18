import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useRouter } from '@tanstack/react-router'
import { WifiOff } from 'lucide-react'
import { lazy, Suspense, useEffect } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { api } from '@/api/endpoints'
import { sessionStore, useSession } from '@/lib/session-store'
import { useConnectionState } from '@/realtime/hooks'
import { Footer } from './footer'
import { Header } from './header'
import { MobileTabBar } from './mobile-tab-bar'

const MockPanel = lazy(() => import('@/components/mock-panel').then((m) => ({ default: m.MockPanel })))

export const PRIVATE_PREFIXES = ['/checkout', '/conta', '/pedidos']

/**
 * Encerramento de sessão (logout, expiração, troca de usuário): limpa todos os
 * dados privados do cache. Em rotas privadas, redireciona ao login preservando
 * o destino para retomada.
 */
function SessionWatcher() {
  const queryClient = useQueryClient()
  const router = useRouter()
  useEffect(
    () =>
      sessionStore.onEnd((reason, previous) => {
        if (previous) {
          const uid = previous.user.id
          queryClient.removeQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes(`"${uid}"`) })
        }
        if (reason === 'switch') return
        const { pathname, searchStr } = router.state.location
        const isPrivate = PRIVATE_PREFIXES.some((p) => pathname.startsWith(p))
        if (reason === 'expired') {
          toast.warning('Sua sessão expirou.', { description: 'Entre novamente para continuar.' })
        }
        if (isPrivate) {
          void router.navigate({
            to: '/entrar',
            search: { redirect: reason === 'expired' ? pathname + searchStr : undefined, reason: reason === 'expired' ? 'expired' : undefined },
            replace: true,
          })
        }
      }),
    [queryClient, router],
  )

  // Revalida a sessão ao carregar e no instante em que ela expira.
  const session = useSession()
  useEffect(() => {
    if (!session) return
    const check = () => api.auth.session().then((s) => sessionStore.set(s), () => undefined)
    void check()
    const wait = Date.parse(session.expiresAt) - Date.now() + 250
    const timer = setTimeout(check, Math.max(0, Math.min(wait, 2 ** 31 - 1)))
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token])
  return null
}

function ConnectionBanner() {
  const state = useConnectionState()
  if (state !== 'reconnecting') return null
  return (
    <div role="status" className="fixed inset-x-0 top-16 z-30 flex justify-center px-4">
      <p className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs shadow">
        <WifiOff className="size-3.5 text-highlight" aria-hidden /> Tempo real desconectado. Reconectando…
      </p>
    </div>
  )
}

export function RootLayout() {
  return (
    <TooltipProvider delayDuration={200}>
      <a href="#conteudo" className="sr-only z-50 rounded bg-card px-4 py-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Pular para o conteúdo
      </a>
      <SessionWatcher />
      <Header />
      <ConnectionBanner />
      <main id="conteudo" tabIndex={-1} className="min-h-[70vh] pb-28 outline-none md:min-h-dvh md:pb-0">
        <Outlet />
      </main>
      <Footer />
      <MobileTabBar />
      <Toaster position="top-right" richColors closeButton />
      {import.meta.env.VITE_ENABLE_MOCKS !== 'false' && !hideMockPanel() && (
        <Suspense>
          <MockPanel />
        </Suspense>
      )}
    </TooltipProvider>
  )
}

/** Permite ocultar o botão de mocks (ex.: E2E/regressão visual) via localStorage. */
function hideMockPanel() {
  try {
    return localStorage.getItem('kurio.mock.hidePanel') === '1'
  } catch {
    return false
  }
}
