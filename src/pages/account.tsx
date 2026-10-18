import { Link, useNavigate } from '@tanstack/react-router'
import { Archive, Bell, Heart, HelpCircle, LogOut, Tag, User, Wallet as WalletIcon } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { isApiError } from '@/api/http'
import { NETWORKS, WALLET_TYPES, type NetworkKey, type ProfileInput, type Wallet, type WalletInput, type WalletType } from '@/api/types'
import { FormField } from '@/components/form-field'
import { Avatar } from '@/components/layout/header'
import { MobileTopBar } from '@/components/layout/mobile-top-bar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAvatar, useChangePassword, useProfile, useSaveWallet, useUpdateProfile, useWallets } from '@/features/account/hooks'
import { useLogout } from '@/features/auth/hooks'
import { cn } from '@/lib/utils'
import { focusFirstInvalid } from '@/lib/focus'
import { safeRedirect } from '@/lib/redirect'
import { PasswordInput } from './auth'

const MENU: { label: string; icon: typeof User; to?: '/conta/perfil' | '/conta/carteiras' }[] = [
  { label: 'Dados do perfil', icon: User, to: '/conta/perfil' },
  { label: 'Carteiras', icon: WalletIcon, to: '/conta/carteiras' },
  { label: 'Atividade', icon: Bell },
  { label: 'Lista de interesse', icon: Heart },
  { label: 'Ofertas', icon: Tag },
  { label: 'Arquivos baixados', icon: Archive },
  { label: 'Suporte', icon: HelpCircle },
]

function AccountLayout({ title, children }: { title: string; children: ReactNode }) {
  const logout = useLogout()
  return (
    <div className="container-page grid grid-cols-1 gap-6 py-6 md:grid-cols-[220px_1fr] md:py-10">
      <MobileTopBar title={title} className="col-span-full -mb-2" />
      <aside className="h-fit min-w-0 rounded-xl bg-card p-3">
        <h2 className="px-3 py-2 text-sm font-semibold">Meu perfil</h2>
        <nav aria-label="Conta">
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {MENU.map((m) => (
              <li key={m.label} className="shrink-0">
                {m.to ? (
                  <Link
                    to={m.to}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent data-[status=active]:bg-accent data-[status=active]:text-highlight"
                  >
                    <m.icon className="size-4" aria-hidden /> {m.label}
                  </Link>
                ) : (
                  <span aria-disabled="true" className="hidden cursor-not-allowed items-center gap-2 px-3 py-2 text-sm text-muted-foreground md:flex" title="Em breve">
                    <m.icon className="size-4" aria-hidden /> {m.label}
                    <span className="sr-only"> (em breve)</span>
                  </span>
                )}
              </li>
            ))}
            <li className="shrink-0">
              <button type="button" onClick={() => logout.mutate()} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-highlight hover:bg-accent">
                <LogOut className="size-4" aria-hidden /> Sair
              </button>
            </li>
          </ul>
        </nav>
      </aside>
      <section aria-label={title}>
        <h1 id="account-title" className="mb-5 hidden text-base font-semibold md:block">
          {title}
        </h1>
        {children}
      </section>
    </div>
  )
}

/* ---------------- Perfil ---------------- */

