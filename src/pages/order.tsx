import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { AlertCircle, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { useEffect } from 'react'
import { api, qk } from '@/api/endpoints'
import { isApiError } from '@/api/http'
import { NETWORKS, type Order } from '@/api/types'
import { NftImage } from '@/components/nft-image'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatEth } from '@/lib/money'
import { useSession } from '@/lib/session-store'
import { useRealtime } from '@/realtime/hooks'

const route = getRouteApi('/pedidos/$orderId')

function Receipt({ order }: { order: Order }) {
  const network = NETWORKS.find((n) => n.key === order.network)?.label
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(order.createdAt))
  return (
    <article aria-labelledby="receipt-title" className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border-b-4 border-highlight bg-card" data-testid="receipt">
      <header className="flex flex-col items-center gap-3 px-6 pt-8 text-center">
        <span aria-hidden className="inline-flex size-14 items-center justify-center rounded-xl btn-gradient text-xs font-bold text-primary-foreground">
          NFT
        </span>
        <h1 id="receipt-title" className="text-lg font-semibold">
          Seus NFTs agora estão na sua carteira
        </h1>
      </header>
      <dl className="mx-6 mt-6 grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-4 text-xs sm:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-muted-foreground">ID da transação</dt>
          <dd className="truncate font-medium" title={order.txHash ?? ''} data-testid="tx-hash">
            {order.txHash ? `${order.txHash.slice(0, 8)}…${order.txHash.slice(-4)}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Data</dt>
          <dd className="font-medium">{date}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total</dt>
          <dd className="font-medium tabular-nums">{formatEth(order.summary.totalEth)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Carteira</dt>
          <dd className="truncate font-medium">{order.walletLabel}</dd>
        </div>
      </dl>
      <section aria-labelledby="tx-details" className="px-6 py-6">
        <h2 id="tx-details" className="mb-3 text-sm font-semibold">
          Detalhes da transação
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="pb-2 font-normal">
                NFTs
              </th>
              <th scope="col" className="pb-2 text-center font-normal">
                Edições
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.cartItemId} className="border-t border-border">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 shrink-0 overflow-hidden rounded-md">
                      <NftImage image={l.image} alt="" sizes="40px" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ID do token: {l.tokenId} · {l.editionLabel}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-2 text-center tabular-nums">(x {l.quantity})</td>
                <td className="py-2 text-right font-semibold tabular-nums text-highlight">{formatEth(l.lineTotalEth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-sm">
          {order.coupon && (
            <div className="flex justify-end gap-6">
              <dt>Desconto ({order.coupon.code})</dt>
              <dd className="tabular-nums">(-) {formatEth(order.summary.discountEth)}</dd>
            </div>
          )}
          <div className="flex justify-end gap-6">
            <dt>Taxa de rede</dt>
            <dd className="tabular-nums">{formatEth(order.summary.networkFeeEth)}</dd>
          </div>
          <div className="flex justify-end gap-6 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums text-highlight" data-testid="receipt-total">
              {formatEth(order.summary.totalEth)}
            </dd>
          </div>
        </dl>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Transação confirmada na {network}. A propriedade foi transferida para sua carteira conectada e registrada na rede (simulação).
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {order.explorerUrl && (
            <Button asChild>
              <a href={order.explorerUrl} target="_blank" rel="noreferrer noopener">
                Ver no Etherscan <ExternalLink aria-hidden />
                <span className="sr-only">(abre em nova aba; referência simulada)</span>
              </a>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/" hash="catalogo">
              Continuar explorando
            </Link>
          </Button>
        </div>
      </section>
    </article>
  )
}

export function OrderPage() {
  const { orderId } = route.useParams()
  const session = useSession()!
  const realtime = useRealtime()
  const query = useQuery({
    queryKey: qk.order(session.user.id, orderId),
    queryFn: ({ signal }) => api.orders.get(orderId, { signal }),
    // Fallback caso o socket esteja indisponível: pedidos pendentes são consultados periodicamente.
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 5000 : false),
  })

  useEffect(() => {
    if (query.data) realtime?.observeVersion('order', query.data.id, query.data.version)
  }, [query.data, realtime])

  if (query.isPending) {
    return (
      <div className="container-page py-10" aria-busy="true" aria-label="Carregando pedido">
        <Skeleton className="mx-auto h-96 max-w-xl rounded-2xl" />
      </div>
    )
  }
  if (query.isError) {
    const status = isApiError(query.error) ? query.error.status : 0
    return (
      <div className="container-page py-16">
        <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl bg-card p-10 text-center">
          <AlertCircle className="size-8 text-destructive" aria-hidden />
          <h1 className="text-lg font-semibold">{status === 404 ? 'Pedido não encontrado' : status === 403 ? 'Acesso negado' : 'Falha ao carregar o pedido'}</h1>
          <p className="text-sm text-muted-foreground">{query.error.message}</p>
          {status !== 404 && status !== 403 && <Button onClick={() => query.refetch()}>Tentar novamente</Button>}
        </div>
      </div>
    )
  }

  const order = query.data
  return (
    <div className="container-page py-8 md:py-12">
      <p className="sr-only" aria-live="assertive">
        {order.status === 'confirmed' ? 'Pedido confirmado.' : order.status === 'declined' ? 'Pagamento recusado.' : 'Pedido aguardando confirmação.'}
      </p>
      {order.status === 'confirmed' ? (
        <Receipt order={order} />
      ) : order.status === 'pending' ? (
        <div role="status" className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-card p-10 text-center" data-testid="order-pending">
          <Loader2 className="size-10 animate-spin text-highlight" aria-hidden />
          <h1 className="text-lg font-semibold">Aguardando confirmação na rede</h1>
          <p className="text-sm text-muted-foreground">
            Pedido <span className="font-mono">{order.id}</span> enviado. Você pode recarregar a página com segurança: o estado será recuperado sem criar
            outra compra.
          </p>
          <p className="text-sm">Total: {formatEth(order.summary.totalEth)}</p>
        </div>
      ) : (
        <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-card p-10 text-center" data-testid="order-declined">
          <XCircle className="size-10 text-destructive" aria-hidden />
          <h1 className="text-lg font-semibold">Pagamento recusado</h1>
          <p className="text-sm text-muted-foreground">{order.declineReason ?? 'A transação não foi concluída.'} Seus itens continuam no carrinho.</p>
          <Button asChild>
            <Link to="/carrinho">Voltar ao carrinho</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
