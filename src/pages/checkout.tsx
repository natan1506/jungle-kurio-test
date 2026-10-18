import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, CheckCircle2, Loader2, PlugZap, Unplug } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, qk } from '@/api/endpoints'
import { isApiError } from '@/api/http'
import {
  NETWORKS,
  WALLET_TYPES,
  type BuyerInfo,
  type NetworkKey,
  type Order,
  type Quote,
  type QuoteChange,
  type QuoteStaleDetails,
  type Wallet,
  type WalletType,
} from '@/api/types'
import { FormField } from '@/components/form-field'
import { MobileTopBar } from '@/components/layout/mobile-top-bar'
import { NftImage } from '@/components/nft-image'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useWallets } from '@/features/account/hooks'
import { useCart } from '@/features/cart/hooks'
import { PriceSummary, PriceSummarySkeleton } from '@/features/cart/price-summary'
import { attemptFor, clearAttempt, clearDraft, loadAttempt, loadDraft, saveDraft } from '@/features/checkout/attempt'
import { formatEth } from '@/lib/money'
import { useSession } from '@/lib/session-store'
import { cn } from '@/lib/utils'
import { realtimeBus } from '@/realtime/realtime'

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type Errors = Partial<Record<keyof BuyerInfo | 'walletId' | 'connection', string>>

function validate(form: BuyerInfo): Errors {
  const e: Errors = {}
  if (!form.displayName.trim()) e.displayName = 'Informe o nome de exibição.'
  if (!form.username.trim()) e.username = 'Informe o nome de usuário.'
  if (!form.profileName.trim()) e.profileName = 'Informe o nome do perfil.'
  if (!ETH_ADDRESS_RE.test(form.walletAddress)) e.walletAddress = 'Endereço inválido (0x + 40 caracteres hexadecimais).'
  if (form.secondaryAddress && !ETH_ADDRESS_RE.test(form.secondaryAddress) && !/\.eth$|\.kurio$/.test(form.secondaryAddress)) {
    e.secondaryAddress = 'Informe um endereço 0x ou um nome ENS.'
  }
  if (!EMAIL_RE.test(form.email)) e.email = 'Informe um e-mail válido.'
  if (!form.ensName.trim()) e.ensName = 'Informe o nome ENS.'
  else if (!/^[a-z0-9-]{2,32}$/i.test(form.ensName)) e.ensName = 'Use 2 a 32 letras, números ou hífen.'
  if (form.notes.length > 280) e.notes = 'Máximo de 280 caracteres.'
  return e
}

function fromWallet(wallet: Wallet | undefined, user: { displayName: string; username: string; email: string; ensName: string }): BuyerInfo {
  return {
    displayName: wallet?.displayName ?? user.displayName,
    username: user.username,
    network: wallet?.network ?? 'ethereum',
    profileName: wallet?.profileName ?? '',
    walletAddress: wallet?.address ?? '',
    secondaryAddress: '',
    walletType: wallet?.walletType ?? 'metamask',
    referralCode: wallet?.referralCode ?? '',
    email: wallet?.email ?? user.email,
    ensName: user.ensName,
    useAnotherWallet: false,
    notes: '',
  }
}

type Connection = { status: 'disconnected' | 'connecting' | 'connected' | 'rejected'; walletId?: string; message?: string }

