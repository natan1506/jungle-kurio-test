import { useState } from 'react'
import { CATEGORIES, NETWORKS, type CategoryKey, type NetworkKey, type NftListResponse } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { isValidEthInput } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { CatalogSearch } from './search'

interface Props {
  search: CatalogSearch
  facets?: NftListResponse['facets']
  priceRange?: NftListResponse['priceRange']
  onChange: (patch: Partial<CatalogSearch>) => void
  idPrefix: string
}

function toggle<T extends string>(list: T[] | undefined, value: T): T[] | undefined {
  const set = new Set(list ?? [])
  if (set.has(value)) set.delete(value)
  else set.add(value)
  return set.size ? [...set].sort() : undefined
}

export function CatalogFilters({ search, facets, priceRange, onChange, idPrefix }: Props) {
  const [min, setMin] = useState(search.priceMin ?? '')
  const [max, setMax] = useState(search.priceMax ?? '')
  const [priceError, setPriceError] = useState<string | null>(null)

  // Sincroniza com a URL (ex.: voltar no histórico) ajustando o estado no render.
  const urlRange = `${search.priceMin ?? ''}|${search.priceMax ?? ''}`
  const [syncedRange, setSyncedRange] = useState(urlRange)
  if (syncedRange !== urlRange) {
    setSyncedRange(urlRange)
    setMin(search.priceMin ?? '')
    setMax(search.priceMax ?? '')
  }

  const countOf = <K extends string>(list: { key: K; count: number }[] | undefined, key: K) => list?.find((f) => f.key === key)?.count

  const applyPrice = () => {
    if ((min && !isValidEthInput(min)) || (max && !isValidEthInput(max))) {
      setPriceError('Use números com ponto decimal, ex.: 0.5')
      return
    }
    if (min && max && Number(min) > Number(max)) {
      setPriceError('O preço mínimo deve ser menor que o máximo.')
      return
    }
    setPriceError(null)
    onChange({ priceMin: min || undefined, priceMax: max || undefined })
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="rounded-xl bg-card p-4">
        <legend className="sr-only">Coleções</legend>
        <h2 aria-hidden className="mb-3 text-sm font-semibold">
          Coleções
        </h2>
        <ul className="flex flex-col gap-1">
          {CATEGORIES.map((c) => {
            const checked = search.categories?.includes(c.key as CategoryKey) ?? false
            const id = `${idPrefix}-cat-${c.key}`
            return (
              <li key={c.key}>
                <label
                  htmlFor={id}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                    checked && 'text-highlight',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      id={id}
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => onChange({ categories: toggle(search.categories, c.key as CategoryKey) })}
                    />
                    <span aria-hidden className={cn('size-1.5 rounded-full', checked ? 'bg-highlight' : 'bg-transparent')} />
                    {c.label}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">({countOf(facets?.categories, c.key) ?? '–'})</span>
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <fieldset className="rounded-xl bg-card p-4">
        <legend className="sr-only">Faixa de preço</legend>
        <h2 aria-hidden className="mb-3 text-sm font-semibold">
          Faixa de preço
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${idPrefix}-min`} className="text-xs text-muted-foreground">
              Mínimo (ETH)
            </Label>
            <input
              id={`${idPrefix}-min`}
              inputMode="decimal"
              placeholder={priceRange?.min ?? '0.00'}
              value={min}
              onChange={(e) => setMin(e.target.value)}
              aria-invalid={!!priceError}
              aria-describedby={priceError ? `${idPrefix}-price-error` : undefined}
              className="h-9 rounded-md border border-input bg-background/60 px-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${idPrefix}-max`} className="text-xs text-muted-foreground">
              Máximo (ETH)
            </Label>
            <input
              id={`${idPrefix}-max`}
              inputMode="decimal"
              placeholder={priceRange?.max ?? '0.00'}
              value={max}
              onChange={(e) => setMax(e.target.value)}
              aria-invalid={!!priceError}
              aria-describedby={priceError ? `${idPrefix}-price-error` : undefined}
              className="h-9 rounded-md border border-input bg-background/60 px-2 text-sm"
            />
          </div>
        </div>
        {priceError && (
          <p id={`${idPrefix}-price-error`} role="alert" className="mt-2 text-xs text-destructive">
            {priceError}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Preço: {priceRange ? `${priceRange.min} – ${priceRange.max} ETH` : '–'}
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={applyPrice}>
            Aplicar
          </Button>
          {(search.priceMin || search.priceMax) && (
            <Button size="sm" variant="ghost" onClick={() => onChange({ priceMin: undefined, priceMax: undefined })}>
              Limpar
            </Button>
          )}
        </div>
      </fieldset>

      <fieldset className="rounded-xl bg-card p-4">
        <legend className="sr-only">Rede</legend>
        <h2 aria-hidden className="mb-3 text-sm font-semibold">
          Rede
        </h2>
        <ul className="flex flex-col gap-2">
          {NETWORKS.map((n) => {
            const id = `${idPrefix}-net-${n.key}`
            return (
              <li key={n.key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={search.networks?.includes(n.key as NetworkKey) ?? false}
                    onCheckedChange={() => onChange({ networks: toggle(search.networks, n.key as NetworkKey) })}
                  />
                  <Label htmlFor={id} className="font-normal">
                    {n.label}
                  </Label>
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">({countOf(facets?.networks, n.key) ?? '–'})</span>
              </li>
            )
          })}
        </ul>
      </fieldset>
    </div>
  )
}
