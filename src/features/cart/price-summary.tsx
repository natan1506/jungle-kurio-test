import type { Coupon, PriceSummary as Summary } from '@/api/types'
import { Skeleton } from '@/components/ui/skeleton'
import { formatEth } from '@/lib/money'
import { cn } from '@/lib/utils'

export function PriceSummary({ summary, coupon, className, feeHint = 'Taxa estimada' }: { summary: Summary; coupon: Coupon | null; className?: string; feeHint?: string }) {
  return (
    <dl className={cn('flex flex-col gap-2 text-sm', className)} data-testid="price-summary">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd className="tabular-nums" data-testid="summary-subtotal">
          {formatEth(summary.subtotalEth)}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt>{coupon ? `Desconto (${coupon.code} · ${coupon.percentOff}%)` : 'Desconto do lançamento'}</dt>
        <dd className="tabular-nums" data-testid="summary-discount">
          (-) {formatEth(summary.discountEth)}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt>Taxa de rede</dt>
        <dd className="text-right tabular-nums" data-testid="summary-fee">
          {formatEth(summary.networkFeeEth)}
          <span className="block text-[10px] text-highlight">{feeHint}</span>
        </dd>
      </div>
      <div className="mt-1 flex justify-between border-t border-border pt-3 text-base font-semibold">
        <dt>Total</dt>
        <dd className="tabular-nums text-highlight" data-testid="summary-total">
          {formatEth(summary.totalEth)}
        </dd>
      </div>
    </dl>
  )
}

export function PriceSummarySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando resumo" data-testid="summary-skeleton">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}
