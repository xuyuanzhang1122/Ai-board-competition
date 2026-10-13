import { ActionIcon, Image, Select, Tag } from '@lobehub/ui'
import { ChatInputArea } from '@lobehub/ui/chat'
import { useQuery } from '@tanstack/react-query'
import { App } from 'antd'
import { FileText, ImageIcon, ImagePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { uploadApi } from '@/shared/api/upload'
import { modelOptionLabel } from '@/shared/components/ModelProviderIcon'

import { toolboxApi } from '../api'
import {
  getAspectRatioLabel,
  getImageBackgrounds,
  getImageMaxCount,
  getImageOutputFormats,
  getImageQualities,
  getModelAspectRatios,
  getVideoDurations,
} from '../constants/toolbox-models'
import {
  selectEstimatedCost,
  selectIsGenerating,
  type ToolboxInputType,
  useToolboxStore,
} from '../store'

const TYPE_OPTIONS = [
  {
    label: (
      <span className="flex items-center gap-1.5">
        <FileText className="size-3.5" />文字
      </span>
    ),
    value: 'TEXT',
  },
  {
    label: (
      <span className="flex items-center gap-1.5">
        <ImageIcon className="size-3.5" />图片
      </span>
    ),
    value: 'IMAGE',
  },
]

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export function ChatComposer() {
  const { message } = App.useApp()
  const currentInput = useToolboxStore((state) => state.currentInput)
  const setCurrentInput = useToolboxStore((state) => state.setCurrentInput)
  const updateInputType = useToolboxStore((state) => state.updateInputType)
  const generateWithConversation = useToolboxStore((state) => state.generateWithConversation)
  const isGenerating = useToolboxStore(selectIsGenerating)
  const estimatedCost = useToolboxStore(selectEstimatedCost)

  const [referenceImageUrl, setReferenceImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    data: models = [],
    isLoading: modelsLoading,
    isError: modelsError,
    error: modelsErrorObj,
  } = useQuery({
    queryKey: ['toolbox-models', currentInput.type],
    queryFn: () => toolboxApi.getModels(currentInput.type),
  })

  useEffect(() => {
    if (modelsLoading || models.length === 0) return
    const model = models.some((item) => item.code === currentInput.model)
      ? currentInput.model
      : models[0].code
    const patch: Partial<typeof currentInput> = {}
    if (model !== currentInput.model) patch.model = model
    if (currentInput.type !== 'TEXT') {
      const ratios = getModelAspectRatios(currentInput.type, model)
      if (!ratios.includes(currentInput.aspectRatio) && ratios[0]) patch.aspectRatio = ratios[0]
    }
    if (currentInput.type === 'VIDEO') {
      const durations = getVideoDurations(model)
      if (!durations.includes(currentInput.duration) && durations[0]) patch.duration = durations[0]
    }
    if (currentInput.type === 'IMAGE') {
      const qualities = getImageQualities(model)
      if (!qualities.some((item) => item.value === currentInput.quality) && qualities[0]) {
        patch.quality = qualities[0].value
      }
      const outputFormats = getImageOutputFormats(model)
      if (!outputFormats.includes(currentInput.outputFormat) && outputFormats[0]) {
        patch.outputFormat = outputFormats[0]
      }
      const backgrounds = getImageBackgrounds(model)
      if (!backgrounds.some((item) => item.value === currentInput.background) && backgrounds[0]) {
        patch.background = backgrounds[0].value
      }
      if (currentInput.count > getImageMaxCount(model)) patch.count = 1
    }
    if (Object.keys(patch).length > 0) setCurrentInput(patch)
  }, [
    currentInput.aspectRatio,
    currentInput.background,
    currentInput.count,
    currentInput.duration,
    currentInput.model,
    currentInput.outputFormat,
    currentInput.quality,
    currentInput.type,
    models,
    modelsLoading,
    setCurrentInput,
  ])

  useEffect(() => {
    if (modelsError) {
      message.error(getErrorMessage(modelsErrorObj, '模型加载失败'))
    }
  }, [modelsError, modelsErrorObj, message])

  const canSend =
    currentInput.prompt.trim().length > 0 &&
    !isGenerating &&
    !modelsLoading &&
    models.length > 0 &&
    Boolean(currentInput.model)
  const modelOptions = models.map((model) => ({
    label: modelOptionLabel(model),
    value: model.code,
  }))
  const aspectRatioOptions =
    currentInput.type === 'TEXT'
      ? []
      : getModelAspectRatios(currentInput.type, currentInput.model).map((ratio) => ({
          label: getAspectRatioLabel(currentInput.model, ratio),
          value: ratio,
        }))
  const durationOptions =
    currentInput.type === 'VIDEO'
      ? getVideoDurations(currentInput.model).map((duration) => ({
          label: `${duration}秒`,
          value: String(duration),
        }))
      : []
  const maxImageCount = currentInput.type === 'IMAGE' ? getImageMaxCount(currentInput.model) : 1
  const countOptions =
    maxImageCount > 1
      ? Array.from({ length: maxImageCount }, (_, index) => ({
          label: `${index + 1}张`,
          value: String(index + 1),
        }))
      : []
  const qualityOptions = currentInput.type === 'IMAGE' ? getImageQualities(currentInput.model) : []
  const outputFormatOptions =
    currentInput.type === 'IMAGE'
      ? getImageOutputFormats(currentInput.model).map((format) => ({
          label: format.toUpperCase(),
          value: format,
        }))
      : []
  const backgroundOptions = currentInput.type === 'IMAGE' ? getImageBackgrounds(currentInput.model) : []
  const supportsReferenceImage = currentInput.type === 'IMAGE' || currentInput.type === 'VIDEO'

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      message.error('请上传图片文件')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      message.error('图片大小不能超过 50MB')
      return
    }
    try {
      setUploading(true)
      const result = await uploadApi.upload(file, 'image')
      setReferenceImageUrl(result.url)
      message.success('图片上传成功')
    } catch (error) {
      message.error(getErrorMessage(error, '图片上传失败'))
    } finally {
      setUploading(false)
    }
  }

  const handleSend = async () => {
    if (!canSend) return
    try {
      await generateWithConversation(supportsReferenceImage ? referenceImageUrl : undefined)
      message.success('生成请求已提交')
      setReferenceImageUrl('')
    } catch (error) {
      message.error(getErrorMessage(error, '生成失败'))
    }
  }

  const controls = (
    <>
      <ActionIcon
        disabled={uploading}
        icon={ImagePlus}
        loading={uploading}
        size="small"
        title="上传参考图片"
        onClick={() => fileInputRef.current?.click()}
      />
      <input
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        type="file"
        onChange={handleImageUpload}
      />
      <Select
        options={TYPE_OPTIONS}
        size="small"
        value={currentInput.type}
        onChange={(value) => updateInputType(value as ToolboxInputType)}
      />
      <Select
        loading={modelsLoading}
        options={modelOptions}
        placeholder={models.length === 0 ? '无可用模型' : '选择模型'}
        size="small"
        style={{ minWidth: 150, width: 190 }}
        value={currentInput.model || undefined}
        onChange={(value) => {
          const nextModel = String(value)
          const nextRatios = currentInput.type === 'TEXT'
            ? []
            : getModelAspectRatios(currentInput.type, nextModel)
          const nextDurations = currentInput.type === 'VIDEO' ? getVideoDurations(nextModel) : []
          const nextQualities = currentInput.type === 'IMAGE' ? getImageQualities(nextModel) : []
          const nextOutputFormats = currentInput.type === 'IMAGE' ? getImageOutputFormats(nextModel) : []
          const nextBackgrounds = currentInput.type === 'IMAGE' ? getImageBackgrounds(nextModel) : []
          setCurrentInput({
            model: nextModel,
            count: 1,
            ...(nextRatios[0] ? { aspectRatio: nextRatios[0] } : {}),
            ...(nextDurations[0] ? { duration: nextDurations[0] } : {}),
            quality: nextQualities[0]?.value || '',
            outputFormat: nextOutputFormats[0] || '',
            background: nextBackgrounds[0]?.value || '',
          })
        }}
      />
      {aspectRatioOptions.length > 0 ? (
        <Select
          options={aspectRatioOptions}
          size="small"
          value={currentInput.aspectRatio}
          onChange={(value) => setCurrentInput({ aspectRatio: String(value) })}
        />
      ) : null}
      {durationOptions.length > 0 ? (
        <Select
          options={durationOptions}
          size="small"
          value={String(currentInput.duration)}
          onChange={(value) => setCurrentInput({ duration: Number(value) })}
        />
      ) : null}
      {countOptions.length > 0 ? (
        <Select
          options={countOptions}
          size="small"
          value={String(currentInput.count)}
          onChange={(value) => setCurrentInput({ count: Number(value) })}
        />
      ) : null}
      {qualityOptions.length > 0 ? (
        <Select
          options={qualityOptions}
          size="small"
          value={currentInput.quality}
          onChange={(value) => setCurrentInput({ quality: String(value) })}
        />
      ) : null}
      {outputFormatOptions.length > 0 ? (
        <Select
          options={outputFormatOptions}
          size="small"
          value={currentInput.outputFormat}
          onChange={(value) => setCurrentInput({ outputFormat: String(value) })}
        />
      ) : null}
      {backgroundOptions.length > 0 ? (
        <Select
          options={backgroundOptions}
          size="small"
          value={currentInput.background}
          onChange={(value) => setCurrentInput({ background: String(value) })}
        />
      ) : null}
    </>
  )

  const showReferencePreview = supportsReferenceImage && Boolean(referenceImageUrl)
  const referencePreviewHeight = showReferencePreview ? 84 : 0
  const composerHeights = {
    inputHeight: 172 + referencePreviewHeight,
    maxHeight: 320 + referencePreviewHeight,
    minHeight: 140 + referencePreviewHeight,
  }

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <ChatInputArea
        expand={false}
        heights={composerHeights}
        loading={isGenerating}
        placeholder="有问题，尽管问"
        value={currentInput.prompt}
        bottomAddons={
          <ChatInputArea.ActionBar
            leftAddons={controls}
            padding="0 12px"
            rightAddons={
              <ChatInputArea.SendButton
                loading={isGenerating}
                style={{ paddingInline: 0 }}
                texts={{ send: '发送', stop: '生成中', warp: '换行' }}
                rightAddons={
                  <Tag color={estimatedCost > 0 ? 'blue' : 'default'}>
                    预估 {estimatedCost} 积分
                  </Tag>
                }
                onSend={() => void handleSend()}
                onStop={() => message.info('任务已提交，生成过程中请稍候')}
              />
            }
          />
        }
        topAddons={
          showReferencePreview ? (
            <div className="px-4 pt-1">
              <div className="size-16 shrink-0 overflow-hidden rounded-lg">
                <Image
                  alt="参考图"
                  objectFit="cover"
                  size={64}
                  src={referenceImageUrl}
                  variant="outlined"
                  actions={
                    <ActionIcon
                      danger
                      glass
                      icon={X}
                      size="small"
                      title="移除参考图片"
                      onClick={() => setReferenceImageUrl('')}
                    />
                  }
                />
              </div>
            </div>
          ) : undefined
        }
        onInput={(value) => setCurrentInput({ prompt: value })}
        onSend={() => void handleSend()}
      />
      <p className="mt-2 text-center text-xs text-muted-foreground">
        AI 也可能会犯错，请核查重要信息
      </p>
    </div>
  )
}
