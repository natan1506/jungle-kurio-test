import { Link, useNavigate } from '@tanstack/react-router'
import { LogIn, LogOut, Search, ShoppingCart, User, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLogout } from '@/features/auth/hooks'
import { useCart } from '@/features/cart/hooks'
import { useSession } from '@/lib/session-store'
import { cn } from '@/lib/utils'
import { ComingSoon } from './coming-soon'

const navLink =
  'relative py-5 text-sm transition-colors hover:text-highlight data-[status=active]:text-highlight data-[status=active]:after:absolute data-[status=active]:after:inset-x-0 data-[status=active]:after:bottom-0 data-[status=active]:after:h-0.5 data-[status=active]:after:bg-highlight'

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('text-sm font-bold tracking-[0.3em] text-foreground', className)} aria-label="Kurio — página inicial">
      KURIO
    </Link>
  )
}

export function Avatar({ name, url, className }: { name: string; url: string | null; className?: string }) {
  return url ? (
    <img src={url} alt="" className={cn('size-8 rounded-full object-cover', className)} width={32} height={32} />
  ) : (
    <span aria-hidden className={cn('inline-flex size-8 items-center justify-center rounded-full btn-gradient text-xs font-bold text-primary-foreground', className)}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function CartButton({ className }: { className?: string }) {
  const cart = useCart()
  const count = cart.data?.itemCount ?? 0
  return (
    <Link
      to="/carrinho"
      className={cn('relative inline-flex size-10 items-center justify-center rounded-full hover:bg-accent', className)}
      aria-label={`Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`}
    >
      <ShoppingCart className="size-5" aria-hidden />
      {count > 0 && (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full btn-gradient px-1 text-[10px] font-bold text-primary-foreground">
          {count}
        </span>
      )}
    </Link>
  )
}

export function Header() {
  const session = useSession()
  const logout = useLogout()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [term, setTerm] = useState('')

  return (
    <header className="sticky top-0 z-40 hidden border-b border-border/70 bg-background/95 backdrop-blur md:block">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Principal" className="hidden md:block">
          <ul className="flex items-center gap-10">
            <li>
              <Link to="/" className={navLink} activeOptions={{ exact: true, includeSearch: false, includeHash: true }}>
                Início
              </Link>
            </li>
            <li>
              <Link to="/" hash="catalogo" className="py-5 text-sm transition-colors hover:text-highlight" activeOptions={{ includeHash: true, exact: true }} activeProps={{ className: "text-highlight" }}>
                Mercado
              </Link>
            </li>
            <li>
              <ComingSoon label="Criadores" />
            </li>
            <li>
              <ComingSoon label="Aprenda" />
            </li>
          </ul>
        </nav>
        <div className="flex items-center gap-1">
          {searchOpen ? (
            <form
              role="search"
              className="hidden md:block"
              onSubmit={(e) => {
                e.preventDefault()
                void navigate({ to: '/', search: (s) => ({ ...s, q: term || undefined, page: undefined }), hash: 'catalogo' })
                setSearchOpen(false)
              }}
            >
              <label htmlFor="header-search" className="sr-only">
                Buscar NFTs
              </label>
              <input
                id="header-search"
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onBlur={() => !term && setSearchOpen(false)}
                placeholder="Buscar NFTs"
                className="h-9 w-56 rounded-full border border-input bg-card px-4 text-sm"
              />
            </form>
          ) : (
            <button
              type="button"
              className="hidden size-10 items-center justify-center rounded-full hover:bg-accent md:inline-flex"
              onClick={() => setSearchOpen(true)}
              aria-label="Abrir busca"
            >
              <Search className="size-5" aria-hidden />
            </button>
          )}
          <CartButton />
          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-1 rounded-full" aria-label={`Menu da conta de ${session.user.displayName}`}>
                <Avatar name={session.user.displayName} url={session.user.avatarUrl} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{session.user.displayName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/conta/perfil">
                    <User aria-hidden /> Meu perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/conta/carteiras">
                    <Wallet aria-hidden /> Carteiras
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => logout.mutate()}>
                  <LogOut aria-hidden /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="outline" size="sm" className="ml-2 hidden md:inline-flex">
              <Link to="/entrar" search={{ redirect: undefined }}>
                <LogIn aria-hidden /> Entrar
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
