import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { formatEth } from '@/lib/money'
import { getRealtime, realtimeBus, type ConnectionState, type RealtimeClient } from './realtime'

const RealtimeContext = createContext<RealtimeClient | null>(null)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [client] = useState(() => getRealtime(queryClient))
  useEffect(() => {
    void client.start()
    return () => client.stop()
  }, [client])
  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>
}

export function useRealtime() {
  return useContext(RealtimeContext)
}

export function useConnectionState() {
  const client = useRealtime()
  const [state, setState] = useState<ConnectionState>(client?.state ?? 'disconnected')
  useEffect(() => realtimeBus.on('connection', setState), [])
  return state
}

/** Anuncia (toast + aria-live) alterações recebidas para o NFT exibido. */
export function useNftLiveNotice(id: string, name: string | undefined) {
  useEffect(
    () =>
      realtimeBus.on('nft.applied', (e) => {
        if (e.resource.id !== id) return
        toast.info(`${name ?? 'NFT'} atualizado`, {
          id: `nft-${id}`,
          description: `Preço: ${formatEth(e.data.priceEth)} · ${e.data.available} disponíveis.`,
        })
      }),
    [id, name],
  )
}
