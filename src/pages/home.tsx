import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { AlertCircle, ArrowRight, Loader2, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SORTS, TABS, type NftListResponse, type SortKey, type TabKey } from '@/api/types'
import { NftImage } from '@/components/nft-image'
import { ComingSoon } from '@/components/layout/coming-soon'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { CatalogFilters } from '@/features/catalog/filters'
import { useCatalog, useFeatured } from '@/features/catalog/hooks'
import { NftCard, NftCardSkeleton } from '@/features/catalog/nft-card'
import { catalogSearchSchema, toListParams, type CatalogSearch } from '@/features/catalog/search'
import { formatEth } from '@/lib/money'
import { useSession } from '@/lib/session-store'
import { cn } from '@/lib/utils'

function Hero() {
  const featured = useFeatured()
  const [index, setIndex] = useState(0)
  const slides = featured.data?.hero ?? []
  const current = slides[index]
  const next = slides[(index + 1) % Math.max(1, slides.length)]
  return (
    <section aria-labelledby="hero-title" className="container-page pt-2 pb-6 md:py-14">
      <div className="relative grid grid-cols-[1fr_42%] items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#4a3326] via-[#33251d] to-card p-4 md:grid-cols-[1.1fr_1fr] md:gap-8 md:rounded-none md:bg-none md:p-0">
        <div className="flex flex-col gap-2 md:gap-5">
          <p className="text-[11px] text-muted-foreground md:text-sm">Bem-vindo à Kurio</p>
          <h1 id="hero-title" className="text-lg font-bold uppercase leading-tight tracking-tight md:text-5xl md:leading-[1.15]">
            <span className="md:hidden">Seja dono da cultura digital</span>
            <span className="hidden md:inline">Seja dono do futuro da arte digital</span>
          </h1>
          <p className="line-clamp-3 max-w-lg text-[11px] leading-relaxed text-muted-foreground md:line-clamp-none md:text-sm">
            Descubra NFTs selecionados de criadores emergentes e consagrados. Colecione arte digital rara, apoie artistas e tenha uma parte
            da cultura da internet.
          </p>
          <div>
            <a href="#catalogo" className="inline-flex items-center gap-1 text-xs font-semibold uppercase text-highlight md:hidden">
              Explorar <ArrowRight className="size-3.5" aria-hidden />
            </a>
            <Button asChild size="lg" className="hidden uppercase md:inline-flex">
              <a href="#catalogo">Explorar</a>
            </Button>
          </div>
        </div>
        <div className="relative flex flex-col items-center gap-4">
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-card md:rounded-2xl">
            {current ? (
              <Link to="/nft/$id" params={{ id: current.id }} aria-label={`Ver ${current.name}`}>
                <NftImage image={current.image} alt={`Destaque: ${current.name}`} sizes="(min-width: 768px) 448px, 40vw" priority />
              </Link>
            ) : (
              <Skeleton className="aspect-square w-full" />
            )}
          </div>
          {next && next.id !== current?.id && (
            <div aria-hidden className="absolute -bottom-1 -left-3 w-[42%] overflow-hidden rounded-lg border-2 border-card shadow-lg md:hidden">
              <NftImage image={next.image} alt="" sizes="20vw" />
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-2 md:mt-4 md:grid md:grid-cols-[1.1fr_1fr] md:gap-8">
        <span className="hidden md:block" />
        <div role="tablist" aria-label="Destaques" className="flex justify-center gap-2">
          {(slides.length ? slides : [0, 1, 2]).map((s, i) => (
            <button
              key={typeof s === "number" ? s : s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={typeof s === "number" ? `Destaque ${i + 1}` : s.name}
              onClick={() => setIndex(i)}
              className={cn("size-2.5 rounded-full transition-colors", i === index ? "bg-highlight" : "bg-border")}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function Spotlight() {
  const featured = useFeatured()
  const nft = featured.data?.spotlight
  return (
    <section aria-labelledby="spotlight-title" className="rounded-xl bg-card p-4">
      <h2 id="spotlight-title" className="text-sm font-semibold uppercase text-highlight">
        NFT em destaque
      </h2>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide">Oferta limitada</p>
      {nft ? (
        <Link to="/nft/$id" params={{ id: nft.id }} className="block overflow-hidden rounded-lg">
          <NftImage image={nft.image} alt={`Oferta limitada: ${nft.name}`} sizes="240px" />
          <span className="sr-only">
            {nft.name}, {formatEth(nft.priceEth)}
          </span>
        </Link>
      ) : (
        <Skeleton className="aspect-square w-full rounded-lg" />
      )}
    </section>
  )
}

function SearchBox({ id, value, onSearch }: { id: string; value: string | undefined; onSearch: (q: string | undefined) => void }) {
  const [term, setTerm] = useState(value ?? '')
  const first = useRef(true)
  useEffect(() => setTerm(value ?? ''), [value])
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => {
      if ((term.trim() || undefined) !== value) onSearch(term.trim() || undefined)
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term])
  return (
    <form role="search" onSubmit={(e) => (e.preventDefault(), onSearch(term.trim() || undefined))} className="relative w-full md:max-w-xs">
      <label htmlFor={id} className="sr-only">
        Buscar no catálogo
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        id={id}
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Explorar coleções"
        className="h-10 w-full rounded-full border border-input bg-card pl-9 pr-4 text-sm"
      />
    </form>
  )
}

function Pagination({ data, onPage }: { data: NftListResponse; onPage: (p: number) => void }) {
  if (data.totalPages <= 1) return null
  const pages = Array.from({ length: data.totalPages }, (_, i) => i + 1)
  return (
    <nav aria-label="Paginação do catálogo" className="mt-8 flex justify-end">
      <ul className="flex items-center gap-2">
        {pages.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => onPage(p)}
              aria-current={p === data.page ? 'page' : undefined}
              aria-label={`Página ${p}`}
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-md text-sm tabular-nums',
                p === data.page ? 'btn-gradient font-bold text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {p}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => onPage(data.page + 1)}
            disabled={data.page >= data.totalPages}
            aria-label="Próxima página"
            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent disabled:opacity-40"
          >
            ›
          </button>
        </li>
      </ul>
    </nav>
  )
}

function activeFilterCount(s: CatalogSearch) {
  return (s.categories?.length ?? 0) + (s.networks?.length ?? 0) + (s.priceMin || s.priceMax ? 1 : 0)
}

function useCatalogController() {
  // strict: false porque o catálogo também aparece atrás do login.
  const raw = useSearch({ strict: false })
  const search = useMemo(() => catalogSearchSchema.parse(raw), [raw])
  const navigate = useNavigate()
  const session = useSession()
  const params = toListParams(search)
  const query = useCatalog(params)
  const [sheetOpen, setSheetOpen] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  // Mudar filtro volta para a página 1.
  const update = (patch: Partial<CatalogSearch>, opts: { replace?: boolean } = {}) =>
    navigate({ to: '/', search: (prev: CatalogSearch) => ({ ...prev, ...patch, page: undefined }), replace: opts.replace, resetScroll: false })

  const goToPage = (page: number) => {
    void navigate({ to: '/', search: (prev: CatalogSearch) => ({ ...prev, page: page > 1 ? page : undefined }), resetScroll: false })
    gridRef.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  const data = query.data
  const filtersCount = activeFilterCount(search)
  const showSkeleton = query.isPending || (query.isFetching && query.isPlaceholderData)
  return { search, navigate, session, query, data, filtersCount, showSkeleton, sheetOpen, setSheetOpen, gridRef, update, goToPage }
}

type CatalogController = ReturnType<typeof useCatalogController>

function FilterSheet({ ctl }: { ctl: CatalogController }) {
  const { search, data, filtersCount, sheetOpen, setSheetOpen, update } = ctl
  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger asChild>
        <Button className="size-10 shrink-0 rounded-xl p-0 md:hidden" aria-label={`Filtros${filtersCount ? `, ${filtersCount} ativos` : ""}`}>
          <SlidersHorizontal aria-hidden />
          {filtersCount > 0 && <span className="sr-only">{filtersCount}</span>}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto bg-background">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>Combine coleções, preço e rede.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <CatalogFilters search={search} facets={data?.facets} priceRange={data?.priceRange} onChange={update} idPrefix="mob" />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MobileSearchBar({ ctl }: { ctl: CatalogController }) {
  return (
    <div className="container-page sticky top-0 z-30 flex items-center gap-2 bg-background/95 py-3 backdrop-blur md:hidden">
      <SearchBox id="catalog-search-mobile" value={ctl.search.q} onSearch={(q) => ctl.update({ q })} />
      <FilterSheet ctl={ctl} />
    </div>
  )
}

function Catalog({ ctl }: { ctl: CatalogController }) {
  const { search, navigate, session, query, data, showSkeleton, gridRef, update, goToPage } = ctl
  return (
    <section id="catalogo" aria-labelledby="catalog-title" className="container-page scroll-mt-20">
      <h2 id="catalog-title" className="sr-only">
        Catálogo de NFTs
      </h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
        <aside className="hidden flex-col gap-6 md:flex" aria-label="Filtros">
          <CatalogFilters search={search} facets={data?.facets} priceRange={data?.priceRange} onChange={update} idPrefix="desk" />
          <Spotlight />
        </aside>

        <div ref={gridRef} className="flex min-w-0 scroll-mt-24 flex-col gap-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div role="tablist" aria-label="Seções do catálogo" className="flex gap-5 overflow-x-auto">
              {TABS.map((t) => {
                const selected = (search.tab ?? 'all') === t.key
                return (
                  <button
                    key={t.key}
                    role="tab"
                    type="button"
                    aria-selected={selected}
                    onClick={() => update({ tab: t.key === 'all' ? undefined : (t.key as TabKey) })}
                    className={cn(
                      'whitespace-nowrap border-b-2 pb-1 text-sm transition-colors',
                      selected ? 'border-highlight text-highlight' : 'border-transparent hover:text-highlight',
                    )}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
              <span id="sort-label" className="whitespace-nowrap text-muted-foreground">
                Ordenar por:
              </span>
              <Select value={search.sort ?? 'recent'} onValueChange={(v) => update({ sort: v === 'recent' ? undefined : (v as SortKey) })}>
                <SelectTrigger aria-labelledby="sort-label" className="h-9 w-auto max-w-full border-none bg-transparent px-1 shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="end">
                  {SORTS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <SearchBox id="catalog-search" value={search.q} onSearch={(q) => update({ q })} />
          </div>

          {search.favorites && (
            <div className="flex items-center justify-between rounded-lg bg-card px-4 py-2 text-sm">
              <span>Mostrando apenas seus favoritos</span>
              <Button variant="link" size="sm" onClick={() => update({ favorites: undefined })}>
                Ver todos
              </Button>
            </div>
          )}

          <p className="sr-only" aria-live="polite">
            {data && !query.isFetching ? `${data.total} NFTs encontrados. Página ${data.page} de ${data.totalPages}.` : ''}
          </p>
          {data && query.isFetching && !showSkeleton && (
            <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="catalog-refreshing">
              <Loader2 className="size-3 animate-spin" aria-hidden /> Atualizando resultados…
            </p>
          )}

          {search.favorites && !session ? (
            <EmptyState title="Entre para ver seus favoritos" action={<Link to="/entrar" search={{ redirect: '/?favorites=true' }} className="text-highlight underline">Entrar</Link>} />
          ) : query.isError && !data ? (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-xl bg-card p-10 text-center">
              <AlertCircle className="size-8 text-destructive" aria-hidden />
              <p className="font-medium">Não foi possível carregar o catálogo.</p>
              <p className="text-sm text-muted-foreground">{query.error.message}</p>
              <Button onClick={() => query.refetch()} disabled={query.isFetching}>
                Tentar novamente
              </Button>
            </div>
          ) : showSkeleton ? (
            <div className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-3" aria-busy="true" aria-label="Carregando catálogo">
              {Array.from({ length: 9 }, (_, i) => (
                <NftCardSkeleton key={i} />
              ))}
            </div>
          ) : data && data.items.length === 0 ? (
            <EmptyState
              title="Nenhum NFT encontrado"
              description="Ajuste a busca ou os filtros para ver mais resultados."
              action={
                <Button variant="outline" onClick={() => navigate({ to: '/', search: {} })}>
                  Limpar filtros
                </Button>
              }
            />
          ) : data ? (
            <>
              {query.isError && (
                <p role="alert" className="text-sm text-destructive">
                  Falha ao atualizar. Exibindo os últimos resultados.{' '}
                  <button className="underline" onClick={() => query.refetch()}>
                    Tentar novamente
                  </button>
                </p>
              )}
              <ul className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-3" data-testid="catalog-grid">
                {data.items.map((nft, i) => (
                  <li key={nft.id}>
                    <NftCard nft={nft} priority={i < 3} />
                  </li>
                ))}
              </ul>
              <Pagination data={data} onPage={goToPage} />
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-10 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  )
}

function Promos() {
  const featured = useFeatured()
  const hero = featured.data?.hero ?? []
  const promos = [
    {
      title: 'Lançamentos gênesis de edição limitada',
      text: 'Coleções exclusivas diretamente dos criadores antes da revelação pública.',
      search: { tab: 'new' as const },
      nft: hero[0],
    },
    {
      title: 'Arte digital selecionada e muito mais',
      text: 'Explore novos artistas, coleções verificadas e obras digitais em alta.',
      search: { categories: ['arte-digital' as const] },
      nft: hero[2] ?? hero[1],
    },
  ]
  return (
    <section aria-label="Coleções em destaque" className="container-page mt-16 grid gap-5 md:grid-cols-2">
      {promos.map((p) => (
        <article key={p.title} className="grid grid-cols-[45%_1fr] items-center gap-4 overflow-hidden rounded-xl bg-card">
          {p.nft ? <NftImage image={p.nft.image} alt="" sizes="240px" /> : <Skeleton className="aspect-square" />}
          <div className="flex flex-col gap-3 py-4 pr-4">
            <h2 className="text-sm font-semibold leading-snug">{p.title}</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">{p.text}</p>
            <Button asChild size="sm" className="self-start">
              <Link to="/" search={p.search} hash="catalogo">
                Explorar <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </article>
      ))}
    </section>
  )
}

const POSTS = [
  { title: 'Como funciona a propriedade de NFTs', text: 'Aprenda a colecionar, negociar e verificar ativos digitais.', image: 'ivory-baron' as const },
  { title: '10 artistas digitais para acompanhar', text: 'Conheça criadores que estão moldando a cultura digital.', image: 'emerald-ape' as const },
  { title: 'Raridade, atributos e procedência', text: 'Entenda procedência, atributos e escassez on-chain.', image: 'sage-nomad' as const },
  { title: 'Como proteger sua carteira', text: 'Boas práticas para manter seus ativos e sua identidade.', image: 'golden-beat' as const },
]

function Journal() {
  return (
    <section aria-labelledby="journal-title" className="container-page mt-16">
      <h2 id="journal-title" className="text-center text-xl font-bold">
        Diário da Cunhagem
      </h2>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Histórias, guias e insights para colecionadores sobre o universo da propriedade digital.
      </p>
      <ul className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {POSTS.map((p) => (
          <li key={p.title} className="flex flex-col gap-2 rounded-xl bg-card p-3">
            <NftImage image={p.image} alt="" sizes="(min-width: 1024px) 260px, 45vw" className="rounded-lg" />
            <p className="text-[11px] text-muted-foreground">12 de setembro · Leitura de 5 min</p>
            <h3 className="text-sm font-semibold">{p.title}</h3>
            <p className="text-xs text-muted-foreground">{p.text}</p>
            <ComingSoon label="Ler mais" className="text-xs" />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HomePage() {
  const ctl = useCatalogController()
  return (
    <>
      <MobileSearchBar ctl={ctl} />
      <Hero />
      <Catalog ctl={ctl} />
      <Promos />
      <Journal />
    </>
  )
}
