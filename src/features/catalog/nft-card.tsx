import { Link, useNavigate } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import type { NftSummary } from '@/api/types'
import { NftImage } from '@/components/nft-image'
import { Skeleton } from '@/components/ui/skeleton'
import { formatEth } from '@/lib/money'
import { useSession } from '@/lib/session-store'
import { cn } from '@/lib/utils'
import { useFavorites, useToggleFavorite } from './hooks'

export function FavoriteButton({ nftId, name, className }: { nftId: string; name: string; className?: string }) {
  const session = useSession()
  const favorites = useFavorites()
  const toggle = useToggleFavorite()
  const navigate = useNavigate()
  const active = favorites.data?.has(nftId) ?? false
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Remover ${name} dos favoritos` : `Favoritar ${name}`}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-full border border-border bg-background/80 backdrop-blur transition-colors hover:border-highlight',
        active && 'border-highlight text-highlight',
        className,
      )}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!session) {
          void navigate({ to: '/entrar', search: { redirect: location.pathname + location.search } })
          return
        }
        toggle.mutate({ id: nftId, favorite: !active, name })
      }}
    >
      <Heart className={cn('size-4', active && 'fill-current')} aria-hidden />
    </button>
  )
}

export function NftCard({ nft, priority }: { nft: NftSummary; priority?: boolean }) {
  const soldOut = nft.available === 0
  return (
    <article className="group relative flex flex-col gap-3 rounded-xl bg-card p-3 transition-colors hover:bg-surface-2">
      <div className="relative overflow-hidden rounded-lg">
        <NftImage image={nft.image} alt={`Arte do NFT ${nft.name}`} sizes="(min-width: 1024px) 280px, (min-width: 640px) 45vw, 45vw" priority={priority} />
        {nft.badge === 'drop' && (
          <span className="absolute left-2 top-2 rounded bg-highlight px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
            Raro
          </span>
        )}
        {soldOut && (
          <span className="absolute left-2 top-2 rounded bg-background/90 px-2 py-0.5 text-[10px] font-bold uppercase">Esgotado</span>
        )}
        <FavoriteButton nftId={nft.id} name={nft.name} className="absolute right-2 top-2 z-10" />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="truncate text-sm font-medium">
          <Link to="/nft/$id" params={{ id: nft.id }} className="after:absolute after:inset-0 focus-visible:outline-none group-has-[:focus-visible]:underline">
            {nft.name}
          </Link>
        </h3>
        <p className="flex items-baseline gap-2 text-sm">
          <span className="font-semibold text-highlight" data-testid="nft-price">
            {formatEth(nft.priceEth)}
          </span>
          {nft.previousPriceEth && (
            <span className="text-xs text-muted-foreground line-through">
              <span className="sr-only">Preço anterior: </span>
              {formatEth(nft.previousPriceEth)}
            </span>
          )}
        </p>
      </div>
    </article>
  )
}

export function NftCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-3" data-testid="nft-card-skeleton">
      <Skeleton className="aspect-square w-full rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  )
}
