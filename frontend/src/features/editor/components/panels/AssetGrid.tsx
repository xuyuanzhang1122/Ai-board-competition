import { Empty } from '@lobehub/ui'
import { LoaderCircle, type LucideIcon } from 'lucide-react'
import { useRef } from 'react'

import { AssetHoverPreview } from '../storyboard/AssetHoverPreview'
import { useHoverPreview } from '../storyboard/useHoverPreview'
import type { DefaultPanelAsset } from './default-panel-assets'

interface AssetGridProps<T extends DefaultPanelAsset> {
  assets: readonly T[]
  emptyDescription: string
  fallbackIcon: LucideIcon
  onAssetClick: (asset: T) => void
}

export function AssetGrid<T extends DefaultPanelAsset>({
  assets,
  emptyDescription,
  fallbackIcon: FallbackIcon,
  onAssetClick,
}: AssetGridProps<T>) {
  const hover = useHoverPreview()
  const panelRef = useRef<HTMLDivElement>(null)
  const { key: _previewKey, ...previewProps } = hover.preview

  const fixedPreviewPosition = () => {
    const panel = panelRef.current?.closest('aside') ?? panelRef.current
    const rect = panel?.getBoundingClientRect()
    return {
      x: Math.max(12, (rect?.left ?? window.innerWidth) - 760 - 12),
      y: Math.max(12, (rect?.top ?? 0) + 12),
    }
  }

  if (assets.length === 0) {
    return <Empty className="py-16" description={emptyDescription} />
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3 p-4" ref={panelRef}>
        {assets.map((asset) => {
          const hoverKey = `${asset.assetType}-${asset.id}`
          const pending = hover.preview.key === hoverKey && !hover.preview.visible

          return (
            <button
              className="group min-w-0 cursor-pointer text-left"
              key={hoverKey}
              title={asset.name}
              type="button"
              onClick={() => onAssetClick(asset)}
              onMouseLeave={hover.hidePreview}
              onMouseEnter={() => {
                const position = fixedPreviewPosition()
                hover.showPreviewAt({
                  description: asset.description,
                  imageUrl: asset.imageUrl,
                  key: hoverKey,
                  name: asset.name,
                  ...position,
                })
              }}
              onMouseMove={() => {
                const position = fixedPreviewPosition()
                hover.movePreviewTo(position.x, position.y)
              }}
            >
              <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition group-hover:border-slate-300 group-hover:shadow-sm">
                {asset.imageUrl ? (
                  <img
                    alt={asset.name}
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    src={asset.imageUrl}
                  />
                ) : (
                  <FallbackIcon aria-hidden className="size-7 text-slate-300" />
                )}
                {pending ? (
                  <span className="asset-thumb-wiper absolute inset-0" />
                ) : null}
                {asset.isGenerating ? (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900/45 text-white backdrop-blur-[1px]">
                    <LoaderCircle aria-hidden className="size-5 animate-spin" />
                    <span className="text-[11px] font-medium">生成中</span>
                  </span>
                ) : null}
                {asset.assetType === 'character' && asset.isActive ? (
                  <span
                    aria-label="主角"
                    className="absolute right-1.5 top-1.5 size-2.5 rounded-full border-2 border-white bg-emerald-400 shadow-sm"
                  />
                ) : null}
              </span>
              <span className="mt-1.5 block truncate text-center text-xs font-medium text-slate-700">
                {asset.name}
              </span>
            </button>
          )
        })}
      </div>

      <AssetHoverPreview {...previewProps} placement="fixed" variant="detail" />
    </>
  )
}
