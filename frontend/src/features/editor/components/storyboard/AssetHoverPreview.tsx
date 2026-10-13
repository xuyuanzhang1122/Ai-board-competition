import { ImageOff } from 'lucide-react'
import { createPortal } from 'react-dom'

import { calculateHoverPosition, type HoverPreviewState } from './hover-preview'

interface AssetHoverPreviewProps extends Omit<HoverPreviewState, 'key'> {
  placement?: 'cursor' | 'fixed'
  variant?: 'compact' | 'detail'
}

export function AssetHoverPreview({
  description,
  imageUrl,
  name,
  placement = 'cursor',
  variant = 'compact',
  visible,
  x,
  y,
}: AssetHoverPreviewProps) {
  if (!visible || typeof document === 'undefined') return null

  const compact = variant === 'compact'
  const width = compact ? 420 : 760
  const { left, top } = calculateHoverPosition({
    estimatedHeight: compact ? 470 : 560,
    offset: placement === 'fixed' ? 0 : 16,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
    width,
    x,
    y,
  })

  return createPortal(
    <aside
      aria-label={`${name}预览`}
      className="pointer-events-none fixed z-[1000] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      style={{ left, top, width }}
    >
      <div className={compact ? 'p-2' : 'grid grid-cols-[minmax(0,1.35fr)_minmax(220px,0.65fr)] gap-3 p-3'}>
        <div
          className={`${compact ? 'h-[390px]' : 'h-[500px]'} flex items-center justify-center overflow-hidden rounded-lg bg-slate-50`}
        >
          {imageUrl ? (
            <img alt={name} className="size-full bg-white object-contain" src={imageUrl} />
          ) : (
            <ImageOff aria-hidden className="size-12 text-slate-300" />
          )}
        </div>
        <div className={compact ? 'px-3 py-3 text-center' : 'max-h-[500px] min-w-0 overflow-y-auto p-2'}>
          <h4 className="text-sm font-semibold leading-6 text-slate-900">
            {compact ? name : `名称：${name}`}
          </h4>
          {!compact ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
              {description || '暂无简介'}
            </p>
          ) : null}
        </div>
      </div>
    </aside>,
    document.body,
  )
}
