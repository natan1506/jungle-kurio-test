import { Link } from '@tanstack/react-router'
import { Compass, Heart, Home, ShoppingCart, User } from 'lucide-react'
import { useCart } from '@/features/cart/hooks'
import { useSession } from '@/lib/session-store'

const item =
  'flex flex-1 flex-col items-center gap-0.5 py-3 text-[10px] text-muted-foreground data-[status=active]:text-highlight'

export function MobileTabBar() {
  const session = useSession()
  const cart = useCart()
  const count = cart.data?.itemCount ?? 0
  return (
    <nav aria-label="Navegação móvel" className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-border bg-card/95 shadow-lg backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-md items-stretch">
        <li className="flex flex-1">
          <Link to="/" className={item} activeOptions={{ exact: true, includeSearch: false, includeHash: true }}>
            <Home className="size-5" aria-hidden />
            Início
          </Link>
        </li>
        <li className="flex flex-1">
          <Link to="/" search={{ favorites: true }} hash="catalogo" className={item} activeOptions={{ includeSearch: true, exact: true }}>
            <Heart className="size-5" aria-hidden />
            Favoritos
          </Link>
        </li>
        <li className="flex flex-1 justify-center">
          <Link
            to="/"
            hash="catalogo"
            className="-mt-5 inline-flex size-14 items-center justify-center rounded-full border-4 border-background btn-gradient text-primary-foreground shadow-lg"
            aria-label="Explorar o mercado"
          >
            <Compass className="size-6" aria-hidden />
          </Link>
        </li>
        <li className="flex flex-1">
          <Link to="/carrinho" className={item}>
            <span className="relative">
              <ShoppingCart className="size-5" aria-hidden />
              {count > 0 && (
                <span aria-hidden className="absolute -right-2 -top-1.5 rounded-full btn-gradient px-1 text-[9px] font-bold text-primary-foreground">
                  {count}
                </span>
              )}
            </span>
            <span>
              Carrinho<span className="sr-only">, {count} {count === 1 ? 'item' : 'itens'}</span>
            </span>
          </Link>
        </li>
        <li className="flex flex-1">
          {session ? (
            <Link to="/conta/perfil" className={item}>
              <User className="size-5" aria-hidden />
              Perfil
            </Link>
          ) : (
            <Link to="/entrar" search={{ redirect: undefined }} className={item}>
              <User className="size-5" aria-hidden />
              Entrar
            </Link>
          )}
        </li>
      </ul>
    </nav>
  )
}