export function CheckoutPage() {
  const session = useSession()!
  const userId = session.user.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const cart = useCart()
  const wallets = useWallets()
  const pending = useQuery({
    queryKey: qk.pendingOrders(userId),
    queryFn: ({ signal }) => api.orders.list('pending', { signal }),
  })

  const [walletIdState, setWalletId] = useState<string | null>(null)
  const [formState, setFormState] = useState<BuyerInfo | null>(() => loadDraft<BuyerInfo>(userId))
  const [errors, setErrors] = useState<Errors>({})
  const [connection, setConnection] = useState<Connection>({ status: 'disconnected' })
  const [quote, setQuote] = useState<Quote | null>(null)
  const [changes, setChanges] = useState<QuoteChange[]>([])
  const [liveStale, setLiveStale] = useState<string[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const [recoverable, setRecoverable] = useState<string | null>(null)
  const [resumable] = useState(() => loadAttempt(userId))
  const [formOpen, setFormOpen] = useState(false)

  // Padrões derivados: carteira principal selecionada e formulário pré-preenchido
  // por ela (ou o rascunho restaurado), sem sincronizar estado em efeitos.
  const primary = wallets.data?.find((w) => w.slot === 'primary') ?? wallets.data?.[0]
  const walletId = walletIdState ?? primary?.id ?? null
  const defaultForm = primary ? fromWallet(primary, session.user) : null
  const form = formState ?? defaultForm
  const setForm = (update: (f: BuyerInfo | null) => BuyerInfo | null) => setFormState((prev) => update(prev ?? defaultForm))

  // Rascunho preservado para retomada (ex.: sessão expirada no checkout).
  useEffect(() => {
    if (form) saveDraft(userId, form)
  }, [form, userId])

  // Alterações em tempo real durante a revisão invalidam a cotação.
  useEffect(
    () =>
      realtimeBus.on('nft.applied', (e) => {
        if (!quote?.lines.some((l) => l.nftId === e.resource.id)) return
        const line = quote.lines.find((l) => l.nftId === e.resource.id)!
        const edition = e.data.editions.find((x) => x.id === line.editionId)
        const msg =
          edition && edition.available < line.quantity
            ? `${line.name} (${line.editionLabel}) ficou sem disponibilidade suficiente.`
            : `O preço de ${line.name} mudou para ${formatEth(edition?.priceEth ?? e.data.priceEth)}.`
        setLiveStale((prev) => (prev.includes(msg) ? prev : [...prev, msg]))
      }),
    [quote],
  )

  const selectedWallet = wallets.data?.find((w) => w.id === walletId)

  const set = <K extends keyof BuyerInfo>(key: K, value: BuyerInfo[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const selectWallet = (id: string) => {
    const w = wallets.data?.find((x) => x.id === id)
    setWalletId(id)
    setConnection({ status: 'disconnected' })
    setForm((f) =>
      f && w
        ? { ...f, walletAddress: w.address, network: w.network, walletType: w.walletType, profileName: w.profileName || f.profileName }
        : f,
    )
  }

  const connect = useMutation({
    mutationFn: (id: string) => api.account.connectWallet(id),
    onMutate: () => setConnection({ status: 'connecting' }),
    onSuccess: (r) => {
      setConnection({ status: 'connected', walletId: r.walletId })
      toast.success('Carteira conectada.')
    },
    onError: (e) =>
      setConnection({ status: 'rejected', message: isApiError(e) ? e.message : 'Não foi possível conectar a carteira.' }),
  })

  const requestQuote = useMutation({
    mutationFn: (network: NetworkKey) => api.checkout.quote(network),
    onSuccess: (q, _n) => {
      if (quote) {
        // Nova cotação após mudança: compara e exige nova confirmação.
        const diff: QuoteChange[] = []
        for (const l of quote.lines) {
          const now = q.lines.find((x) => x.cartItemId === l.cartItemId)
          if (!now) diff.push({ nftId: l.nftId, name: l.name, kind: 'availability', message: `${l.name} não está mais disponível.` })
          else if (now.unitPriceEth !== l.unitPriceEth)
            diff.push({ nftId: l.nftId, name: l.name, kind: 'price', message: `${l.name}: ${formatEth(l.unitPriceEth)} → ${formatEth(now.unitPriceEth)}` })
          else if (now.quantity !== l.quantity)
            diff.push({ nftId: l.nftId, name: l.name, kind: 'availability', message: `${l.name}: quantidade ${l.quantity} → ${now.quantity}` })
        }
        setChanges(diff)
      }
      setQuote(q)
      setLiveStale([])
      setReviewOpen(true)
    },
    onError: (e) => toast.error(isApiError(e) ? e.message : 'Não foi possível gerar a cotação.'),
  })

  // Trava síncrona contra clique duplo: o estado isPending só desabilita o botão
  // no próximo render; o ref barra o segundo envio imediatamente.
  const submitting = useRef(false)
  const placeOrder = useMutation({
    onSettled: () => {
      submitting.current = false
    },
    mutationFn: ({ q, wid }: { q: Pick<Quote, "id" | "network">; wid: string }) => {
      const attempt = attemptFor({ quoteId: q.id, walletId: wid, network: q.network, userId })
      return api.orders.create({ quoteId: q.id, walletId: wid, network: q.network, buyer: form! }, attempt.key)
    },
    onSuccess: (order: Order) => {
      clearAttempt()
      clearDraft()
      setRecoverable(null)
      queryClient.setQueryData(qk.order(userId, order.id), order)
      void queryClient.invalidateQueries({ queryKey: qk.pendingOrders(userId) })
      setReviewOpen(false)
      void navigate({ to: '/pedidos/$orderId', params: { orderId: order.id } })
    },
    onError: (e) => {
      if (!isApiError(e)) return
      if (e.code === 'QUOTE_STALE') {
        const details = e.details as QuoteStaleDetails
        clearAttempt()
        setQuote(details.quote)
        setChanges(details.changes)
        setLiveStale([])
        void queryClient.invalidateQueries({ queryKey: ['user', userId, 'cart'] })
        return
      }
      if (e.code === 'TIMEOUT' || e.code === 'NETWORK_ERROR' || e.status >= 500) {
        setRecoverable('Não recebemos a confirmação do pedido. Tente novamente: a mesma tentativa será recuperada, sem compra duplicada.')
        return
      }
      if (e.code === 'IDEMPOTENCY_CONFLICT') clearAttempt()
      if (e.status === 422 && Object.keys(e.fieldErrors).length) {
        setErrors(e.fieldErrors as Errors)
        setReviewOpen(false)
      }
      if (e.status !== 401) toast.error(e.message)
    },
  })

  const submitOrder = (vars: { q: Pick<Quote, "id" | "network">; wid: string }) => {
    if (submitting.current) return
    submitting.current = true
    placeOrder.mutate(vars)
  }

  const review = async () => {
    if (!form) return
    const e = validate(form)
    if (!walletId) e.walletId = 'Selecione uma carteira cadastrada.'
    if (connection.status !== 'connected' || connection.walletId !== walletId) e.connection = 'Conecte a carteira selecionada para continuar.'
    setErrors(e)
    if (Object.keys(e).length) {
      if (Object.keys(e).some((k) => k !== "connection" && k !== "walletId")) setFormOpen(true)
      await new Promise((r) => requestAnimationFrame(r))
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"], [data-error-anchor="true"]')
      first?.focus()
      toast.error('Revise os campos destacados.')
      return
    }
    setChanges([])
    requestQuote.mutate(form.network)
  }

  const resume = () => {
    if (!resumable || !form) return
    submitOrder({ q: { id: resumable.quoteId, network: resumable.network as NetworkKey }, wid: resumable.walletId })
  }

  const cartData = cart.data
  const lines = cartData?.items ?? []
  const stale = liveStale.length > 0
  const pendingOrder = pending.data?.[0]

  const walletOptions = useMemo(() => wallets.data ?? [], [wallets.data])

  if (cartData && !cartData.items.length && !pendingOrder && !resumable) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-xl font-bold">Pagamento</h1>
        <p className="mt-3 text-muted-foreground">Seu carrinho está vazio.</p>
        <Button asChild className="mt-6">
          <Link to="/" hash="catalogo">
            Explorar NFTs
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="container-page pb-6 pt-1 md:py-8">
      <MobileTopBar title="Pagamento com carteira" />
      <nav aria-label="Trilha de navegação" className="mb-4 hidden text-xs text-muted-foreground md:block">
        <Link to="/" className="hover:text-highlight">
          Início
        </Link>{' '}
        /{' '}
        <Link to="/carrinho" className="hover:text-highlight">
          Carrinho
        </Link>{' '}
        / Pagamento
      </nav>
      <h1 className="sr-only hidden md:block">Pagamento</h1>

      {pendingOrder && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-highlight/50 bg-highlight/10 px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Você tem um pedido aguardando confirmação na rede.
          </span>
          <Button asChild size="sm" variant="outline">
            <Link to="/pedidos/$orderId" params={{ orderId: pendingOrder.id }}>
              Acompanhar pedido
            </Link>
          </Button>
        </div>
      )}
      {resumable && !pendingOrder && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-highlight/50 bg-highlight/10 px-4 py-3 text-sm">
          <span>Encontramos uma tentativa de pedido sem confirmação. Retome para recuperar o mesmo pedido.</span>
          <Button size="sm" onClick={resume} disabled={placeOrder.isPending || !form}>
            Retomar pedido
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section aria-labelledby="buyer-title" className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="buyer-title" className="text-base font-semibold">
              Perfil do colecionador
            </h2>
            {/* No mobile (Figma "Pagamento com carteira") os dados vêm pré-preenchidos e ficam recolhidos. */}
            <Button type="button" variant="link" size="sm" className="md:hidden" aria-expanded={formOpen} aria-controls="checkout-form" onClick={() => setFormOpen((o) => !o)}>
              {formOpen ? "Ocultar dados" : "Revisar dados"}
            </Button>
          </div>
          {wallets.isPending || !form ? (
            wallets.data && wallets.data.length === 0 ? (
              <div className="rounded-xl bg-card p-6 text-sm">
                <p>Você ainda não cadastrou uma carteira. Cadastre a carteira principal para concluir a compra.</p>
                <Button asChild className="mt-4">
                  <Link to="/conta/carteiras" search={{ redirect: '/checkout' }}>
                    Cadastrar carteira
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            )
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                review()
              }}
              className={cn("grid gap-4 md:grid-cols-2", !formOpen && "max-md:hidden")}
              id="checkout-form"
            >
              <FormField label="Nome de exibição" required error={errors.displayName}>
                {(p) => <Input {...p} value={form.displayName} onChange={(e) => set('displayName', e.target.value)} autoComplete="name" />}
              </FormField>
              <FormField label="Nome de usuário" required error={errors.username}>
                {(p) => <Input {...p} value={form.username} onChange={(e) => set('username', e.target.value)} autoComplete="username" />}
              </FormField>
              <FormField label="Rede" required error={errors.network}>
                {(p) => (
                  <Select value={form.network} onValueChange={(v) => set('network', v as NetworkKey)}>
                    <SelectTrigger {...p} className="w-full">
                      <SelectValue placeholder="Selecione uma rede" />
                    </SelectTrigger>
                    <SelectContent>
                      {NETWORKS.map((n) => (
                        <SelectItem key={n.key} value={n.key}>
                          {n.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField label="Nome do perfil" required error={errors.profileName}>
                {(p) => <Input {...p} value={form.profileName} onChange={(e) => set('profileName', e.target.value)} />}
              </FormField>
              <FormField label="Endereço da carteira" required error={errors.walletAddress}>
                {(p) => (
                  <Input
                    {...p}
                    value={form.walletAddress}
                    onChange={(e) => set('walletAddress', e.target.value.trim())}
                    placeholder="Endereço 0x da carteira"
                    spellCheck={false}
                    readOnly={!form.useAnotherWallet}
                  />
                )}
              </FormField>
              <FormField label="ENS ou carteira secundária (opcional)" error={errors.secondaryAddress}>
                {(p) => <Input {...p} value={form.secondaryAddress} onChange={(e) => set('secondaryAddress', e.target.value.trim())} placeholder="ENS ou carteira secundária" />}
              </FormField>
              <FormField label="Tipo de carteira" required error={errors.walletType}>
                {(p) => (
                  <Select value={form.walletType} onValueChange={(v) => set('walletType', v as WalletType)}>
                    <SelectTrigger {...p} className="w-full">
                      <SelectValue placeholder="Selecione uma carteira" />
                    </SelectTrigger>
                    <SelectContent>
                      {WALLET_TYPES.map((t) => (
                        <SelectItem key={t.key} value={t.key}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField label="Código de indicação" error={errors.referralCode}>
                {(p) => <Input {...p} value={form.referralCode} onChange={(e) => set('referralCode', e.target.value)} />}
              </FormField>
              <FormField label="E-mail" required error={errors.email}>
                {(p) => <Input {...p} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />}
              </FormField>
              <FormField label="Nome ENS" required error={errors.ensName}>
                {(p) => (
                  <div className="flex">
                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-surface-2 px-2 text-sm text-muted-foreground">.eth</span>
                    <Input {...p} className="rounded-l-none" value={form.ensName} onChange={(e) => set('ensName', e.target.value)} />
                  </div>
                )}
              </FormField>
              <div className="flex items-center gap-2 md:col-span-2">
                <Checkbox id="use-another" checked={form.useAnotherWallet} onCheckedChange={(v) => set('useAnotherWallet', v === true)} />
                <Label htmlFor="use-another" className="font-normal">
                  Usar outra carteira?
                </Label>
              </div>
              <FormField label="Observação do colecionador (opcional)" error={errors.notes} className="md:col-span-2" hint="Até 280 caracteres.">
                {(p) => <Textarea {...p} rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
              </FormField>
            </form>
          )}
        </section>

        <aside aria-labelledby="order-summary-title" className="order-first flex h-fit flex-col gap-5 rounded-xl bg-card p-5 lg:sticky lg:top-24 lg:order-none">
          <h2 id="order-summary-title" className="flex justify-between text-base font-semibold">
            Seus NFTs <span className="text-sm font-normal text-muted-foreground">Subtotal</span>
          </h2>
          {cart.isPending ? (
            <PriceSummarySkeleton />
          ) : (
            <ul className="flex flex-col gap-3">
              {lines.map((l) => (
                <li key={l.id} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 text-sm">
                  <div className="overflow-hidden rounded-md">
                    <NftImage image={l.image} alt="" sizes="48px" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {l.name} <span className="text-muted-foreground">(x {l.quantity})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Edição {l.editionLabel}</p>
                  </div>
                  <span className="font-semibold tabular-nums text-highlight">{formatEth(l.lineTotalEth)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Tem um código promocional?{' '}
            <Link to="/carrinho" className="text-highlight underline">
              Aplique aqui
            </Link>
          </p>
          {cartData ? <PriceSummary summary={cartData.summary} coupon={cartData.coupon} feeHint="Taxa estimada (confirmada na revisão)" /> : null}

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 flex w-full items-center justify-between text-sm font-semibold">
              Carteira conectada
              <Link to="/conta/carteiras" search={{ redirect: "/checkout" }} className="text-xs font-normal text-highlight hover:underline">
                Trocar carteira
              </Link>
            </legend>
            {walletOptions.length > 0 && (
              <RadioGroup value={walletId ?? undefined} onValueChange={selectWallet} aria-label="Carteira cadastrada" className="gap-2">
                {walletOptions.map((w) => (
                  <Label
                    key={w.id}
                    htmlFor={`wallet-${w.id}`}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal',
                      walletId === w.id ? 'border-highlight' : 'border-border',
                    )}
                  >
                    <RadioGroupItem id={`wallet-${w.id}`} value={w.id} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{w.nickname}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {w.ensName || `${w.address.slice(0, 6)}…${w.address.slice(-4)}`} · Rede {NETWORKS.find((n) => n.key === w.network)?.label}
                      </span>
                    </span>
                    <span className="ml-auto text-[10px] uppercase text-muted-foreground">{w.slot === 'primary' ? 'Principal' : 'Secundária'}</span>
                  </Label>
                ))}
              </RadioGroup>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">Carteira e rede</legend>
            <RadioGroup
              value={form?.walletType}
              onValueChange={(v) => {
                set("walletType", v as WalletType)
                setConnection({ status: "disconnected" })
              }}
              aria-label="Tipo de carteira"
              className="gap-2"
            >
              {WALLET_TYPES.map((t) => (
                <Label
                  key={t.key}
                  htmlFor={`wallet-type-${t.key}`}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal", form?.walletType === t.key ? "border-highlight" : "border-border")}
                >
                  <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-highlight">
                    {t.label.slice(0, 1)}
                  </span>
                  <span className="flex-1">{t.label}</span>
                  <RadioGroupItem id={`wallet-type-${t.key}`} value={t.key} />
                </Label>
              ))}
            </RadioGroup>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 p-3 text-sm" data-error-anchor={errors.connection ? 'true' : undefined} tabIndex={-1}>
              <span className="flex items-center gap-2" role="status" aria-live="polite">
                {connection.status === 'connected' && connection.walletId === walletId ? (
                  <>
                    <CheckCircle2 className="size-4 text-success" aria-hidden /> Conectada · {WALLET_TYPES.find((t) => t.key === form?.walletType)?.label}
                  </>
                ) : connection.status === 'connecting' ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Aguardando aprovação na carteira…
                  </>
                ) : connection.status === 'rejected' ? (
                  <>
                    <AlertTriangle className="size-4 text-destructive" aria-hidden /> {connection.message}
                  </>
                ) : (
                  <>
                    <Unplug className="size-4" aria-hidden /> Carteira desconectada
                  </>
                )}
              </span>
              {connection.status === 'connected' && connection.walletId === walletId ? (
                <Button size="sm" variant="ghost" onClick={() => setConnection({ status: 'disconnected' })}>
                  Desconectar
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={!walletId || connect.isPending} onClick={() => walletId && connect.mutate(walletId)}>
                  <PlugZap aria-hidden /> {connection.status === 'rejected' ? 'Tentar de novo' : 'Conectar'}
                </Button>
              )}
            </div>
            {errors.connection && (
              <p role="alert" className="text-xs text-destructive">
                {errors.connection}
              </p>
            )}
          </fieldset>

          <Button size="lg" type="submit" form="checkout-form" disabled={!form || requestQuote.isPending || !lines.length || !!pendingOrder}>
            {requestQuote.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Revisar e confirmar compra
          </Button>
        </aside>
      </div>

      <Dialog open={reviewOpen} onOpenChange={(o) => !placeOrder.isPending && setReviewOpen(o)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Revise seu pedido</DialogTitle>
            <DialogDescription>
              Rede {NETWORKS.find((n) => n.key === quote?.network)?.label} · Carteira {selectedWallet?.nickname}
            </DialogDescription>
          </DialogHeader>
          {(changes.length > 0 || stale) && (
            <div role="alert" className="rounded-md border border-highlight/50 bg-highlight/10 p-3 text-sm" data-testid="quote-changes">
              <p className="mb-1 flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4 text-highlight" aria-hidden />
                {stale ? 'A cotação ficou desatualizada' : 'A cotação foi atualizada'}
              </p>
              <ul className="list-disc pl-5 text-xs">
                {[...changes.map((c) => c.message), ...liveStale].map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs">{stale ? 'Atualize a cotação para continuar.' : 'Confira os novos valores e confirme novamente.'}</p>
            </div>
          )}
          {quote && (
            <>
              <ul className="flex flex-col gap-2 text-sm">
                {quote.lines.map((l) => (
                  <li key={l.cartItemId} className="flex justify-between gap-2">
                    <span className="truncate">
                      {l.name} · {l.editionLabel} (x {l.quantity})
                    </span>
                    <span className="tabular-nums">{formatEth(l.lineTotalEth)}</span>
                  </li>
                ))}
              </ul>
              <PriceSummary summary={quote.summary} coupon={quote.coupon} feeHint="Taxa cotada" />
            </>
          )}
          {recoverable && (
            <p role="alert" className="rounded-md bg-surface-2 p-3 text-xs">
              {recoverable}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewOpen(false)} disabled={placeOrder.isPending}>
              Voltar
            </Button>
            {stale ? (
              <Button onClick={() => form && requestQuote.mutate(form.network)} disabled={requestQuote.isPending}>
                Atualizar cotação
              </Button>
            ) : (
              <Button
                onClick={() => quote && walletId && submitOrder({ q: quote, wid: walletId })}
                disabled={!quote || !quote.lines.length || placeOrder.isPending}
                aria-busy={placeOrder.isPending}
              >
                {placeOrder.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {placeOrder.isPending ? 'Enviando pedido…' : recoverable ? 'Tentar novamente' : 'Confirmar compra'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
