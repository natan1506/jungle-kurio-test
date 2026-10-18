import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  value: number
  min?: number
  max: number
  onChange: (value: number) => void
  label: string
  disabled?: boolean
  size?: 'sm' | 'md'
}

export function QuantityStepper({ value, min = 1, max, onChange, label, disabled, size = 'md' }: Props) {
  const btn = cn(
    'inline-flex items-center justify-center rounded-full btn-gradient text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed',
    size === 'sm' ? 'size-6' : 'size-7',
  )
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-2">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={disabled || value <= min} aria-label={`Diminuir ${label}`}>
        <Minus className="size-3.5" aria-hidden />
      </button>
      <output aria-live="polite" className="min-w-6 text-center tabular-nums" aria-label={`${label}: ${value}`}>
        {value}
      </output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label={`Aumentar ${label}`}>
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}
