import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, Link, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { RootLayout } from '@/components/layout/root-layout'
import { Button } from '@/components/ui/button'
import { catalogSearchSchema, type CatalogSearch } from "@/features/catalog/search"
import { sessionStore } from '@/lib/session-store'
// Code-splitting por rota: cada tela vira um chunk carregado sob demanda.
const HomePage = lazyRouteComponent(() => import('@/pages/home'), 'HomePage')
const NftDetailPage = lazyRouteComponent(() => import('@/pages/nft-detail'), 'NftDetailPage')
const CartPage = lazyRouteComponent(() => import('@/pages/cart'), 'CartPage')
const CheckoutPage = lazyRouteComponent(() => import('@/pages/checkout'), 'CheckoutPage')
const OrderPage = lazyRouteComponent(() => import('@/pages/order'), 'OrderPage')
const ProfilePage = lazyRouteComponent(() => import('@/pages/account'), 'ProfilePage')
const WalletsPage = lazyRouteComponent(() => import('@/pages/account'), 'WalletsPage')
const LoginPage = lazyRouteComponent(() => import('@/pages/auth'), 'LoginPage')
const RegisterPage = lazyRouteComponent(() => import('@/pages/auth'), 'RegisterPage')

export interface RouterContext {
  queryClient: QueryClient
}

function NotFound() {
  return (
    <div className="container-page flex flex-col items-center gap-4 py-24 text-center">
      <p className="text-5xl font-bold text-highlight">404</p>
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">O endereço acessado não existe ou foi movido.</p>
      <Button asChild>
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  )
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
})

/** Proteção das rotas privadas: sem sessão, vai ao login guardando o destino. */
function requireAuth({ location }: { location: { href: string } }) {
  if (!sessionStore.get()) {
    throw redirect({ to: '/entrar', search: { redirect: location.href, reason: undefined } })
  }
}

const redirectSearch = z.object({
  redirect: z.string().optional().catch(undefined),
  reason: z.enum(['expired']).optional().catch(undefined),
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search): CatalogSearch => catalogSearchSchema.parse(search),
  component: HomePage,
})

const nftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/nft/$id',
  component: NftDetailPage,
})

const cartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/carrinho',
  component: CartPage,
})

const checkoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/checkout',
  beforeLoad: requireAuth,
  component: CheckoutPage,
})

const orderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pedidos/$orderId',
  beforeLoad: requireAuth,
  component: OrderPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entrar',
  validateSearch: (s): Partial<z.output<typeof redirectSearch>> => redirectSearch.parse(s),
  beforeLoad: ({ search }) => {
    if (sessionStore.get()) throw redirect({ to: search.redirect?.startsWith('/') ? search.redirect : '/' })
  },
  component: function Login() {
    const { redirect, reason } = loginRoute.useSearch()
    return <LoginPage redirect={redirect} reason={reason} />
  },
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cadastro',
  validateSearch: (s): { redirect?: string } => redirectSearch.pick({ redirect: true }).parse(s),
  beforeLoad: () => {
    if (sessionStore.get()) throw redirect({ to: '/' })
  },
  component: function Register() {
    const { redirect } = registerRoute.useSearch()
    return <RegisterPage redirect={redirect} />
  },
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conta/perfil',
  beforeLoad: requireAuth,
  component: ProfilePage,
})

const walletsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conta/carteiras',
  validateSearch: (s): { redirect?: string } => redirectSearch.pick({ redirect: true }).parse(s),
  beforeLoad: requireAuth,
  component: function Wallets() {
    const { redirect } = walletsRoute.useSearch()
    return <WalletsPage redirect={redirect} />
  },
})

const accountIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conta',
  beforeLoad: () => {
    throw redirect({ to: '/conta/perfil' })
  },
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  nftRoute,
  cartRoute,
  checkoutRoute,
  orderRoute,
  loginRoute,
  registerRoute,
  accountIndexRoute,
  profileRoute,
  walletsRoute,
])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
