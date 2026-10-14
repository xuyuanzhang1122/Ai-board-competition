import { Button, Modal, Select } from '@lobehub/ui'
import { type ReactNode, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { modelOptionLabel } from '@/shared/components/ModelProviderIcon'
import { confirmAction } from '@/shared/feedback/feedback'
import type { ModelType, ModelVO } from '@/shared/types/api'

import { modelApi } from '../../model-api'
import { DEFAULT_MODEL_CONFIG, useModelConfigStore } from '../../model-config-store'
import { defaultNotifier } from '../panels/asset-edit/notifier'

export interface ModelConfigModalProps {
  onClose: () => void
  open: boolean
}

type ModelOption = { label: ReactNode; value: string }

const EMPTY_MODEL_OPTIONS: Record<ModelType, ModelOption[]> = {
  IMAGE: [],
  LANGUAGE: [],
  VIDEO: [],
}

const mapOptions = (models: ModelVO[]): ModelOption[] =>
  models.map((model) => ({ label: modelOptionLabel(model), value: model.code }))

export function ModelConfigModal({ onClose, open }: ModelConfigModalProps) {
  const storeValues = useModelConfigStore(
    useShallow((state) => ({
      characterImageModel: state.characterImageModel,
      languageModel: state.languageModel,
      sceneImageModel: state.sceneImageModel,
      shotImageModel: state.shotImageModel,
      videoModel: state.videoModel,
    })),
  )
  const updateConfig = useModelConfigStore((state) => state.updateConfig)
  const resetToDefault = useModelConfigStore((state) => state.resetToDefault)

  const [localValues, setLocalValues] = useState(storeValues)
  const [options, setOptions] = useState<Record<ModelType, ModelOption[]>>(EMPTY_MODEL_OPTIONS)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    // Reset local form to the persisted store values every time the modal opens.
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
    setLocalValues(storeValues)

    let cancelled = false
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
    setLoading(true)
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
    setOptions(EMPTY_MODEL_OPTIONS)
    Promise.all([
      modelApi.getModels('LANGUAGE'),
      modelApi.getModels('IMAGE'),
      modelApi.getModels('VIDEO'),
    ])
      .then(([languageModels, imageModels, videoModels]) => {
        if (cancelled) return
        setOptions({
          IMAGE: mapOptions(imageModels),
          LANGUAGE: mapOptions(languageModels),
          VIDEO: mapOptions(videoModels),
        })
        setLocalValues((previous) => ({
          ...previous,
          languageModel: languageModels.some((model) => model.code === previous.languageModel)
            ? previous.languageModel : '',
        }))
      })
      .catch((error) => {
        if (cancelled) return
        defaultNotifier.error(error instanceof Error ? error.message : '加载模型列表失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, storeValues])

  const handleSave = () => {
    if (loading) return
    if (localValues.languageModel && !options.LANGUAGE.some((model) => model.value === localValues.languageModel)) {
      defaultNotifier.error('语言模型已停用，请重新选择')
      return
    }
    updateConfig(localValues)
    defaultNotifier.success('模型配置已保存')
    onClose()
  }

  const handleReset = async () => {
    if (!(await confirmAction('确定要重置为默认配置吗？', { title: '重置模型配置' }))) return
    resetToDefault()
    setLocalValues({
      characterImageModel: DEFAULT_MODEL_CONFIG.characterImageModel,
      languageModel: DEFAULT_MODEL_CONFIG.languageModel,
      sceneImageModel: DEFAULT_MODEL_CONFIG.sceneImageModel,
      shotImageModel: DEFAULT_MODEL_CONFIG.shotImageModel,
      videoModel: DEFAULT_MODEL_CONFIG.videoModel,
    })
    defaultNotifier.success('已重置为默认配置')
  }

  const modelSelect = (
    label: string,
    value: string,
    modelOptions: ModelOption[],
    onChange: (value: string) => void,
  ) => (
    <div key={label}>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <Select
        className="w-full"
        disabled={loading || modelOptions.length === 0}
        options={modelOptions}
        placeholder={modelOptions.length === 0 ? '暂无可用模型' : '选择模型'}
        value={modelOptions.some((option) => option.value === value) ? value : undefined}
        onChange={(next) => onChange(String(next))}
      />
    </div>
  )

  return (
    <Modal
      centered
      open={open}
      title="模型配置"
      width={600}
      footer={
        <div className="flex items-center justify-between">
          <Button onClick={() => void handleReset()}>重置默认</Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button disabled={loading} type="primary" onClick={handleSave}>
              保存配置
            </Button>
          </div>
        </div>
      }
      onCancel={onClose}
    >
      <div className="space-y-5 py-1">
        {modelSelect(
          '语言模型',
          localValues.languageModel,
          options.LANGUAGE,
          (languageModel) => setLocalValues((prev) => ({ ...prev, languageModel })),
        )}
        {modelSelect(
          '角色画像生成模型',
          localValues.characterImageModel,
          options.IMAGE,
          (characterImageModel) => setLocalValues((prev) => ({ ...prev, characterImageModel })),
        )}
        {modelSelect(
          '场景画像生成模型',
          localValues.sceneImageModel,
          options.IMAGE,
          (sceneImageModel) => setLocalValues((prev) => ({ ...prev, sceneImageModel })),
        )}
        {modelSelect(
          '分镜画面生成模型',
          localValues.shotImageModel,
          options.IMAGE,
          (shotImageModel) => setLocalValues((prev) => ({ ...prev, shotImageModel })),
        )}
        {modelSelect(
          '视频生成模型',
          localValues.videoModel,
          options.VIDEO,
          (videoModel) => setLocalValues((prev) => ({ ...prev, videoModel })),
        )}

        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            正在加载模型列表…
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
            模型配置仅用于本参赛版。语言模型须从当前可用目录选择；暂无可用模型时不能生成，不会自动改用其他供应商。
          </div>
        )}
      </div>
    </Modal>
  )
}
