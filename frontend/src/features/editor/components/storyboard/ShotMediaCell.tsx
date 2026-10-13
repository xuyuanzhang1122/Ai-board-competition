import { ActionIcon, Modal } from '@lobehub/ui'
import { Download, History, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { notify } from '@/shared/feedback/feedback'
import type { AssetStatusVO } from '@/shared/types/api'

import { assetApi } from '../../api'
import { AssetCell } from './AssetCell'

export type ShotMediaType = 'shot-image' | 'video'

interface ShotMediaCellProps {
  asset: AssetStatusVO
  label: string
  mediaType: ShotMediaType
  onDelete: () => void
  onGenerate: () => void
  onOpenVersions: () => void
  posterUrl?: string | null
}

export function ShotMediaCell({
  asset,
  label,
  mediaType,
  onDelete,
  onGenerate,
  onOpenVersions,
  posterUrl,
}: ShotMediaCellProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const download = async () => {
    if (!asset.currentUrl || downloading) return
    setDownloading(true)
    try {
      const blob = await assetApi.downloadAsset(asset.currentUrl)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `${label}-${Date.now()}.${mediaType === 'video' ? 'mp4' : 'jpg'}`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    } catch (error) {
      notify.error(error instanceof Error ? error.message : `${label}下载失败`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex h-[110px] w-[128px] flex-col">
      <AssetCell
        asset={asset}
        label={label}
        mediaType={mediaType}
        posterUrl={posterUrl}
        onDelete={asset.status === 'READY' ? onDelete : undefined}
        onGenerate={onGenerate}
        onOpenVersions={onOpenVersions}
        onPreview={() => setPreviewOpen(true)}
      />
      <div className="mt-1.5 flex h-6 shrink-0 items-center justify-center gap-1">
        {asset.status === 'READY' && asset.currentUrl ? (
          <>
            <ActionIcon icon={History} size="small" title="查看版本" onClick={onOpenVersions} />
            <ActionIcon icon={RefreshCw} size="small" title="重新生成" onClick={onGenerate} />
            <ActionIcon
              disabled={downloading}
              icon={Download}
              size="small"
              title={downloading ? '下载中' : '下载'}
              onClick={() => void download()}
            />
          </>
        ) : null}
      </div>
      {previewOpen && asset.currentUrl ? (
        <Modal centered open footer={null} title={label} width={960} onCancel={() => setPreviewOpen(false)}>
          {mediaType === 'video' ? (
            <video autoPlay controls className="max-h-[75vh] w-full bg-black object-contain" src={asset.currentUrl} />
          ) : (
            <img alt={`${label}预览`} className="max-h-[75vh] w-full object-contain" src={asset.currentUrl} />
          )}
        </Modal>
      ) : null}
    </div>
  )
}
