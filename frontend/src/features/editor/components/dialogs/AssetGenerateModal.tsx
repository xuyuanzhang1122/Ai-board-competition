import { Button, InputNumber, Modal, Select } from '@lobehub/ui'
import { Sparkles } from 'lucide-react'
import { useEffect, useReducer, useState } from 'react'

import {
  getModelAspectRatios,
  getVideoDurations,
} from '@/features/toolbox/constants/toolbox-models'
import { modelOptionLabel } from '@/shared/components/ModelProviderIcon'

import { useModelConfigStore } from '../../model-config-store'
import { useEditorStore } from '../../store'
import { useAvailableModels } from '../../useAvailableModels'
import type { AssetGenerateDialogRequest } from '../storyboard/StoryboardRow'
import {
  type AssetGenerationAspectRatio,
  assetGenerationFormReducer,
  buildAssetGenerationRequest,
  createAssetGenerationFormState,
} from './asset-dialog-state'

export interface AssetGenerateModalProps {
  onClose: () => void
  request: AssetGenerateDialogRequest
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '生成任务提交失败'

export function AssetGenerateModal({ onClose, request }: AssetGenerateModalProps) {
  const batchGenerateShots = useEditorStore((state) => state.batchGenerateShots)
  const batchGenerateVideos = useEditorStore((state) => state.batchGenerateVideos)
  const configuredModel = useModelConfigStore((state) =>
    request.assetType === 'video' ? state.videoModel : state.shotImageModel,
  )
  const [form, dispatch] = useReducer(assetGenerationFormReducer, undefined, () =>
    createAssetGenerationFormState(request.assetType, configuredModel),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const modelType = request.assetType === 'video' ? 'VIDEO' : 'IMAGE'
  const { error: modelsError, loading: modelsLoading, models } = useAvailableModels(modelType)

  useEffect(() => {
    if (models.length === 0) return
    if (!models.some((model) => model.code === form.model)) {
      const nextModel = models.find((model) => model.code === configuredModel)?.code || models[0].code
      dispatch({ model: nextModel, type: 'set-model' })
      return
    }
    const ratios = getModelAspectRatios(modelType, form.model)
    if (!ratios.includes(form.aspectRatio) && ratios[0]) {
      dispatch({ aspectRatio: ratios[0] as AssetGenerationAspectRatio, type: 'set-aspect-ratio' })
    }
    if (modelType === 'VIDEO') {
      const durations = getVideoDurations(form.model)
      if (!durations.includes(form.duration) && durations[0]) {
        dispatch({ duration: durations[0], type: 'set-duration' })
      }
    }
  }, [configuredModel, form.aspectRatio, form.duration, form.model, modelType, models])

  const close = () => {
    if (submitting) return
    dispatch({ assetType: request.assetType, configuredModel, type: 'reset' })
    setError(null)
    onClose()
  }

  const submit = async () => {
    if (!form.model || models.length === 0) {
      setError('没有可用的生成模型，请先在管理后台启用模型')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = buildAssetGenerationRequest(request, form)
      if (request.assetType === 'video') await batchGenerateVideos(payload)
      else await batchGenerateShots(payload)
      dispatch({ assetType: request.assetType, configuredModel, type: 'reset' })
      onClose()
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const label = request.assetType === 'video' ? '视频' : '分镜图'
  const modelOptions = models.map((model) => ({
    label: modelOptionLabel(model),
    value: model.code,
  }))
  const ratioOptions = getModelAspectRatios(modelType, form.model).map((ratio) => ({
    label: ratio,
    value: ratio,
  }))

  return (
    <Modal
      centered
      open
      maskClosable={!submitting}
      title={`生成${label} · 分镜 ${request.shotNo}`}
      width={520}
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={submitting} onClick={close}>
            取消
          </Button>
          <Button
            icon={Sparkles}
            loading={submitting}
            type="primary"
            onClick={() => void submit()}
          >
            开始生成
          </Button>
        </div>
      }
      onCancel={close}
    >
      <div className="space-y-5 py-1">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">生成数量</label>
          <InputNumber
            className="w-full"
            disabled={submitting}
            max={10}
            min={1}
            precision={0}
            value={form.count}
            onChange={(value) => dispatch({ count: Number(value), type: 'set-count' })}
          />
          <p className="mt-1.5 text-xs text-slate-400">单次可生成 1–10 个版本</p>
        </div>

        {request.assetType === 'video' ? (
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">视频时长</label>
            <Select
              className="w-full"
              disabled={submitting}
              value={form.duration}
              options={getVideoDurations(form.model).map((duration) => ({
                label: `${duration} 秒`,
                value: duration,
              }))}
              onChange={(value) => dispatch({ duration: Number(value), type: 'set-duration' })}
            />
          </div>
        ) : null}

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">画幅比例</label>
          <Select
            className="w-full"
            disabled={submitting}
            options={ratioOptions}
            value={form.aspectRatio}
            onChange={(value) =>
              dispatch({
                aspectRatio: String(value) as AssetGenerationAspectRatio,
                type: 'set-aspect-ratio',
              })
            }
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">生成模型</label>
          <Select
            className="w-full"
            disabled={submitting || modelsLoading || models.length === 0}
            options={modelOptions}
            value={form.model}
            onChange={(value) => {
              const model = String(value)
              dispatch({ model, type: 'set-model' })
              const ratios = getModelAspectRatios(modelType, model)
              if (!ratios.includes(form.aspectRatio) && ratios[0]) {
                dispatch({
                  aspectRatio: ratios[0] as AssetGenerationAspectRatio,
                  type: 'set-aspect-ratio',
                })
              }
            }}
          />
          {modelsError ? (
            <p className="mt-1.5 text-xs text-rose-500">模型列表加载失败，请稍后重试</p>
          ) : null}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-500">使用方式</span>
          <span className="flex items-center gap-1.5 font-semibold text-slate-900">
            参赛免费
          </span>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
