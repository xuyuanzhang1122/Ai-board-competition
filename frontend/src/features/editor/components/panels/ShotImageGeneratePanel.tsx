import { GenerationSettings } from './GenerationSettings'
import { Button, Empty, Select } from '@lobehub/ui'
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ImageIcon,
  ImagePlus,
  Minus,
  Plus,
  Trash2,
} from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getModelAspectRatios } from '@/features/toolbox/constants/toolbox-models'
import { modelOptionLabel } from '@/shared/components/ModelProviderIcon'

import { assetApi, generationApi, imageUtilApi, jobApi } from '../../api'
import { useModelConfigStore } from '../../model-config-store'
import type { ShotGenerationPanelData } from '../../panel-manager-store'
import { useEditorStore } from '../../store'
import { useAvailableModels } from '../../useAvailableModels'
import { defaultNotifier } from './asset-edit/notifier'
import {
  loadExpiringHistory,
  PANEL_HISTORY_TTL_MS,
  saveExpiringHistory,
  uploadReferenceImage,
} from './generation-helpers'
import { mediaUnavailableMessage } from './panel-target'
import {
  generateShotImages,
  type ShotImageAspectRatio,
  shotImageHistoryKey,
} from './shot-image-generation'
import { usePanelDraft, usePanelTarget } from './usePanelTarget'

interface ShotImageHistoryItem {
  expiresAt: number
  id: string
  imageUrl: string
  jobId: number
  prompt: string
  timestamp: string
}

export interface ShotImageGeneratePanelProps extends ShotGenerationPanelData {
  onClose: () => void
}

