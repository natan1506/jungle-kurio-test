import { Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { isApiError } from '@/api/http'
import type { Cart, CartItem } from '@/api/types'
import { MobileTopBar } from '@/components/layout/mobile-top-bar'
import { NftImage } from '@/components/nft-image'
import { QuantityStepper } from '@/components/quantity-stepper'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAckCart, useApplyCoupon, useCart, useRemoveCartItem, useRemoveCoupon, useUpdateCartItem } from '@/features/cart/hooks'
import { PriceSummary, PriceSummarySkeleton } from '@/features/cart/price-summary'
import { useCatalog } from '@/features/catalog/hooks'
import { NftCard } from '@/features/catalog/nft-card'
import { formatEth } from '@/lib/money'

function noticeText(item: CartItem) {
  return item.notices.map((n) => {
    if (n.type === 'price_changed') return `Preço alterado de ${formatEth(n.fromEth)} para ${formatEth(n.toEth)}.`
    if (n.type === 'quantity_reduced') return `Quantidade ajustada de ${n.from} para ${n.to} pela disponibilidade.`
    return 'Edição esgotada. Remova o item para continuar.'
  })
}

function ItemRow({ item }: { item: CartItem }) {
  const update = useUpdateCartItem()
  const remove = useRemoveCartItem()
  const soldOut = item.available === 0
  const max = Math.max(1, Math.min(item.available, item.maxPerOrder))
  const notices = noticeText(item)
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-card p-3" data-testid="cart-item" data-nft-id={item.nftId}>
      <div className="grid grid-cols-[56px_1fr_auto] items-center gap-3 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_40px]">
        <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
          <div className="w-14 shrink-0 overflow-hidden rounded-md">
            <NftImage image={item.image} alt="" sizes="56px" />
          </div>
          <div className="min-w-0">
            <Link to="/nft/$id" params={{ id: item.nftId }} className="block truncate text-sm font-medium hover:text-highlight">
              {item.name}
            </Link>
            <p className="text-xs text-muted-foreground">
              ID do token: {item.tokenId} · Edição {item.editionLabel}
            </p>
            <p className="text-xs text-muted-foreground md:hidden">{formatEth(item.unitPriceEth)} cada</p>
          </div>
        </div>
        <p className="hidden text-sm tabular-nums md:block">{formatEth(item.unitPriceEth)}</p>
        <div className="col-start-3 row-start-1 md:col-start-auto md:row-start-auto">
          <QuantityStepper
            value={item.quantity}
            max={max}
            onChange={(q) => update.mutate({ id: item.id, quantity: q })}
            label={`quantidade de ${item.name}`}
            disabled={soldOut}
            size="sm"
          />
        </div>
        <p className="col-span-2 text-sm font-semibold tabular-nums text-highlight md:col-span-1" data-testid="cart-line-total">
          {formatEth(item.lineTotalEth)}
        </p>
        <button
          type="button"
          onClick={() => remove.mutate({ id: item.id, name: item.name })}
          disabled={remove.isPending}
          className="inline-flex size-9 items-center justify-center justify-self-end rounded-full text-muted-foreground hover:bg-accent hover:text-destructive"
          aria-label={`Remover ${item.name} do carrinho`}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
      {notices.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-highlight/40 bg-highlight/10 px-3 py-2 text-xs" data-testid="cart-notice">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden />
          <span>{notices.join(' ')}</span>
        </div>
      )}
    </li>
  )
}

