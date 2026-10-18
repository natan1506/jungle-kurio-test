import { useRouter } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function MobileTopBar({ title, right, className }: { title?: string; right?: ReactNode; className?: string }) {
  const router = useRouter()
  return (
    <div className={cn('sticky top-0 z-30 -mx-4 mb-4 flex items-center gap-3 bg-background/95 px-4 py-3 backdrop-blur md:hidden', className)}>
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? router.history.back() : void router.navigate({ to: '/' }))}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-card"
        aria-label="Voltar"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      {title ? <h1 className="flex-1 truncate text-center text-base font-semibold">{title}</h1> : <span className="flex-1" />}
      <div className="flex min-w-9 justify-end">{right}</div>
    </div>
  )
}
