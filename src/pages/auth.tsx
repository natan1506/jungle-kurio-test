import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { isApiError } from '@/api/http'
import { FormField } from '@/components/form-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLogin, useRegister } from '@/features/auth/hooks'
import { focusFirstInvalid } from '@/lib/focus'
import { safeRedirect } from '@/lib/redirect'
import { cn } from '@/lib/utils'
import { HomePage } from './home'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-10', props.className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
}

function SocialButtons() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-xs text-muted-foreground">Ou continue com</p>
      {['Google', 'Facebook'].map((p) => (
        <Tooltip key={p}>
          <TooltipTrigger asChild>
            <Button type="button" variant="outline" aria-disabled="true" className="cursor-not-allowed border-border text-muted-foreground hover:bg-transparent" onClick={(e) => e.preventDefault()}>
              Continuar com {p} <span className="sr-only">(em breve)</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Login social em breve</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

function AuthShell({ title, description, children, redirect }: { title: ReactNode; description: string; children: ReactNode; redirect?: string }) {
  const navigate = useNavigate()
  const router = useRouter()
  return (
    <>
      <div aria-hidden className="pointer-events-none select-none opacity-60" inert>
        <HomePage />
      </div>
      <Dialog
        open
        onOpenChange={(open) => {
          if (open) return
          if (window.history.length > 1) router.history.back()
          else void navigate({ to: safeRedirect(redirect) === '/checkout' ? '/carrinho' : '/' })
        }}
      >
        <DialogContent className="max-h-[100dvh] overflow-y-auto border-border bg-card max-sm:h-[100dvh] max-sm:max-w-full max-sm:rounded-none sm:max-w-md">
          <p className="text-center text-lg font-bold tracking-[0.3em] sm:hidden">KURIO</p>
          <DialogTitle className="text-center text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-center text-xs">{description}</DialogDescription>
          {children}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function LoginPage({ redirect, reason }: { redirect?: string; reason?: string }) {
  const login = useLogin()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const apiErr = login.error && isApiError(login.error) ? login.error : null
  const fieldErrors = { ...apiErr?.fieldErrors, ...errors }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!EMAIL_RE.test(email.trim())) next.email = 'Informe um e-mail válido.'
    if (!password) next.password = 'Informe sua senha.'
    setErrors(next)
    const form = e.currentTarget as HTMLFormElement
    if (Object.keys(next).length) return focusFirstInvalid(form)
    login.mutate(
      { email: email.trim(), password },
      { onSuccess: () => void navigate({ to: safeRedirect(redirect), replace: true }), onError: () => focusFirstInvalid(form) },
    )
  }

  return (
    <AuthShell
      redirect={redirect}
      title={
        <>
          <span className="text-highlight">Entrar</span> <span aria-hidden>:</span>{' '}
          <Link to="/cadastro" search={{ redirect }} className="font-normal hover:text-highlight">
            Criar conta
          </Link>
        </>
      }
      description="Entre para gerenciar seu portfólio, coleção e perfil de criador."
    >
      {reason === 'expired' && (
        <p role="alert" className="rounded-md border border-highlight/50 bg-highlight/10 px-3 py-2 text-xs">
          Sua sessão expirou. Entre novamente para continuar de onde parou.
        </p>
      )}
      <form noValidate onSubmit={submit} className="flex flex-col gap-4" aria-label="Entrar">
        <FormField label="E-mail" error={fieldErrors.email}>
          {(p) => <Input {...p} type="email" autoComplete="email" placeholder="contato@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </FormField>
        <FormField label="Senha" error={fieldErrors.password}>
          {(p) => <PasswordInput {...p} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </FormField>
        <Tooltip>
          <TooltipTrigger asChild>
            <span role="link" aria-disabled="true" tabIndex={0} className="-mt-2 cursor-not-allowed self-end text-xs text-muted-foreground">
              Esqueceu a senha? <span className="sr-only">(em breve)</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Recuperação de senha em breve</TooltipContent>
        </Tooltip>
        {apiErr && !Object.keys(apiErr.fieldErrors).length && (
          <p role="alert" className="text-sm text-destructive">
            {apiErr.message}
          </p>
        )}
        <Button type="submit" size="lg" disabled={login.isPending}>
          {login.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Entrar
        </Button>
      </form>
      <SocialButtons />
      <p className="text-center text-xs text-muted-foreground">
        Nova no Kurio?{' '}
        <Link to="/cadastro" search={{ redirect }} className="text-highlight underline">
          Crie uma conta
        </Link>
      </p>
    </AuthShell>
  )
}

export function RegisterPage({ redirect }: { redirect?: string }) {
  const register = useRegister()
  const navigate = useNavigate()
  const [values, setValues] = useState({ username: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const apiErr = register.error && isApiError(register.error) ? register.error : null
  const fieldErrors = { ...apiErr?.fieldErrors, ...errors }
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }))
    setErrors((er) => ({ ...er, [k]: '' }))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!/^[a-z0-9._-]{3,24}$/i.test(values.username)) next.username = 'Use 3 a 24 caracteres: letras, números, ponto, hífen ou _.'
    if (!EMAIL_RE.test(values.email.trim())) next.email = 'Informe um e-mail válido.'
    if (values.password.length < 8 || !/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) {
      next.password = 'Mínimo de 8 caracteres, com letras e números.'
    }
    if (values.confirm !== values.password) next.confirm = 'As senhas não coincidem.'
    setErrors(next)
    const form = e.currentTarget as HTMLFormElement
    if (Object.values(next).some(Boolean)) return focusFirstInvalid(form)
    register.mutate(
      { username: values.username.trim(), email: values.email.trim(), password: values.password },
      { onSuccess: () => void navigate({ to: safeRedirect(redirect), replace: true }), onError: () => focusFirstInvalid(form) },
    )
  }

  return (
    <AuthShell
      redirect={redirect}
      title={
        <>
          <Link to="/entrar" search={{ redirect }} className="font-normal hover:text-highlight">
            Entrar
          </Link>{' '}
          <span aria-hidden>:</span> <span className="text-highlight">Criar conta</span>
        </>
      }
      description="Crie seu perfil de colecionador e conecte sua carteira quando quiser."
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4" aria-label="Criar conta">
        <FormField label="Nome de usuário" error={fieldErrors.username}>
          {(p) => <Input {...p} autoComplete="username" value={values.username} onChange={set('username')} />}
        </FormField>
        <FormField label="E-mail" error={fieldErrors.email}>
          {(p) => <Input {...p} type="email" autoComplete="email" value={values.email} onChange={set('email')} />}
        </FormField>
        <FormField label="Senha" error={fieldErrors.password} hint="Mínimo de 8 caracteres, com letras e números.">
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={values.password} onChange={set('password')} />}
        </FormField>
        <FormField label="Confirmar senha" error={fieldErrors.confirm}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={values.confirm} onChange={set('confirm')} />}
        </FormField>
        {apiErr && !Object.keys(apiErr.fieldErrors).length && (
          <p role="alert" className="text-sm text-destructive">
            {apiErr.message}
          </p>
        )}
        <Button type="submit" size="lg" disabled={register.isPending}>
          {register.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Criar perfil
        </Button>
      </form>
      <SocialButtons />
      <p className="text-center text-xs text-muted-foreground">
        Já tem uma conta?{' '}
        <Link to="/entrar" search={{ redirect }} className="text-highlight underline">
          Entre
        </Link>
      </p>
    </AuthShell>
  )
}