export function ShotImageGeneratePanel({ onClose, shotId, shotNo }: ShotImageGeneratePanelProps) {
  const refreshShots = useEditorStore((state) => state.refreshShots)
  const registerGenerationJob = useEditorStore((state) => state.registerGenerationJob)
  const projectId = useEditorStore((state) => state.projectId)
  const configuredModel = useModelConfigStore((state) => state.shotImageModel)
  const { loading: modelsLoading, models } = useAvailableModels('IMAGE')
  const shot = useEditorStore((state) => state.shots.find((item) => item.id === shotId))

  const target = usePanelTarget('image', shotId)
  const unavailableMessage = mediaUnavailableMessage(modelsLoading, models)
  const [model, setModel] = usePanelDraft(target.key, 'model', configuredModel)
  const [aspectRatio, setAspectRatio] = usePanelDraft<ShotImageAspectRatio>(target.key, 'aspectRatio', () =>
    (getModelAspectRatios('IMAGE', configuredModel)[0] || '1:1') as ShotImageAspectRatio,
  )
  const [history, setHistory] = useState<ShotImageHistoryItem[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [quantity, setQuantity] = usePanelDraft(target.key, 'quantity', 1)
  const [referenceImageUrl, setReferenceImageUrl] = usePanelDraft<string | null>(target.key, 'reference', null)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const localInputRef = useRef<HTMLInputElement>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const storageKey = useMemo(() => `${shotImageHistoryKey(shotId)}:${target.key}`, [shotId, target.key])

  useEffect(() => {
    if (models.length === 0) return
    const nextModel = models.some((item) => item.code === model)
      ? model
      : models.find((item) => item.code === configuredModel)?.code || models[0].code
    if (nextModel !== model) setModel(nextModel)
    const ratios = getModelAspectRatios('IMAGE', nextModel)
    if (!ratios.includes(aspectRatio) && ratios[0]) {
      setAspectRatio(ratios[0] as ShotImageAspectRatio)
    }
  }, [aspectRatio, configuredModel, model, models, setAspectRatio, setModel])

  /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect -- panel remount/reset follows the typed panel key and shot identity */
  useEffect(() => {
    setHistory(loadExpiringHistory<ShotImageHistoryItem>(storageKey))
    setPreviewUrl(shot?.shotImage.currentUrl ?? null)
    setSelectedHistoryId(null)
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    return () => abortRef.current?.abort()
  }, [shot?.shotImage.currentUrl, storageKey])
  /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */

  const commitHistory = useCallback(
    (records: ShotImageHistoryItem[]) => {
      setHistory(records)
      saveExpiringHistory(storageKey, records)
    },
    [storageKey],
  )

  const handleGenerate = async () => {
    if (!target.current() || unavailableMessage || !models.some((item) => item.code === model) || !projectId || !shot || !model || isGenerating) {
      if (!projectId || !shot) defaultNotifier.error('分镜数据尚未加载')
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setIsGenerating(true)
    setProgress(0)

    try {
      const results = await generateShotImages(
        {
          additionalReferenceUrls: [referenceImageUrl],
          aspectRatio,
          model,
          projectId,
          quantity,
          shot,
        },
        {
          generateSingleShot: async (...args) => {
            const response = await generationApi.generateSingleShot(...args)
            if (target.current() && response.jobId) registerGenerationJob(response.jobId, 'shot-image', [shotId])
            return response
          },
          getJobStatus: jobApi.getJobStatus,
          mergeImages: imageUtilApi.mergeImages,
          onProgress: (job) => { if (target.current()) setProgress(job.progress ?? 0) },
          signal: abortRef.current.signal,
        },
      )
      if (!target.current() || results.length === 0) return

      const createdAt = Date.now()
      const newRecords = results.flatMap((result) =>
        result.imageUrls.map((imageUrl, index) => ({
          expiresAt: createdAt + PANEL_HISTORY_TTL_MS,
          id: `${result.jobId}_${index}`,
          imageUrl,
          jobId: result.jobId,
          prompt: result.prompt,
          timestamp: new Date(createdAt).toLocaleString('zh-CN'),
        })),
      )
      commitHistory([...newRecords, ...history])
      setPreviewUrl(newRecords[0]?.imageUrl ?? null)
      setSelectedHistoryId(newRecords[0]?.id ?? null)
      if (!target.current()) return
      await refreshShots([shotId])
      if (!target.current()) return
      defaultNotifier.success(`已生成 ${newRecords.length} 张分镜图并自动应用`)
    } catch (error) {
      if (!target.current()) return
      defaultNotifier.error(error instanceof Error ? error.message : '分镜图生成失败')
    } finally {
      if (target.current()) setIsGenerating(false)
    }
  }

  const handleReferenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setIsUploading(true)
    try {
      const url = await uploadReferenceImage(file)
      if (!target.current()) return
      setReferenceImageUrl(url)
      defaultNotifier.success('参考图上传成功')
    } catch (error) {
      if (!target.current()) return
      defaultNotifier.error(error instanceof Error ? error.message : '参考图上传失败')
    } finally {
      if (target.current()) setIsUploading(false)
    }
  }

  const handleLocalUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setIsUploading(true)
    try {
      const imageUrl = await uploadReferenceImage(file)
      if (!target.current()) return
      setPreviewUrl(imageUrl)
      if (shot?.shotImage.assetId) {
        await assetApi.uploadFromUrl(shot.shotImage.assetId, imageUrl)
        if (!target.current()) return
        await refreshShots([shotId])
        if (!target.current()) return
        defaultNotifier.success('本地图片已应用到分镜')
      } else {
        defaultNotifier.warning('图片已上传；分镜资产需先完成一次 AI 生成后才能应用')
      }
    } catch (error) {
      if (!target.current()) return
      defaultNotifier.error(error instanceof Error ? error.message : '本地图片上传失败')
    } finally {
      if (target.current()) setIsUploading(false)
    }
  }

  const selectHistory = async (record: ShotImageHistoryItem) => {
    setPreviewUrl(record.imageUrl)
    setSelectedHistoryId(record.id)
    if (!shot?.shotImage.assetId) {
      defaultNotifier.warning('分镜资产尚未初始化，当前仅预览历史图片')
      return
    }
    try {
      await assetApi.uploadFromUrl(shot.shotImage.assetId, record.imageUrl)
      if (!target.current()) return
      await refreshShots([shotId])
      if (!target.current()) return
      defaultNotifier.success('历史图片已应用到分镜')
    } catch (error) {
      if (!target.current()) return
      defaultNotifier.error(error instanceof Error ? error.message : '应用历史图片失败')
    }
  }

  const removeHistory = (id: string) => {
    commitHistory(history.filter((item) => item.id !== id))
    if (selectedHistoryId === id) setSelectedHistoryId(null)
  }

  const downloadPreview = () => {
    if (!previewUrl) return
    const link = document.createElement('a')
    link.href = previewUrl
    link.download = `shot_${shotNo}_${Date.now()}.jpg`
    link.target = '_blank'
    link.click()
  }

  const copyPreview = async () => {
    if (!previewUrl) return
    try {
      const response = await fetch(previewUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      defaultNotifier.success('图片已复制')
    } catch {
      defaultNotifier.warning('复制失败，请使用下载功能')
    }
  }

  return (
    <section className="media-panel bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button
          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          type="button"
          onClick={onClose}
        >
          <ArrowLeft className="size-4" />
          返回
        </button>
        <h3 className="text-sm font-semibold text-slate-800">分镜 #{shotNo} · 生成图片</h3>
      </header>

      <div className="space-y-6 p-6">
        {unavailableMessage ? <p className="text-sm text-slate-500" role="status">{unavailableMessage}</p> : null}
        <div className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {previewUrl ? (
            <img alt={`分镜 ${shotNo} 预览`} className="size-full object-cover" src={previewUrl} />
          ) : (
            <div className="text-center text-slate-400">
              <ImageIcon className="mx-auto mb-2 size-10" />
              <p className="text-sm">暂无分镜图</p>
            </div>
          )}
          {previewUrl ? (
            <div className="absolute right-3 top-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <Button icon={Download} size="small" title="下载" onClick={downloadPreview} />
              <Button icon={Copy} size="small" title="复制" onClick={() => void copyPreview()} />
              <Button icon={Trash2} size="small" title="清除预览" onClick={() => setPreviewUrl(null)} />
            </div>
          ) : null}
          <input
            accept="image/*"
            className="hidden"
            ref={localInputRef}
            type="file"
            onChange={(event) => void handleLocalUpload(event)}
          />
          <Button
            className="absolute bottom-3 right-3"
            disabled={isUploading}
            size="small"
            onClick={() => localInputRef.current?.click()}
          >
            本地图片
          </Button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">参考图</p>
              <p className="text-xs text-slate-400">角色、场景、道具与手动参考图会合并为一张</p>
            </div>
            <input
              accept="image/*"
              className="hidden"
              ref={referenceInputRef}
              type="file"
              onChange={(event) => void handleReferenceUpload(event)}
            />
            <Button
              icon={ImagePlus}
              loading={isUploading}
              size="small"
              onClick={() => referenceInputRef.current?.click()}
            >
              上传参考图
            </Button>
          </div>
          {referenceImageUrl ? (
            <div className="flex items-center gap-3 rounded-lg bg-white p-2">
              <img alt="手动参考图" className="size-14 rounded object-cover" src={referenceImageUrl} />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-500">已加入素材合并</span>
              <Button size="small" onClick={() => setReferenceImageUrl(null)}>移除</Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center rounded-lg border border-slate-200 bg-white">
            <button
              aria-label="减少生成数量"
              className="p-2 text-slate-500 disabled:opacity-30"
              disabled={quantity <= 1}
              type="button"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            >
              <Minus className="size-4" />
            </button>
            <span className="w-8 text-center text-sm font-medium text-slate-700">{quantity}</span>
            <button
              aria-label="增加生成数量"
              className="p-2 text-slate-500 disabled:opacity-30"
              disabled={quantity >= 10}
              type="button"
              onClick={() => setQuantity((value) => Math.min(10, value + 1))}
            >
              <Plus className="size-4" />
            </button>
          </div>
          <GenerationSettings pending={models.length === 0} summary={models.find((item) => item.code === model)?.name || "尚无可用图片模型"}>
          <Select
            disabled={modelsLoading || models.length === 0}
            options={models.map((item) => ({ label: modelOptionLabel(item), value: item.code }))}
            placeholder="待接入"
            value={model || undefined}
            onChange={(value) => {
              const nextModel = String(value)
              setModel(nextModel)
              const ratios = getModelAspectRatios('IMAGE', nextModel)
              if (ratios[0] && !ratios.includes(aspectRatio)) {
                setAspectRatio(ratios[0] as ShotImageAspectRatio)
              }
            }}
          />
          <Select
            disabled={models.length === 0}
            placeholder="画幅 · 待接入"
            options={getModelAspectRatios('IMAGE', model).map((value) => ({ label: value, value }))}
            value={models.length ? aspectRatio : undefined}
            onChange={(value) => setAspectRatio(String(value) as ShotImageAspectRatio)}
          />
          </GenerationSettings>
          <Button
            disabled={modelsLoading || models.length === 0}
            loading={isGenerating}
            type="primary"
            onClick={() => void handleGenerate()}
          >
            {isGenerating && progress > 0 ? `生成中 ${progress}%` : models.length === 0 ? 'AI 生成图片 · 待接入' : 'AI 生成'}
          </Button>
        </div>

        <div className="border-t border-slate-200 pt-5">
          <h4 className="mb-3 text-sm font-medium text-slate-700">生成历史</h4>
          {history.length === 0 ? (
            <Empty description="暂无生成记录" />
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {history.map((record) => (
                <div
                  key={record.id}
                  className={`group relative aspect-square overflow-hidden rounded-lg border bg-slate-50 ${
                    selectedHistoryId === record.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'
                  }`}
                >
                  <button className="size-full" type="button" onClick={() => void selectHistory(record)}>
                    <img alt="历史分镜图" className="size-full object-cover" src={record.imageUrl} />
                  </button>
                  {selectedHistoryId === record.id ? (
                    <span className="absolute right-1 top-1 rounded-full bg-blue-600 p-1 text-white">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                  <button
                    aria-label="删除历史记录"
                    className="absolute left-1 top-1 rounded bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    type="button"
                    onClick={() => removeHistory(record.id)}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-center text-xs text-rose-500">生成记录保留 7 天，请及时保存</p>
        </div>
      </div>
    </section>
  )
}
