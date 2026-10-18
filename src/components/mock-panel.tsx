import { FlaskConical, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { http } from '@/api/http'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

interface MockState {
  config: { scenario: string }
  scenarios: Record<string, string>
}

// Tudo passa por /api/__mock; eventos chegam pelo socket, nunca direto na UI.
export function MockPanel() {
  const [state, setState] = useState<MockState | null>(null)
  const [open, setOpen] = useState(false)
  const [nftId, setNftId] = useState('emerald-ape-042')

  useEffect(() => {
    if (open) void http.get<MockState>('/__mock/state').then((r) => setState(r.data))
  }, [open])

  const call = async (path: string, body: unknown, message: string) => {
    try {
      await http.post(path, body)
      toast.success(message)
    } catch {
      toast.error('Falha ao executar ação de mock.')
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="fixed right-0 top-1/2 z-50 inline-flex items-center gap-1 rounded-l-full border border-r-0 border-border bg-card/90 p-2 text-xs shadow-lg md:bottom-4 md:right-3 md:top-auto md:rounded-full md:border-r md:px-3"
          aria-label="Abrir painel de mocks"
        >
          <FlaskConical className="size-4 text-highlight" aria-hidden />
          <span className="hidden md:inline">Mocks</span>
        </button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto bg-background">
        <SheetHeader>
          <SheetTitle>API simulada (MSW)</SheetTitle>
          <SheetDescription>Cenários determinísticos para demonstração e testes.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-8 text-sm">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mock-scenario">Cenário</Label>
            <Select
              value={state?.config.scenario}
              onValueChange={async (v) => {
                await call('/__mock/scenario', { scenario: v }, `Cenário "${state?.scenarios[v]}" ativo.`)
                setState((s) => (s ? { ...s, config: { ...s.config, scenario: v } } : s))
              }}
            >
              <SelectTrigger id="mock-scenario" className="w-full">
                <SelectValue placeholder="Carregando…" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(state?.scenarios ?? {}).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              await call('/__mock/reset', {}, 'Dados restaurados.')
              location.reload()
            }}
          >
            <RotateCcw aria-hidden /> Resetar dados e cenário
          </Button>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mock-nft">NFT para eventos</Label>
            <input id="mock-nft" value={nftId} onChange={(e) => setNftId(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3" />
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => call(`/__mock/nfts/${nftId}`, { priceEth: (1 + Math.random()).toFixed(2) }, 'Preço alterado (nft.updated).')}>
                Alterar preço
              </Button>
              <Button size="sm" variant="outline" onClick={() => call(`/__mock/nfts/${nftId}`, { available: 0 }, 'Edição 1/50 esgotada.')}>
                Esgotar 1/50
              </Button>
              <Button size="sm" variant="outline" onClick={() => call('/__mock/events/replay', {}, 'Último evento reenviado.')}>
                Duplicar evento
              </Button>
              <Button size="sm" variant="outline" onClick={() => call(`/__mock/events/stale/${nftId}`, {}, 'Evento antigo enviado.')}>
                Evento antigo
              </Button>
              <Button size="sm" variant="outline" onClick={() => call('/__mock/socket/drop', { offlineMs: 4000 }, 'Socket desconectado por 4s.')}>
                Derrubar socket
              </Button>
              <Button size="sm" variant="outline" onClick={() => call('/__mock/session/expire', {}, 'Sessões expiradas.')}>
                Expirar sessão
              </Button>
            </div>
          </div>
          <div className="rounded-md bg-card p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Credenciais fictícias</p>
            <p>ana@kurio.dev / Kurio@123</p>
            <p>bruno@kurio.dev / Kurio@123</p>
            <p className="mt-2 font-semibold text-foreground">Cupons</p>
            <p>KURIO10 (10%) · GENESIS5 (5%) · VERAO2025 (expirado)</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
