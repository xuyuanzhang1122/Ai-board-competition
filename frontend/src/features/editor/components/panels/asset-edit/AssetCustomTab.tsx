import { Button, Select, TextArea } from '@lobehub/ui'
import { ImagePlus, Loader2, RefreshCw } from 'lucide-react'
import type React from 'react'
import { useRef, useState } from 'react'

import {
  getModelAspectRatios,
} from '@/features/toolbox/constants/toolbox-models'
import { modelOptionLabel } from '@/shared/components/ModelProviderIcon'
import type { ModelVO } from '@/shared/types/api'

import { uploadReferenceImage } from '../generation-helpers'
import { defaultNotifier } from './notifier'
import type { EditableAssetType } from './types'
import { assetTypeLabel } from './useAssetDescriptionParser'

export interface AssetCustomTabProps {
  aiDescription: string
  aspectRatio: string
  assetType: EditableAssetType
  isGenerating: boolean
  isParsing: boolean
  modelCode: string
  models: ModelVO[]
  modelsLoading: boolean
  onAiDescriptionChange: (value: string) => void
  onAspectRatioChange: (value: string) => void
  onGenerate: () => void
  onModelChange: (value: string) => void
  onReferenceImageChange: (url: string | null, file?: File | null) => void
  onRetryParse: () => void
  parseError: boolean
  projectId?: number | null
  referenceImageUrl?: string | null
}

export function AssetCustomTab({
  aiDescription,
  aspectRatio,
  assetType,
  isGenerating,
  isParsing,
  modelCode,
  models,
  modelsLoading,
  onAiDescriptionChange,
  onAspectRatioChange,
  onGenerate,
  onModelChange,
  onReferenceImageChange,
  onRetryParse,
  parseError,
  projectId,
  referenceImageUrl,
}: AssetCustomTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingReference, setIsUploadingReference] = useState(false)

  const ratioOptions = getModelAspectRatios('IMAGE', modelCode).map((ratio) => ({
    label: ratio,
    value: ratio,
  }))

  const canGenerate =
    !isGenerating &&
    !isParsing &&
    !modelsLoading &&
    models.length > 0 &&
    (assetType === 'prop' || Boolean(aiDescription.trim())) &&
    Boolean(projectId) &&
    Boolean(modelCode)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    setIsUploadingReference(true)
    try {
      const url = await uploadReferenceImage(file)
      onReferenceImageChange(url, file)
      defaultNotifier.success('参考图上传成功')
    } catch (error) {
      defaultNotifier.error(error instanceof Error ? error.message : '参考图上传失败')
    } finally {
      setIsUploadingReference(false)
    }
  }

  const clearReferenceImage = () => {
    if (referenceImageUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(referenceImageUrl)
    }
    onReferenceImageChange(null)
  }

  return (
    <div className="mb-6 space-y-3">
      <div className="flex gap-3">
        <div className="shrink-0">
          <input
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            type="file"
            onChange={(event) => void handleFileChange(event)}
          />
          {referenceImageUrl ? (
            <div className="group relative size-28 overflow-hidden rounded-lg border border-slate-200">
              <img
                alt="AI 参考图"
                className="size-full object-cover"
                src={referenceImageUrl}
              />
              <button
                className="absolute right-1 top-1 rounded bg-red-500/80 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                type="button"
                onClick={clearReferenceImage}
              >
                删除
              </button>
            </div>
          ) : (
            <button
              className="flex size-28 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
              disabled={isUploadingReference}
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="size-8" />
              <span className="mt-2 text-xs">
                {isUploadingReference ? '上传中…' : '上传AI参考图'}
              </span>
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-end gap-2">
          <Select
            disabled={modelsLoading || models.length === 0}
            options={models.map((model) => ({ label: modelOptionLabel(model), value: model.code }))}
            style={{ width: '100%' }}
            value={modelCode}
            onChange={(value) => onModelChange(String(value))}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(96px,120px)] gap-2">
            <Button
              block
              disabled={!canGenerate}
              loading={isGenerating}
              type="primary"
              onClick={() => void onGenerate()}
            >
              AI 生成
            </Button>
            <Select
              options={ratioOptions}
              style={{ width: '100%' }}
              value={aspectRatio}
              onChange={(value) => onAspectRatioChange(String(value))}
            />
          </div>
          <span className="text-xs text-slate-400">
            参赛免费
          </span>
        </div>
      </div>

      <div className="relative">
        {isParsing ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-slate-100/80">
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm font-medium">
                AI正在解析
                {assetType === 'scene'
                  ? '场景环境'
                  : assetType === 'prop'
                    ? '道具外观'
                    : '人物形象'}
                …
              </span>
            </div>
          </div>
        ) : null}

        <TextArea
          className="w-full"
          disabled={isParsing}
          placeholder={`填写用于AI生图的${assetTypeLabel(assetType)}描述`}
          resize={false}
          rows={8}
          style={{ minHeight: 178 }}
          value={aiDescription}
          onChange={(event) => onAiDescriptionChange(event.target.value)}
        />

        {parseError ? (
          <button
            className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            type="button"
            onClick={onRetryParse}
          >
            <RefreshCw className="size-3.5" />
            重试解析
          </button>
        ) : null}
      </div>
    </div>
  )
}
