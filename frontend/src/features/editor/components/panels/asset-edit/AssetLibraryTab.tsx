import { Loader2 } from 'lucide-react'

import type { LibraryAsset } from './types'
import { assetTypeLabel } from './useAssetDescriptionParser'

export interface AssetLibraryTabProps {
  assetType: 'character' | 'scene' | 'prop'
  libraryAssets: LibraryAsset[]
  loadingLibraryAssets: boolean
  onSelectImage: (url: string, options?: { prompt?: string | null }) => void
}

export function AssetLibraryTab({
  assetType,
  libraryAssets,
  loadingLibraryAssets,
  onSelectImage,
}: AssetLibraryTabProps) {
  if (loadingLibraryAssets) {
    return (
      <div className="mb-6 py-8 text-center text-slate-500">
        <Loader2 className="mx-auto size-6 animate-spin" />
        <p className="mt-3 text-sm">正在加载{assetTypeLabel(assetType)}库…</p>
      </div>
    )
  }

  if (libraryAssets.length === 0) {
    return (
      <div className="mb-6 py-8 text-center text-slate-500">
        <p className="text-sm">库中暂无{assetTypeLabel(assetType)}</p>
      </div>
    )
  }

  return (
    <div className="mb-6 grid max-h-96 grid-cols-4 gap-3 overflow-y-auto">
      {libraryAssets.map((asset) => {
        const data = asset.data
        const thumbnailUrl = data.thumbnailUrl
        if (!thumbnailUrl) return null

        return (
          <button
            className="group relative aspect-square overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
            key={data.id}
            type="button"
            onClick={() => onSelectImage(thumbnailUrl, { prompt: null })}
          >
            <img
              alt={data.name}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              src={thumbnailUrl}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
              <span className="block truncate text-xs font-medium text-white">{data.name}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