function CouponForm({ cart }: { cart: Cart }) {
  const apply = useApplyCoupon()
  const remove = useRemoveCoupon()
  const [code, setCode] = useState('')
  const error = apply.error && isApiError(apply.error) ? (apply.error.fieldErrors.code ?? apply.error.message) : null

  if (cart.coupon) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
        <span>
          Cupom <strong className="text-highlight">{cart.coupon.code}</strong> aplicado ({cart.coupon.percentOff}%)
        </span>
        <Button variant="link" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
          Remover
        </Button>
      </div>
    )
  }
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (code.trim()) apply.mutate(code.trim(), { onSuccess: () => setCode('') })
      }}
    >
      <label htmlFor="coupon" className="text-sm">
        Código promocional
      </label>
      <div className="flex">
        <input
          id="coupon"
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            if (apply.isError) apply.reset()
          }}
          placeholder="Digite o código promocional"
          aria-invalid={!!error}
          aria-describedby={error ? 'coupon-error' : undefined}
          className="h-10 min-w-0 flex-1 rounded-l-md border border-input bg-background/60 px-3 text-sm uppercase placeholder:normal-case"
        />
        <Button type="submit" className="h-10 rounded-l-none" disabled={apply.isPending || !code.trim()}>
          Aplicar
        </Button>
      </div>
      {error && (
        <p id="coupon-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

function Suggestions() {
  const q = useCatalog({ sort: 'popular', pageSize: 5, page: 1 })
  if (!q.data?.items.length) return null
  return (
    <section aria-labelledby="suggestions-title" className="mt-14">
      <h2 id="suggestions-title" className="mb-4 text-sm font-semibold text-highlight">
        Colecionadores também viram
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {q.data.items.map((n) => (
          <li key={n.id}>
            <NftCard nft={n} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function CartPage() {
  const cart = useCart()
  const ack = useAckCart()
  const navigate = useNavigate()
  const data = cart.data
  const hasSoldOut = data?.items.some((i) => i.available === 0) ?? false
  const hasNotices = data?.items.some((i) => i.notices.length > 0) ?? false

  return (
    <div className="container-page pb-6 pt-1 md:py-8">
      <MobileTopBar title="Carrinho de NFTs" />
      <nav aria-label="Trilha de navegação" className="mb-4 hidden text-xs text-muted-foreground md:block">
        <Link to="/" className="hover:text-highlight">
          Início
        </Link>{' '}
        / Carrinho
      </nav>
      <h1 className="mb-6 hidden text-xl font-bold md:block">Carrinho de NFTs</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <section aria-label="Itens do carrinho" className="min-w-0">
          <div className="mb-2 hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_40px] gap-3 px-3 text-sm font-semibold md:grid" aria-hidden>
            <span>NFTs</span>
            <span>Preço</span>
            <span>Edições</span>
            <span>Total</span>
            <span />
          </div>
          {cart.isPending ? (
            <ul className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando carrinho">
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl bg-card p-3">
                  <Skeleton className="size-14 rounded-md" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-6 w-20" />
                </li>
              ))}
            </ul>
          ) : cart.isError && !data ? (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center">
              <AlertCircle className="size-6 text-destructive" aria-hidden />
              <p>Não foi possível carregar o carrinho.</p>
              <Button onClick={() => cart.refetch()}>Tentar novamente</Button>
            </div>
          ) : data && data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-10 text-center">
              <p className="font-medium">Seu carrinho está vazio.</p>
              <Button asChild>
                <Link to="/" hash="catalogo">
                  Explorar NFTs
                </Link>
              </Button>
            </div>
          ) : data ? (
            <>
              {hasNotices && (
                <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-4 py-2 text-sm">
                  <span>Alguns itens mudaram desde que foram adicionados. O resumo já reflete os novos valores.</span>
                  <Button size="sm" variant="outline" onClick={() => ack.mutate()} disabled={ack.isPending}>
                    Entendi
                  </Button>
                </div>
              )}
              <ul className="flex flex-col gap-3">
                {data.items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <aside aria-labelledby="summary-title" className="flex h-fit flex-col gap-4 rounded-xl bg-card p-5 lg:sticky lg:top-24">
          <h2 id="summary-title" className="flex items-center justify-between text-base font-semibold">
            Resumo da carteira
            {data && cart.isFetching && (
              <span role="status" className="flex items-center gap-1 text-xs font-normal text-muted-foreground" data-testid="cart-refreshing">
                <Loader2 className="size-3 animate-spin" aria-hidden /> Atualizando
              </span>
            )}
          </h2>
          {data ? <CouponForm cart={data} /> : <Skeleton className="h-10 w-full" />}
          {data ? <PriceSummary summary={data.summary} coupon={data.coupon} /> : <PriceSummarySkeleton />}
          <p className="sr-only" aria-live="polite">
            {data ? `Total atualizado: ${formatEth(data.summary.totalEth)}` : ''}
          </p>
          <Button
            size="lg"
            disabled={!data?.items.length || hasSoldOut || cart.isFetching}
            onClick={() => navigate({ to: '/checkout' })}
          >
            Conectar e finalizar
          </Button>
          {hasSoldOut && <p className="text-xs text-destructive">Remova os itens esgotados para continuar.</p>}
          <Link to="/" hash="catalogo" className="text-center text-sm text-highlight hover:underline">
            Continuar explorando
          </Link>
        </aside>
      </div>
      <Suggestions />
    </div>
  )
}
