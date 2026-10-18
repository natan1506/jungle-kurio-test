import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, Expand, Link2, ShoppingCart, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { isApiError } from '@/api/http'
import type { Nft } from '@/api/types'
import { NETWORKS } from '@/api/types'
import { MobileTopBar } from '@/components/layout/mobile-top-bar'
import { NftImage } from '@/components/nft-image'
import { QuantityStepper } from '@/components/quantity-stepper'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAddToCart, useCart } from '@/features/cart/hooks'
import { useCatalog, useNft } from '@/features/catalog/hooks'
import { FavoriteButton, NftCard, NftCardSkeleton } from '@/features/catalog/nft-card'
import { formatEth } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useNftLiveNotice } from '@/realtime/hooks'

const route = getRouteApi('/nft/$id')

const VIEWS = [
  { label: 'Vista completa', className: '' },
  { label: 'Detalhe do rosto', className: 'scale-150 origin-[50%_35%]' },
  { label: 'Detalhe do acessório', className: 'scale-[1.8] origin-[50%_85%]' },
  { label: 'Detalhe lateral', className: 'scale-150 origin-[20%_40%]' },
]

function Gallery({ nft }: { nft: Nft }) {
  const [view, setView] = useState(0)
  const [zoom, setZoom] = useState(false)
  return (
    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[80px_1fr]">
      <ul className="hidden flex-col gap-3 md:flex" aria-label="Galeria">
        {VIEWS.map((v, i) => (
          <li key={v.label}>
            <button
              type="button"
              onClick={() => setView(i)}
              aria-label={v.label}
              aria-pressed={view === i}
              className={cn('block overflow-hidden rounded-lg border-2', view === i ? 'border-highlight' : 'border-transparent')}
            >
              <div className="overflow-hidden">
                <NftImage image={nft.image} alt="" sizes="80px" className={v.className} />
              </div>
            </button>
          </li>
        ))}
      </ul>
      <div className="relative overflow-hidden rounded-2xl bg-card">
        <NftImage
          image={nft.image}
          alt={`${nft.name} — ${VIEWS[view].label.toLowerCase()}`}
          sizes="(min-width: 1024px) 420px, 80vw"
          priority
          className={cn('transition-transform', VIEWS[view].className)}
        />
        <Dialog open={zoom} onOpenChange={setZoom}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full bg-background/80"
              aria-label="Ampliar imagem"
            >
              <Expand className="size-4" aria-hidden />
            </button>
          </DialogTrigger>
        <DialogContent className="max-w-2xl border-border bg-card p-3">
          <DialogTitle className="sr-only">{nft.name}</DialogTitle>
          <DialogDescription className="sr-only">Imagem ampliada do NFT</DialogDescription>
          <NftImage image={nft.image} alt={`${nft.name} ampliado`} sizes="672px" className="rounded-lg" />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

function Purchase({ nft }: { nft: Nft }) {
  const navigate = useNavigate()
  const cart = useCart()
  const add = useAddToCart()
  const defaultEdition = nft.editions.find((e) => e.id === 'e50' && e.available > 0) ?? nft.editions.find((e) => e.available > 0)
  const [editionId, setEditionId] = useState(defaultEdition?.id ?? nft.editions[0].id)
  const [requested, setQuantity] = useState(1)
  const edition = nft.editions.find((e) => e.id === editionId)!
  const inCart = cart.data?.items.find((i) => i.nftId === nft.id && i.editionId === editionId)?.quantity ?? 0
  const limit = Math.max(0, Math.min(edition.available, edition.maxPerOrder) - inCart)
  const unavailable = edition.available === 0

  // Quantidade efetiva sempre dentro do limite (inclusive após mudanças em tempo real).
  const quantity = limit > 0 ? Math.min(requested, limit) : 1

  const submit = async (goToCart: boolean) => {
    try {
      await add.mutateAsync({ nftId: nft.id, editionId, quantity, name: nft.name })
      setQuantity(1)
      if (goToCart) void navigate({ to: '/carrinho' })
    } catch {
      /* feedback no hook */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Edição:</legend>
        <div role="radiogroup" aria-label="Edição" className="flex flex-wrap gap-2">
          {nft.editions.map((e) => {
            const selected = e.id === editionId
            const soldOut = e.available === 0
            return (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={soldOut || undefined}
                onClick={() => {
                  if (soldOut) {
                    toast.info(`Edição ${e.label} esgotada.`)
                    return
                  }
                  setEditionId(e.id)
                  setQuantity(1)
                }}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm tabular-nums transition-colors',
                  selected ? 'border-highlight text-highlight' : 'border-transparent hover:border-border',
                  soldOut && 'cursor-not-allowed text-muted-foreground line-through',
                )}
              >
                {e.label}
                {soldOut && <span className="sr-only"> (esgotada)</span>}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          {unavailable
            ? 'Edição indisponível.'
            : `${edition.available} disponíveis · máximo de ${edition.maxPerOrder} por pedido${inCart ? ` · ${inCart} no carrinho` : ''}`}
        </p>
      </fieldset>

      <dl className="grid gap-1 text-sm text-muted-foreground">
        <div className="flex gap-2">
          <dt>ID do token:</dt>
          <dd className="text-foreground">{nft.tokenId}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Coleção:</dt>
          <dd className="text-foreground">{nft.collection}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Atributos:</dt>
          <dd className="text-foreground">{nft.attributes.join(', ')}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Rede:</dt>
          <dd className="text-foreground">{NETWORKS.find((n) => n.key === nft.network)?.label}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Qtd.</span>
        <QuantityStepper value={quantity} max={Math.max(1, limit)} onChange={setQuantity} label="Quantidade" disabled={unavailable || limit === 0} />
        <span className="ml-auto text-lg font-semibold text-highlight tabular-nums" data-testid="detail-total">
          {formatEth(edition.priceEth)}
        </span>
      </div>
      {limit === 0 && !unavailable && (
        <p className="text-xs text-highlight" role="status">
          Você já atingiu o limite desta edição no carrinho.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button size="lg" className="min-w-40 flex-1 uppercase md:flex-none" disabled={unavailable || limit === 0 || add.isPending} onClick={() => submit(true)}>
          Comprar
        </Button>
        <Button size="lg" variant="outline" disabled={unavailable || limit === 0 || add.isPending} onClick={() => submit(false)} aria-label="Adicionar ao carrinho">
          <ShoppingCart aria-hidden />
          <span className="hidden sm:inline">Adicionar</span>
        </Button>
        <FavoriteButton nftId={nft.id} name={nft.name} className="hidden size-10 md:inline-flex" />
      </div>
    </div>
  )
}

function Related({ nft }: { nft: Nft }) {
  const params = useMemo(() => ({ categories: [nft.category], pageSize: 6, page: 1, sort: 'popular' as const }), [nft.category])
  const related = useCatalog(params)
  const items = (related.data?.items ?? []).filter((n) => n.id !== nft.id).slice(0, 5)
  return (
    <section aria-labelledby="related-title" className="mt-12">
      <h2 id="related-title" className="mb-4 border-b border-border pb-2 text-sm font-semibold text-highlight">
        Mais desta coleção
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {related.isPending
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i}>
                <NftCardSkeleton />
              </li>
            ))
          : items.map((n) => (
              <li key={n.id}>
                <NftCard nft={n} />
              </li>
            ))}
      </ul>
    </section>
  )
}

function DetailSkeleton() {
  return (
    <div className="container-page py-8" aria-busy="true" aria-label="Carregando NFT">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[80px_1fr]">
          <div className="hidden flex-col gap-3 md:flex">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="aspect-square w-full rounded-2xl" />
        </div>
        <div className="flex flex-col gap-4" data-testid="detail-skeleton">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-11 w-48" />
        </div>
      </div>
    </div>
  )
}

export function NftDetailPage() {
  const { id } = route.useParams()
  const query = useNft(id)
  useNftLiveNotice(id, query.data?.name)

  if (query.isPending) return <DetailSkeleton />
  if (query.isError) {
    const notFound = isApiError(query.error) && query.error.status === 404
    return (
      <div className="container-page py-16">
        <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl bg-card p-10 text-center">
          <AlertCircle className="size-8 text-destructive" aria-hidden />
          <h1 className="text-lg font-semibold">{notFound ? 'NFT não encontrado' : 'Não foi possível carregar o NFT'}</h1>
          <p className="text-sm text-muted-foreground">
            {notFound ? 'O item pode ter sido removido ou o link está incorreto.' : query.error.message}
          </p>
          <div className="flex gap-2">
            {!notFound && <Button onClick={() => query.refetch()}>Tentar novamente</Button>}
            <Button asChild variant="outline">
              <Link to="/">Voltar ao catálogo</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const nft = query.data
  return (
    <div className="container-page pb-6 pt-1 md:py-8">
      <MobileTopBar right={<FavoriteButton nftId={nft.id} name={nft.name} />} />
      <nav aria-label="Trilha de navegação" className="mb-4 hidden text-xs text-muted-foreground md:block">
        <ol className="flex gap-1">
          <li>
            <Link to="/" className="hover:text-highlight">
              Início
            </Link>{' '}
            /
          </li>
          <li>
            <Link to="/" hash="catalogo" className="hover:text-highlight">
              Mercado
            </Link>{' '}
            /
          </li>
          <li aria-current="page" className="truncate text-foreground">
            {nft.name}
          </li>
        </ol>
      </nav>
      <div className="grid gap-8 md:grid-cols-2">
        <Gallery nft={nft} />
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 className="text-2xl font-bold">{nft.name}</h1>
            <p className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
              <Star className="size-3.5 fill-highlight text-highlight" aria-hidden />
              <span>
                {nft.rating.toFixed(1)} <span className="text-muted-foreground">({nft.reviewsCount} avaliações)</span>
              </span>
            </p>
          </div>
          <p className="text-xl font-semibold text-highlight" aria-live="polite" data-testid="detail-price">
            {formatEth(nft.priceEth)}
            {nft.previousPriceEth && (
              <span className="ml-2 text-sm text-muted-foreground line-through">
                <span className="sr-only">Preço anterior: </span>
                {formatEth(nft.previousPriceEth)}
              </span>
            )}
          </p>
          <div>
            <h2 className="text-sm font-semibold">Sobre este NFT:</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{nft.description}</p>
          </div>
          <Purchase key={nft.id} nft={nft} />
          <div className="flex items-center gap-2 text-sm">
            <span>Compartilhar este NFT:</span>
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-full hover:bg-accent"
              aria-label="Copiar link do NFT"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.href)
                  toast.success('Link copiado.')
                } catch {
                  toast.error('Não foi possível copiar o link.')
                }
              }}
            >
              <Link2 className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="details" className="mt-10">
        <TabsList className="h-auto gap-4 rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger value="details" className="rounded-none border-0 border-b-2 border-transparent px-0 pb-2 data-[state=active]:border-highlight data-[state=active]:bg-transparent data-[state=active]:text-highlight">
            Detalhes do NFT
          </TabsTrigger>
          <TabsTrigger value="reviews" className="rounded-none border-0 border-b-2 border-transparent px-0 pb-2 data-[state=active]:border-highlight data-[state=active]:bg-transparent data-[state=active]:text-highlight">
            Avaliações de colecionadores ({nft.reviewsCount})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="mt-4 flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
          {nft.longDescription.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <dl className="grid gap-3">
            <div>
              <dt className="font-semibold text-foreground">Criador:</dt>
              <dd>{nft.creator}</dd>
            </div>
            <div>
              <dt className="font-semibold text-foreground">Contrato:</dt>
              <dd>{nft.contract}</dd>
            </div>
            <div>
              <dt className="font-semibold text-foreground">Direitos autorais:</dt>
              <dd>{nft.royalties}</dd>
            </div>
          </dl>
        </TabsContent>
        <TabsContent value="reviews" className="mt-4 text-sm text-muted-foreground">
          Nota média {nft.rating.toFixed(1)} de 5 com base em {nft.reviewsCount} avaliações. A leitura das avaliações individuais estará
          disponível em breve.
        </TabsContent>
      </Tabs>

      <Related nft={nft} />
    </div>
  )
}
