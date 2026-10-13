import type { AssetStatusVO } from '@/shared/types/api'

export type AssetClickIntent = 'generate' | 'none' | 'versions'

export const ASSET_STATUS_PRESENTATION = {
  FAILED: {
    borderClass: 'border-red-300',
    label: '生成失败',
    textClass: 'text-red-600',
  },
  GENERATING: {
    borderClass: 'border-blue-200',
    label: '生成中',
    textClass: 'text-blue-600',
  },
  NONE: {
    borderClass: 'border-slate-200',
    label: '待生成',
    textClass: 'text-slate-500',
  },
  READY: {
    borderClass: 'border-emerald-300',
    label: '已完成',
    textClass: 'text-emerald-700',
  },
} satisfies Record<AssetStatusVO['status'], Record<string, string>>

export const getAssetClickIntent = (asset: AssetStatusVO): AssetClickIntent => {
  if (asset.status === 'READY') return 'versions'
  if (asset.status === 'NONE' || asset.status === 'FAILED') return 'generate'
  return 'none'
}

export const canRegenerateAsset = (asset: AssetStatusVO) =>
  asset.status === 'READY' || asset.status === 'FAILED'

