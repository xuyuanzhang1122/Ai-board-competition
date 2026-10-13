import { Modal } from '@lobehub/ui'
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ImageIcon,
  Loader2,
  Maximize2,
  Package,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  getDefaultAspectRatio,
  getModelAspectRatios,
} from '@/features/toolbox/constants/toolbox-models'

import { useModelConfigStore } from '../../../model-config-store'
import type { AssetEditPanelData } from '../../../panel-manager-store'
import { useEditorStore } from '../../../store'
import { useAvailableModels } from '../../../useAvailableModels'
import { AssetCustomTab } from './AssetCustomTab'
import { AssetLocalTab } from './AssetLocalTab'
import type { AssetEditTab, CombinedHistoryItem, EditableAssetType } from './types'
import { assetTypeLabel, useAssetDescriptionParser } from './useAssetDescriptionParser'
import { DEFAULT_MODELS, useAssetGeneration } from './useAssetGeneration'
import { useAssetHistory } from './useAssetHistory'
import { aggregateSameNameAssetIds } from './useAssetLibraryAssets'
import { useAssetThumbnailMutation } from './useAssetThumbnailMutation'

export interface AssetEditPanelProps extends AssetEditPanelData {
  onClose: () => void
}

const ASSET_ICONS: Record<EditableAssetType, typeof ImageIcon> = {
  character: User,
  prop: Package,
  scene: ImageIcon,
}

interface PreviewImage {
  prompt?: string | null
  title: string
  url: string
}

