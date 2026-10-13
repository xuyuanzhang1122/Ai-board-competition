import { Check } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { RechargeProductVO } from '@/shared/types/api'

interface ProductCardProps {
  onSelect: (product: RechargeProductVO) => void
  product: RechargeProductVO
  selected: boolean
}

export function ProductCard({ onSelect, product, selected }: ProductCardProps) {
  const enabled = Boolean(product.enabled)
  const standardPrice = product.points / 10
  const actualPrice = product.priceCents / 100
  const discount = actualPrice < standardPrice ? Math.round((actualPrice / standardPrice) * 100) : null

  return (
    <button
      aria-pressed={selected}
      className="h-full text-left disabled:cursor-not-allowed"
      disabled={!enabled}
      type="button"
      onClick={() => onSelect(product)}
    >
      <Card
        className={cn(
          'relative h-full min-h-56 gap-0 px-5 py-5 shadow-sm transition-all',
          selected
            ? 'border-primary bg-primary/[0.03] ring-2 ring-primary'
            : 'hover:-translate-y-0.5 hover:shadow-md',
          !enabled && 'opacity-50',
        )}
      >
        {discount && enabled ? (
          <span className="absolute right-4 top-4 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
            {discount}折
          </span>
        ) : null}
        <h3 className="pr-14 text-lg font-semibold text-foreground">{product.name}</h3>
        <div className="mt-6 flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tight text-foreground">
            {product.points.toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">积分</span>
        </div>
        <div className="mt-4 flex items-baseline gap-1 text-foreground">
          <span className="text-sm">¥</span>
          <span className="text-2xl font-semibold tabular-nums">{actualPrice.toFixed(2)}</span>
        </div>
        {product.description ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{product.description}</p>
        ) : null}
        {selected ? (
          <span className="absolute bottom-4 right-4 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check aria-hidden className="size-4" strokeWidth={3} />
          </span>
        ) : null}
      </Card>
    </button>
  )
}
