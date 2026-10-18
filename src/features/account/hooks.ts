import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, qk } from '@/api/endpoints'
import type { PasswordInput, ProfileInput, Wallet, WalletInput } from '@/api/types'
import { sessionStore, useSession } from '@/lib/session-store'

function useUserId() {
  return useSession()?.user.id ?? 'anon'
}

export function useProfile() {
  const uid = useUserId()
  return useQuery({ queryKey: qk.profile(uid), queryFn: ({ signal }) => api.account.profile({ signal }), enabled: uid !== 'anon' })
}

export function useUpdateProfile() {
  const uid = useUserId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProfileInput) => api.account.updateProfile(input),
    onSuccess: (user) => {
      qc.setQueryData(qk.profile(uid), user)
      sessionStore.updateUser(user)
      toast.success('Perfil atualizado.')
    },
  })
}

export function useAvatar() {
  const uid = useUserId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dataUrl: string | null) => (dataUrl ? api.account.setAvatar(dataUrl) : api.account.removeAvatar()),
    onSuccess: (user, dataUrl) => {
      qc.setQueryData(qk.profile(uid), user)
      sessionStore.updateUser(user)
      toast.success(dataUrl ? 'Avatar atualizado.' : 'Avatar removido.')
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: PasswordInput) => api.account.changePassword(input),
    onSuccess: () => toast.success('Senha alterada com sucesso.'),
  })
}

export function useWallets() {
  const uid = useUserId()
  return useQuery({ queryKey: qk.wallets(uid), queryFn: ({ signal }) => api.account.wallets({ signal }), enabled: uid !== 'anon' })
}

export function useSaveWallet() {
  const uid = useUserId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: WalletInput }) =>
      id ? api.account.updateWallet(id, input) : api.account.createWallet(input),
    onSuccess: (wallet) => {
      qc.setQueryData<Wallet[]>(qk.wallets(uid), (old = []) => {
        const exists = old.some((w) => w.id === wallet.id)
        return exists ? old.map((w) => (w.id === wallet.id ? wallet : w)) : [...old, wallet]
      })
      toast.success(`Carteira ${wallet.slot === 'primary' ? 'principal' : 'secundária'} salva.`)
    },
  })
}
