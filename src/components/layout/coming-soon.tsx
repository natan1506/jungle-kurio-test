import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Itens fora do escopo da entrega: visíveis como no Figma, mas sem aparentar
 * sucesso funcional (aria-disabled + aviso "Em breve").
 */
export function ComingSoon({ label, className }: { label: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="link"
          aria-disabled="true"
          tabIndex={0}
          className={cn('cursor-not-allowed text-sm text-muted-foreground', className)}
        >
          {label}
          <span className="sr-only"> (em breve)</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>Em breve</TooltipContent>
    </Tooltip>
  )
}
