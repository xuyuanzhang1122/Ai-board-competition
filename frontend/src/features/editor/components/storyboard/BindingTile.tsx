import { ActionIcon } from '@lobehub/ui'
import { ImageOff, X } from 'lucide-react'

import { AssetHoverPreview } from './AssetHoverPreview'
import { useHoverPreview } from './useHoverPreview'

interface BindingTileProps {
  description?: string | null
  imageUrl?: string | null
  name: string
  onClick: () => void
  onRemove?: () => void
  previewKey: string
  previewVariant?: 'compact' | 'detail'
}

export function BindingTile({
  description,
  imageUrl,
  name,
  onClick,
  onRemove,
  previewKey,
  previewVariant = 'compact',
}: BindingTileProps) {
  const { hidePreview, movePreview, preview, showPreview } = useHoverPreview()
  const pending = preview.key === previewKey && !preview.visible
  const { key: _previewKey, ...previewProps } = preview

  return (
    <div
      className="group/tile relative aspect-square min-w-0"
      onMouseLeave={hidePreview}
      onMouseMove={movePreview}
      onMouseEnter={(event) =>
        showPreview(event, { description, imageUrl, key: previewKey, name })
      }
    >
      <button
        className="flex size-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition hover:border-slate-300 hover:bg-slate-100"
        title={name}
        type="button"
        onClick={onClick}
      >
        {imageUrl ? (
          <img
            alt={name}
            className="size-full object-cover transition-transform group-hover/tile:scale-105"
            decoding="async"
            loading="lazy"
            src={imageUrl}
          />
        ) : (
          <ImageOff aria-hidden className="size-5 text-slate-300" />
        )}
        {pending ? <span className="asset-thumb-wiper absolute inset-0" /> : null}
      </button>
      {onRemove ? (
        <ActionIcon
          className="!absolute -right-1 -top-1 opacity-0 transition-opacity group-hover/tile:opacity-100"
          color="red"
          icon={X}
          size="small"
          title={`移除${name}`}
          variant="filled"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        />
      ) : null}
      <AssetHoverPreview {...previewProps} variant={previewVariant} />
    </div>
  )
}