export function AssetEditPanel({
  assetId,
  assetType: rawAssetType,
  characterName,
  existingDescription,
  existingThumbnailUrl,
  name,
  onClose,
  prefillDescription,
  propName,
  sceneName,
  scriptText,
  shotId,
}: AssetEditPanelProps) {
  const projectId = useEditorStore((state) => state.projectId)

  const assetType: EditableAssetType =
    rawAssetType === 'character' || rawAssetType === 'scene' || rawAssetType === 'prop'
      ? rawAssetType
      : 'character'
  const isRestoredGenerating = useEditorStore((state) =>
    Boolean(
      assetId &&
        state.activeJobs.some(
          (job) => job.kind === assetType && job.targetIds.includes(assetId),
        ),
    ),
  )

  const assetName = useMemo(
    () => characterName || sceneName || propName || name || '',
    [characterName, name, propName, sceneName],
  )

  const FallbackIcon = ASSET_ICONS[assetType]
  const typeLabel = assetTypeLabel(assetType)

  const [activeTab, setActiveTab] = useState<AssetEditTab>('custom')
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null)
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const configuredCharacterModel = useModelConfigStore((state) => state.characterImageModel)
  const configuredSceneModel = useModelConfigStore((state) => state.sceneImageModel)
  const languageModel = useModelConfigStore((state) => state.languageModel)
  const configuredImageModel =
    assetType === 'character'
      ? configuredCharacterModel
      : configuredSceneModel || DEFAULT_MODELS[assetType]
  const { loading: modelsLoading, models: imageModels } = useAvailableModels('IMAGE')
  const [modelCode, setModelCode] = useState(configuredImageModel)
  const [aspectRatio, setAspectRatio] = useState(() => {
    const ratios = getModelAspectRatios('IMAGE', configuredImageModel)
    return ratios[0] || getDefaultAspectRatio('IMAGE')
  })

  const { aiDescription, isParsing, parseError, retry, setAiDescription } = useAssetDescriptionParser({
    assetName,
    assetType,
    existingDescription,
    languageModel,
    prefillDescription,
    projectId,
    scriptText: scriptText || '',
  })

  /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
  useEffect(() => {
    setActiveTab('custom')
    setReferenceImageUrl(null)
  }, [assetId, assetType])

  useEffect(() => {
    if (imageModels.length === 0) return
    const nextModel = imageModels.some((model) => model.code === modelCode)
      ? modelCode
      : imageModels.find((model) => model.code === configuredImageModel)?.code || imageModels[0].code
    if (nextModel !== modelCode) setModelCode(nextModel)
    const ratios = getModelAspectRatios('IMAGE', nextModel)
    if (!ratios.includes(aspectRatio) && ratios[0]) setAspectRatio(ratios[0])
  }, [aspectRatio, configuredImageModel, imageModels, modelCode])
  /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */

  const handleCreatedAssetId = useCallback(() => {
    // 通过 onCreatedAssetId 让父层/同层刷新 sameNameAssetIds 等数据
    setRefreshKey((key) => key + 1)
  }, [])

  const {
    generate,
    generatedImageUrl,
    isGenerating,
    setGeneratedImageUrl,
  } = useAssetGeneration({
    aiDescription,
    aspectRatio,
    assetId,
    assetName,
    assetType,
    model: modelCode,
    onCreatedAssetId: handleCreatedAssetId,
    projectId,
    shotId,
  })
  const isGeneratingNow = isGenerating || isRestoredGenerating

  const { history, loadingHistory, loadHistory } = useAssetHistory(
    assetType,
    assetName,
    assetId,
    projectId,
    shotId,
  )

  const handleThumbnailUpdated = useCallback(() => {
    setRefreshKey((key) => key + 1)
  }, [])

  const { deleteGeneratedImage, selectImage } = useAssetThumbnailMutation({
    assetId,
    assetType,
    onThumbnailUpdated: handleThumbnailUpdated,
    projectId,
  })

  useEffect(() => {
    void loadHistory()
  }, [loadHistory, refreshKey])

  useEffect(() => {
    if (existingThumbnailUrl) {
      setGeneratedImageUrl(existingThumbnailUrl)
    }
  }, [existingThumbnailUrl, setGeneratedImageUrl])

  const handleSelectImage = useCallback(
    async (url: string, options?: { prompt?: string | null }) => {
      setGeneratedImageUrl('')
      // 强制响应式刷新
      await Promise.resolve()
      setGeneratedImageUrl(url)

      if (options?.prompt && options.prompt !== '本地上传') {
        setAiDescription(options.prompt)
      }

      try {
        await selectImage(url, { prompt: options?.prompt ?? null })
      } finally {
        setRefreshKey((key) => key + 1)
      }
    },
    [selectImage, setAiDescription, setGeneratedImageUrl],
  )

  const handleDeleteHistory = useCallback(
    (record: CombinedHistoryItem) => {
      if (record.source !== 'local') return
      const store = useEditorStore.getState()
      const sameNameAssetIds = aggregateSameNameAssetIds(
        assetType,
        assetName,
        assetId,
        store.characters,
        store.scenes,
        store.props,
      )
      for (const id of sameNameAssetIds) {
        const localHistory = store.getLocalImageHistory(assetType, id, shotId)
        const match = localHistory.find((item) => item.id === record.id)
        if (match) {
          store.deleteLocalImageHistory(assetType, id, record.id, shotId)
          setRefreshKey((key) => key + 1)
          break
        }
      }
    },
    [assetId, assetName, assetType, shotId],
  )

  const handleDownloadImage = useCallback(() => {
    if (!generatedImageUrl) return
    const link = document.createElement('a')
    link.href = generatedImageUrl
    link.download = `${assetType}_${Date.now()}.jpg`
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [assetType, generatedImageUrl])

  const handleCopyImage = useCallback(async () => {
    if (!generatedImageUrl) return
    try {
      const response = await fetch(generatedImageUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    } catch (error) {
      console.error('复制图片失败:', error)
    }
  }, [generatedImageUrl])

  const handleDeleteGeneratedImage = useCallback(() => {
    setGeneratedImageUrl(null)
    deleteGeneratedImage()
  }, [deleteGeneratedImage, setGeneratedImageUrl])

  const handleOpenPreview = useCallback((image: PreviewImage) => {
    setPreviewImage(image)
  }, [])

  const handleGenerate = useCallback(async () => {
    try {
      await generate()
      setRefreshKey((key) => key + 1)
    } catch (error) {
      console.error('生成失败:', error)
    }
  }, [generate])

  const handleUploadComplete = useCallback(() => {
    setRefreshKey((key) => key + 1)
  }, [])

  const tabButtonClass = (tab: AssetEditTab) =>
    [
      'rounded px-6 py-2.5 text-sm font-medium transition-all',
      activeTab === tab
        ? 'border border-slate-200 bg-slate-100 text-slate-800'
        : 'border border-transparent text-slate-500 hover:bg-slate-50',
    ].join(' ')

  return (
    <section className="flex h-full flex-col bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            type="button"
            onClick={onClose}
          >
            <ArrowLeft className="size-5" />
          </button>
          <h3 className="text-base font-medium text-slate-800">
            {assetName ? `${typeLabel}: ${assetName}` : `返回${typeLabel}列表`}
          </h3>
        </div>
        <button
          className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
          type="button"
          onClick={onClose}
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="group relative mb-6 flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-200 bg-slate-50">
          {generatedImageUrl ? (
            <>
              <button
                className="size-full cursor-zoom-in"
                title="查看大图"
                type="button"
                onClick={() =>
                  handleOpenPreview({
                    title: assetName ? `${typeLabel}: ${assetName}` : `${typeLabel}图片`,
                    url: generatedImageUrl,
                  })
                }
              >
                <img
                  alt={`${typeLabel}图片`}
                  className="size-full object-cover"
                  src={generatedImageUrl}
                />
              </button>
              <div className="absolute right-3 top-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  className="rounded-lg bg-slate-800 p-2 text-white hover:bg-slate-700"
                  title="查看大图"
                  type="button"
                  onClick={() =>
                    handleOpenPreview({
                      title: assetName ? `${typeLabel}: ${assetName}` : `${typeLabel}图片`,
                      url: generatedImageUrl,
                    })
                  }
                >
                  <Maximize2 className="size-5" />
                </button>
                <button
                  className="rounded-lg bg-slate-800 p-2 text-white hover:bg-slate-700"
                  title="下载图片"
                  type="button"
                  onClick={handleDownloadImage}
                >
                  <Download className="size-5" />
                </button>
                <button
                  className="rounded-lg bg-slate-800 p-2 text-white hover:bg-slate-700"
                  title="复制图片"
                  type="button"
                  onClick={() => void handleCopyImage()}
                >
                  <Copy className="size-5" />
                </button>
                <button
                  className="rounded-lg bg-slate-800 p-2 text-white hover:bg-slate-700"
                  title="删除图片"
                  type="button"
                  onClick={handleDeleteGeneratedImage}
                >
                  <Trash2 className="size-5" />
                </button>
              </div>
            </>
          ) : (
            <>
              <FallbackIcon className="mb-3 size-16 text-slate-200" />
              <p className="text-sm font-medium text-slate-400">暂无{typeLabel}图片</p>
              <p className="text-xs text-slate-400">编辑下方描述后点击生成</p>
            </>
          )}
          {isGeneratingNow ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/45 text-white backdrop-blur-[1px]">
              <Loader2 className="size-6 animate-spin" />
              <span className="text-sm font-medium">{typeLabel}图片生成中</span>
            </div>
          ) : null}
        </div>

        <div className="mb-4 flex gap-3">
          <button className={tabButtonClass('custom')} type="button" onClick={() => setActiveTab('custom')}>
            新{typeLabel}
          </button>
          <button className={tabButtonClass('local')} type="button" onClick={() => setActiveTab('local')}>
            本地图片
          </button>
        </div>

        {activeTab === 'custom' ? (
          <AssetCustomTab
            aiDescription={aiDescription}
            aspectRatio={aspectRatio}
            assetType={assetType}
            isGenerating={isGeneratingNow}
            isParsing={isParsing}
            modelCode={modelCode}
            models={imageModels}
            modelsLoading={modelsLoading}
            parseError={parseError}
            projectId={projectId}
            referenceImageUrl={referenceImageUrl ?? undefined}
            onAiDescriptionChange={setAiDescription}
            onAspectRatioChange={setAspectRatio}
            onGenerate={handleGenerate}
            onRetryParse={retry}
            onModelChange={(nextModel) => {
              setModelCode(nextModel)
              const ratios = getModelAspectRatios('IMAGE', nextModel)
              if (!ratios.includes(aspectRatio) && ratios[0]) setAspectRatio(ratios[0])
            }}
            onReferenceImageChange={(url) => {
              setReferenceImageUrl(url)
            }}
          />
        ) : null}

        {activeTab === 'local' ? (
          <AssetLocalTab
            aiDescription={aiDescription}
            assetId={assetId}
            assetName={assetName}
            assetType={assetType}
            projectId={projectId}
            shotId={shotId}
            onCreatedAssetId={handleCreatedAssetId}
            onUploadComplete={handleUploadComplete}
          />
        ) : null}

        <div className="mt-6">
          <h4 className="mb-3 text-sm font-medium text-slate-700">生成历史</h4>
          {loadingHistory ? (
            <div className="py-8 text-center text-slate-500">加载中…</div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">暂无生成历史</div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {history.map((item) => (
                <div
                  className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-slate-200"
                  key={`${item.source}_${item.id}`}
                >
                  <button
                    className="size-full"
                    title="查看大图"
                    type="button"
                    onClick={() =>
                      handleOpenPreview({
                        prompt: item.prompt,
                        title: `${typeLabel}历史图片`,
                        url: item.url,
                      })
                    }
                  >
                    <img
                      alt="历史图片"
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      src={item.url}
                    />
                  </button>
                  <button
                    className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded bg-slate-900/80 px-1.5 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity hover:bg-slate-800 group-hover:opacity-100"
                    title="设为当前图片"
                    type="button"
                    onClick={() => void handleSelectImage(item.url, { prompt: item.prompt })}
                  >
                    <Check className="size-3" />
                    设为当前
                  </button>
                  {item.source === 'local' ? (
                    <button
                      className="absolute right-1 top-1 rounded bg-slate-800/80 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      title="删除"
                      type="button"
                      onClick={() => handleDeleteHistory(item)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        centered
        footer={null}
        open={Boolean(previewImage)}
        title={previewImage?.title ?? '图片预览'}
        width={920}
        onCancel={() => setPreviewImage(null)}
      >
        {previewImage ? (
          <div className="space-y-3">
            <div className="flex max-h-[72vh] items-center justify-center overflow-auto rounded bg-slate-950">
              <img
                alt={previewImage.title}
                className="max-h-[72vh] max-w-full object-contain"
                src={previewImage.url}
              />
            </div>
            {previewImage.prompt ? (
              <p className="max-h-28 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                {previewImage.prompt}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </section>
  )
}
