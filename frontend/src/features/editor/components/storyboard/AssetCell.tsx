import { ActionIcon } from '@lobehub/ui'
import { CircleAlert, ImageOff, LoaderCircle, PlayCircle, Trash2 } from 'lucide-react'

import type { AssetStatusVO } from '@/shared/types/api'

import { ASSET_STATUS_PRESENTATION, getAssetClickIntent } from './asset-state'

interface AssetCellProps {
  asset: AssetStatusVO
  label: string
  mediaType: 'shot-image' | 'video'
  onDelete?: () => void
  onGenerate?: () => void
  onOpenVersions?: () => void
  onPreview?: () => void
  posterUrl?: string | null
}

interface VideoThumbnailProps {
  label: string
  posterUrl?: string | null
}

// The list never mounts a <video>: hundreds of decode contexts were a major
// driver of the multi-GB memory usage. It shows the shot image as a poster with
// a play affordance; the real player is only mounted in the preview modal once
// the user clicks the cell.
function VideoThumbnail({ label, posterUrl }: VideoThumbnailProps) {
  if (posterUrl) {
    return (
      <div className="relative size-full">
        <img
          alt={`${label}缩略图`}
          className="pointer-events-none block size-full object-cover"
          decoding="async"
          loading="lazy"
          src={posterUrl}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <PlayCircle aria-hidden className="size-6 text-white/90 drop-shadow" />
        </span>
      </div>
    )
  }
  return (
    <span className="flex size-full items-center justify-center">
      <PlayCircle aria-hidden className="size-6 text-slate-400" />
    </span>
  )
}

export function AssetCell({
  asset,
  label,
  mediaType,
  onDelete,
  onGenerate,
  onOpenVersions,
  onPreview,
  posterUrl,
}: AssetCellProps) {
  const presentation = ASSET_STATUS_PRESENTATION[asset.status]
  const intent = getAssetClickIntent(asset)
  const handleClick = () => {
    if (intent === 'versions') {
      if (onPreview) onPreview()
      else onOpenVersions?.()
    }
    else if (intent === 'generate') onGenerate?.()
  }

  return (
    <div
      className={`group relative h-20 w-full shrink-0 overflow-hidden rounded-lg border bg-white transition hover:bg-slate-50 ${presentation.borderClass}`}
      title={`${presentation.label} · ${asset.totalVersions} 个版本`}
    >
      <button
        aria-label={`${label}：${presentation.label}`}
        className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 disabled:cursor-wait"
        disabled={intent === 'none'}
        type="button"
        onClick={handleClick}
      >
        {asset.status === 'READY' && asset.currentUrl ? (
          mediaType === 'video' ? (
            <VideoThumbnail key={asset.currentUrl} label={label} posterUrl={posterUrl} />
          ) : (
            <img
              alt={label}
              className="block size-full object-cover"
              decoding="async"
              loading="lazy"
              src={asset.currentUrl}
            />
          )
        ) : asset.status === 'GENERATING' ? (
          <LoaderCircle aria-hidden className="size-5 animate-spin text-blue-500" />
        ) : asset.status === 'FAILED' ? (
          <CircleAlert aria-hidden className="size-5 text-red-500" />
        ) : (
          <ImageOff aria-hidden className="size-5 text-slate-400" />
        )}
        {asset.status !== 'READY' ? (
          <span className={`text-[11px] font-medium ${presentation.textClass}`}>
            {presentation.label}
          </span>
        ) : null}
      </button>
      {asset.status === 'READY' && onDelete ? (
        <ActionIcon
          className="!absolute left-1 top-1 opacity-0 transition-opacity group-hover:opacity-100"
          color="red"
          icon={Trash2}
          size="small"
          title={`删除${label}`}
          variant="filled"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        />
      ) : null}
    </div>
  )
}
