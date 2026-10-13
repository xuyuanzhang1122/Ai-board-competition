import { Button, Checkbox, Modal } from '@lobehub/ui'
import { FileImage, Film, Users } from 'lucide-react'
import { useReducer, useState } from 'react'

import { cn } from '@/lib/utils'
import type { ExportRequest } from '@/shared/types/api'

import {
  buildExportRequest,
  createInitialExportFormState,
  exportFormReducer,
  type ExportFormState,
  hasExportSelection,
} from './export-state'

export interface ExportModalProps {
  onClose: () => void
  onConfirm: (request: ExportRequest) => void
  open: boolean
  selectedShotIds: Set<number>
}

interface ExportOptionConfig {
  description: string
  field: keyof Omit<ExportFormState, 'mode'>
  icon: React.ComponentType<{ className?: string }>
  label: string
}

const EXPORT_OPTIONS: ExportOptionConfig[] = [
  {
    description: '导出所有角色的生成图片',
    field: 'exportCharacters',
    icon: Users,
    label: '角色画像',
  },
  {
    description: '导出所有场景的生成图片',
    field: 'exportScenes',
    icon: FileImage,
    label: '场景画像',
  },
  {
    description: '导出所有分镜的静态图片',
    field: 'exportShotImages',
    icon: FileImage,
    label: '分镜图',
  },
  {
    description: '导出所有分镜的生成视频',
    field: 'exportVideos',
    icon: Film,
    label: '分镜视频',
  },
]

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '提交导出任务失败'

export function ExportModal({ open, onClose, onConfirm }: ExportModalProps) {
  const [form, dispatch] = useReducer(exportFormReducer, createInitialExportFormState())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    if (submitting) return
    dispatch({ type: 'reset' })
    setError(null)
    onClose()
  }

  const handleConfirm = async () => {
    if (!hasExportSelection(form)) {
      setError('请至少选择一项导出内容')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      onConfirm(buildExportRequest(form))
      dispatch({ type: 'reset' })
    } catch (submitError) {
      setError(errorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const modeDescription = {
    ALL: {
      label: '包含所有版本',
      sub: '导出所有历史版本(文件较大)',
    },
    CURRENT: {
      label: '仅当前版本',
      sub: '只导出每个资产的当前活跃版本',
    },
  }

  return (
    <Modal
      centered
      maskClosable={!submitting}
      open={open}
      title="导出项目"
      width={520}
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={submitting} onClick={handleClose}>
            取消
          </Button>
          <Button
            disabled={!hasExportSelection(form) || submitting}
            loading={submitting}
            type="primary"
            onClick={() => void handleConfirm()}
          >
            开始导出
          </Button>
        </div>
      }
      onCancel={handleClose}
    >
      <div className="space-y-5 py-1">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">选择导出内容</label>
          <div className="space-y-2">
            {EXPORT_OPTIONS.map(({ description, field, icon: Icon, label }) => (
              <label
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors hover:bg-slate-100"
                key={field}
              >
                <Checkbox
                  checked={form[field]}
                  onChange={(checked) => {
                    if (checked !== form[field]) dispatch({ field, type: 'toggle' })
                  }}
                />
                <Icon className="size-5 text-slate-500" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">{label}</div>
                  <div className="text-xs text-slate-500">{description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">版本选择</label>
          <div className="grid grid-cols-2 gap-3">
            {(['CURRENT', 'ALL'] as const).map((mode) => {
              const active = form.mode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                    active
                      ? 'border-slate-800 bg-slate-800 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
                  )}
                  onClick={() => dispatch({ mode, type: 'set-mode' })}
                >
                  <span className="text-sm font-medium">{modeDescription[mode].label}</span>
                  <span className={cn('text-xs', active ? 'text-slate-200' : 'text-slate-500')}>
                    {modeDescription[mode].sub}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-700">
            导出将在后台异步处理,完成后自动下载 ZIP 压缩包。文件按类别组织: 01-角色、02-场景、03-分镜、04-视频。
          </p>
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