export function ProfilePage() {
  const profile = useProfile()
  const update = useUpdateProfile()
  const avatar = useAvatar()
  const password = useChangePassword()
  const fileRef = useRef<HTMLInputElement>(null)
  const [formState, setForm] = useState<ProfileInput | null>(null)
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const u = profile.data
  const form: ProfileInput | null =
    formState ?? (u ? { displayName: u.displayName, username: u.username, email: u.email, ensName: u.ensName, walletNickname: u.walletNickname } : null)

  if (profile.isPending || !form) {
    return (
      <AccountLayout title="Perfil do colecionador">
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </AccountLayout>
    )
  }

  const set = (k: keyof ProfileInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value })
    setErrors((er) => ({ ...er, [k]: '' }))
  }

  const onFile = (file: File | undefined) => {
    setAvatarError(null)
    if (!file) return
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setAvatarError('Envie uma imagem PNG, JPG, WEBP ou GIF.')
    if (file.size > 1_000_000) return setAvatarError('A imagem deve ter até 1 MB.')
    const reader = new FileReader()
    reader.onload = () =>
      avatar.mutate(String(reader.result), {
        onError: (e) => setAvatarError(isApiError(e) ? (e.fieldErrors.avatar ?? e.message) : 'Falha ao enviar avatar.'),
      })
    reader.readAsDataURL(file)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.displayName.trim()) next.displayName = 'Informe o nome de exibição.'
    if (!/^[a-z0-9._-]{3,24}$/i.test(form.username)) next.username = 'Use 3 a 24 caracteres: letras, números, ponto, hífen ou _.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) next.email = 'Informe um e-mail válido.'
    if (!form.walletNickname.trim()) next.walletNickname = 'Informe o apelido da carteira.'
    const changingPwd = pwd.currentPassword || pwd.newPassword || pwd.confirm
    if (changingPwd) {
      if (!pwd.currentPassword) next.currentPassword = 'Informe a senha atual.'
      if (pwd.newPassword.length < 8 || !/[A-Za-z]/.test(pwd.newPassword) || !/\d/.test(pwd.newPassword)) {
        next.newPassword = 'Mínimo de 8 caracteres, com letras e números.'
      }
      if (pwd.confirm !== pwd.newPassword) next.confirm = 'As senhas não coincidem.'
    }
    setErrors(next)
    const formEl = e.currentTarget as HTMLFormElement
    if (Object.keys(next).length) return focusFirstInvalid(formEl)
    try {
      await update.mutateAsync(form)
    } catch (err) {
      if (isApiError(err)) setErrors(err.fieldErrors)
      focusFirstInvalid(formEl)
      if (isApiError(err) && !Object.keys(err.fieldErrors).length && err.status !== 401) toast.error(err.message)
      return
    }
    if (changingPwd) {
      try {
        await password.mutateAsync({ currentPassword: pwd.currentPassword, newPassword: pwd.newPassword })
        setPwd({ currentPassword: '', newPassword: '', confirm: '' })
      } catch (err) {
        if (isApiError(err)) setErrors(err.fieldErrors)
        focusFirstInvalid(formEl)
      }
    }
  }

  const user = profile.data!
  return (
    <AccountLayout title="Perfil do colecionador">
      <form noValidate onSubmit={submit} className="flex flex-col gap-8">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Nome de exibição" required error={errors.displayName}>
            {(p) => <Input {...p} value={form.displayName} onChange={set('displayName')} autoComplete="name" />}
          </FormField>
          <FormField label="Nome de usuário" required error={errors.username}>
            {(p) => <Input {...p} value={form.username} onChange={set('username')} autoComplete="username" />}
          </FormField>
          <FormField label="E-mail" required error={errors.email}>
            {(p) => <Input {...p} type="email" value={form.email} onChange={set('email')} autoComplete="email" />}
          </FormField>
          <FormField label="Nome ENS" error={errors.ensName}>
            {(p) => (
              <div className="flex">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-surface-2 px-2 text-sm text-muted-foreground">.eth</span>
                <Input {...p} className="rounded-l-none" value={form.ensName} onChange={set('ensName')} />
              </div>
            )}
          </FormField>
          <FormField label="Apelido da carteira" required error={errors.walletNickname}>
            {(p) => <Input {...p} value={form.walletNickname} onChange={set('walletNickname')} />}
          </FormField>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm" id="avatar-label">
              Avatar
            </span>
            <div className="flex items-center gap-3" role="group" aria-labelledby="avatar-label">
              <Avatar name={user.displayName} url={user.avatarUrl} className="size-12" />
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                id="avatar-input"
                aria-label="Enviar nova imagem de avatar"
                aria-describedby={avatarError ? 'avatar-error' : undefined}
                onChange={(e) => {
                  onFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={avatar.isPending}>
                Alterar
              </Button>
              {user.avatarUrl && (
                <Button type="button" size="sm" variant="ghost" onClick={() => avatar.mutate(null)} disabled={avatar.isPending}>
                  Remover
                </Button>
              )}
            </div>
            {avatarError && (
              <p id="avatar-error" role="alert" className="text-xs text-destructive">
                {avatarError}
              </p>
            )}
          </div>
        </div>

        <fieldset className="flex max-w-md flex-col gap-4">
          <legend className="mb-2 text-base font-semibold">Alterar senha</legend>
          <FormField label="Senha atual" error={errors.currentPassword}>
            {(p) => <PasswordInput {...p} autoComplete="current-password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} />}
          </FormField>
          <FormField label="Nova senha" error={errors.newPassword}>
            {(p) => <PasswordInput {...p} autoComplete="new-password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />}
          </FormField>
          <FormField label="Confirmar nova senha" error={errors.confirm}>
            {(p) => <PasswordInput {...p} autoComplete="new-password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />}
          </FormField>
        </fieldset>
        <div>
          <Button type="submit" disabled={update.isPending || password.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </AccountLayout>
  )
}

/* ---------------- Carteiras ---------------- */

function emptyWallet(slot: Wallet['slot']): WalletInput {
  return {
    slot,
    displayName: '',
    nickname: '',
    network: 'ethereum',
    profileName: '',
    address: '',
    secondaryAddress: '',
    ensName: '',
    walletType: 'metamask',
    referralCode: '',
    email: '',
  }
}

function WalletForm({ initial, id, slot, onSaved }: { initial: WalletInput; id?: string; slot: Wallet['slot']; onSaved?: () => void }) {
  const save = useSaveWallet()
  const [form, setForm] = useState<WalletInput>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof WalletInput>(k: K, v: WalletInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: '' }))
  }
  const text = (k: keyof WalletInput) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.displayName.trim()) next.displayName = 'Informe o nome de exibição.'
    if (!form.nickname.trim()) next.nickname = 'Informe o apelido da carteira.'
    if (!form.profileName.trim()) next.profileName = 'Informe o nome do perfil.'
    if (!/^0x[a-fA-F0-9]{40}$/.test(form.address)) next.address = 'Endereço inválido (0x + 40 hexadecimais).'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) next.email = 'Informe um e-mail válido.'
    setErrors(next)
    const formEl = e.currentTarget as HTMLFormElement
    if (Object.keys(next).length) return focusFirstInvalid(formEl)
    save.mutate(
      { id, input: { ...form, slot } },
      {
        onSuccess: () => onSaved?.(),
        onError: (err) => {
          if (isApiError(err)) {
            setErrors(err.fieldErrors)
            focusFirstInvalid(formEl)
            if (!Object.keys(err.fieldErrors).length && err.status !== 401) toast.error(err.message)
          }
        },
      },
    )
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-4 md:grid-cols-2" aria-label={`Carteira ${slot === 'primary' ? 'principal' : 'secundária'}`}>
      <FormField label="Nome de exibição" required error={errors.displayName}>
        {(a) => <Input {...a} value={form.displayName} onChange={text('displayName')} />}
      </FormField>
      <FormField label="Apelido da carteira" required error={errors.nickname}>
        {(a) => <Input {...a} value={form.nickname} onChange={text('nickname')} />}
      </FormField>
      <FormField label="Rede" required error={errors.network}>
        {(a) => (
          <Select value={form.network} onValueChange={(v) => set('network', v as NetworkKey)}>
            <SelectTrigger {...a} className="w-full">
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
        {(a) => <Input {...a} value={form.profileName} onChange={text('profileName')} />}
      </FormField>
      <FormField label="Endereço da carteira" required error={errors.address}>
        {(a) => <Input {...a} value={form.address} onChange={text('address')} placeholder="Endereço 0x da carteira" spellCheck={false} />}
      </FormField>
      <FormField label="ENS ou carteira secundária (opcional)" error={errors.secondaryAddress}>
        {(a) => <Input {...a} value={form.secondaryAddress} onChange={text('secondaryAddress')} />}
      </FormField>
      <FormField label="Tipo de carteira" required error={errors.walletType}>
        {(a) => (
          <Select value={form.walletType} onValueChange={(v) => set('walletType', v as WalletType)}>
            <SelectTrigger {...a} className="w-full">
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
        {(a) => <Input {...a} value={form.referralCode} onChange={text('referralCode')} />}
      </FormField>
      <FormField label="E-mail" required error={errors.email}>
        {(a) => <Input {...a} type="email" value={form.email} onChange={text('email')} />}
      </FormField>
      <FormField label="Nome ENS" error={errors.ensName}>
        {(a) => (
          <div className="flex">
            <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-surface-2 px-2 text-sm text-muted-foreground">.eth</span>
            <Input {...a} className="rounded-l-none" value={form.ensName} onChange={text('ensName')} />
          </div>
        )}
      </FormField>
      <div className="md:col-span-2">
        <Button type="submit" disabled={save.isPending}>
          Salvar carteira
        </Button>
      </div>
    </form>
  )
}

export function WalletsPage({ redirect }: { redirect?: string }) {
  const wallets = useWallets()
  const navigate = useNavigate()
  const [addingSecondary, setAddingSecondary] = useState(false)
  const [sameAsPrimary, setSameAsPrimary] = useState(false)
  const primary = wallets.data?.find((w) => w.slot === 'primary')
  const secondary = wallets.data?.find((w) => w.slot === 'secondary')
  const toInput = (w: Wallet | undefined, slot: Wallet['slot']): WalletInput => {
    if (!w) return emptyWallet(slot)
    const { id: _id, updatedAt: _u, ...rest } = w
    return { ...rest, slot }
  }

  const afterSave = () => {
    if (redirect) void navigate({ to: safeRedirect(redirect) })
  }

  return (
    <AccountLayout title="Carteira principal">
      {wallets.isPending ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <div>
            <p className="mb-4 text-xs text-muted-foreground">Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados.</p>
            <WalletForm key={primary?.id ?? 'new-primary'} initial={toInput(primary, 'primary')} id={primary?.id} slot="primary" onSaved={afterSave} />
          </div>
          <section aria-labelledby="secondary-title" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="secondary-title" className="text-base font-semibold">
                  Carteira secundária
                </h2>
                {!secondary && !addingSecondary && <p className="text-xs text-muted-foreground">Você ainda não adicionou uma carteira secundária.</p>}
              </div>
              {!secondary && (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-2">
                    <Checkbox id="same-primary" checked={sameAsPrimary} onCheckedChange={(v) => setSameAsPrimary(v === true)} disabled={!primary} />
                    <Label htmlFor="same-primary" className="text-xs font-normal">
                      Igual à carteira principal
                    </Label>
                  </span>
                  {!addingSecondary && (
                    <Button variant="link" size="sm" onClick={() => setAddingSecondary(true)}>
                      Adicionar
                    </Button>
                  )}
                </div>
              )}
            </div>
            {(secondary || addingSecondary) && (
              <div className={cn(!secondary && 'rounded-xl bg-card p-4')}>
                <WalletForm
                  key={secondary?.id ?? `new-secondary-${sameAsPrimary}`}
                  initial={secondary ? toInput(secondary, 'secondary') : sameAsPrimary && primary ? { ...toInput(primary, 'secondary'), address: '' } : emptyWallet('secondary')}
                  id={secondary?.id}
                  slot="secondary"
                  onSaved={() => setAddingSecondary(false)}
                />
              </div>
            )}
          </section>
        </div>
      )}
    </AccountLayout>
  )
}
