import { Button, InputNumber, Modal, Select } from '@lobehub/ui'
import {
  CheckSquare,
  Images,
  Shuffle,
  Video,
  X,
} from 'lucide-react'

import { getModelAspectRatios } from '@/features/toolbox/constants/toolbox-models'

import { useModelConfigStore } from '../../model-config-store'
import { useEditorStore } from '../../store'
import { selectedShotIdsInOrder } from '../storyboard/asset-binding-utils'
import type { BatchAspectRatio } from './batch-operation-state'
import { useBatchOperation } from './useBatchOperation'

export function BatchOperationBar() {
  const shots = useEditorStore((state) => state.shots)
  const selectedShotIds = useEditorStore((state) => state.selectedShotIds)
  const hasSelection = useEditorStore((state) => state.hasSelection)
  const selectAll = useEditorStore((state) => state.selectAll)
  const deselectAll = useEditorStore((state) => state.deselectAll)
  const invertSelection = useEditorStore((state) => state.invertSelection)
  const batchGenerateShots = useEditorStore((state) => state.batchGenerateShots)
  const batchGenerateVideos = useEditorStore((state) => state.batchGenerateVideos)
  const fetchShots = useEditorStore((state) => state.fetchShots)
  const shotImageModel = useModelConfigStore((state) => state.shotImageModel)
  const videoModel = useModelConfigStore((state) => state.videoModel)

  const batch = useBatchOperation({
    batchGenerateShots,
    batchGenerateVideos,
    fetchShots,
    onSuccess: deselectAll,
    resolveModel: (type) => {
      const config = useModelConfigStore.getState()
      return type === 'image' ? config.shotImageModel : config.videoModel
    },
  })

  if (!hasSelection) return null

  const handleInvert = () => {
    invertSelection()
  }

  const openBatch = (type: 'image' | 'video') => {
    const model = type === 'image' ? shotImageModel : videoModel
    const ratios = getModelAspectRatios(type === 'image' ? 'IMAGE' : 'VIDEO', model)
    batch.open(type, (ratios.includes('16:9') ? '16:9' : ratios[0]) as BatchAspectRatio)
  }

  const confirmButtonText = batch.state.submitting
    ? `生成中… ${batch.state.seconds}s`
    : '确认生成'
  const cancelButtonText = batch.state.submitting ? '后台运行' : '取消'
  const modalTitle = batch.state.type === 'image' ? '批量生成分镜图' : '批量生成视频'
  const modeDescription = {
    ALL: {
      label: '全部生成',
      sub: batch.state.type === 'image'
        ? '为所有选中的分镜重新生成图片'
        : '为所有选中的分镜重新生成视频',
    },
    MISSING: {
      label: '缺失生成',
      sub: batch.state.type === 'image'
        ? '仅为未生成分镜图的选中分镜生成图片'
        : '仅为未生成视频的选中分镜生成视频',
    },
  }
  const maxCount = batch.state.type === 'image' ? 4 : 3
  const countHint = batch.state.type === 'image'
    ? '建议 1–4 张，生成多张可供选择最佳效果'
    : '建议 1–3 个，生成多个可供选择最佳效果'

  return (
    <>
      <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-2xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
            <CheckSquare className="size-4" />
            已选中 {selectedShotIds.size} 条
          </div>

          <div className="h-6 w-px bg-slate-200" />

          <Button icon={CheckSquare} size="small" onClick={selectAll}>
            全选
          </Button>
          <Button icon={Shuffle} size="small" onClick={handleInvert}>
            反选
          </Button>

          <div className="h-6 w-px bg-slate-200" />

          <Button
            icon={Images}
            size="small"
            onClick={() => openBatch('image')}
          >
            批量生成分镜图
          </Button>
          <Button
            icon={Video}
            size="small"
            onClick={() => openBatch('video')}
          >
            批量生成视频
          </Button>

          <div className="h-6 w-px bg-slate-200" />

          <Button icon={X} size="small" type="text" onClick={deselectAll}>
            取消选择
          </Button>
        </div>
      </div>

      {batch.state.open ? (
        <Modal
          centered
          open
          maskClosable={!batch.state.submitting}
          title={modalTitle}
          width={520}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={batch.close}>
                {cancelButtonText}
              </Button>
              <Button
                disabled={batch.state.submitting}
                loading={batch.state.submitting}
                type="primary"
                onClick={() =>
                  void batch.submit(selectedShotIdsInOrder(shots, selectedShotIds))
                }
              >
                {confirmButtonText}
              </Button>
            </div>
          }
          onCancel={batch.close}
        >
          <div className="space-y-5 py-1">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">画面比例</label>
              <Select
                className="w-full"
                disabled={batch.state.submitting}
                options={getModelAspectRatios(
                  batch.state.type === 'image' ? 'IMAGE' : 'VIDEO',
                  batch.state.type === 'image' ? shotImageModel : videoModel,
                ).map((ratio) => ({ label: ratio, value: ratio }))}
                value={batch.state.aspectRatio}
                onChange={(value) => batch.setAspectRatio(String(value) as BatchAspectRatio)}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">生成模式</label>
              <div className="flex gap-3">
                {(['MISSING', 'ALL'] as const).map((mode) => (
                  <Button
                    block
                    key={mode}
                    type={batch.state.mode === mode ? 'primary' : 'default'}
                    onClick={() => batch.setMode(mode)}
                  >
                    <span className="block text-sm font-medium">{modeDescription[mode].label}</span>
                    <span className="block text-xs font-normal opacity-80">
                      {modeDescription[mode].sub}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                每条分镜生成数量
              </label>
              <InputNumber
                className="w-full"
                disabled={batch.state.submitting}
                max={maxCount}
                min={1}
                precision={0}
                value={batch.state.count}
                onChange={(value) => batch.setCount(Number(value))}
              />
              <p className="mt-1.5 text-xs text-slate-400">{countHint}</p>
            </div>

            {batch.state.error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {batch.state.error}
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
