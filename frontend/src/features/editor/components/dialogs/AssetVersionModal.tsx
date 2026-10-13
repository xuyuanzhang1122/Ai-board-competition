import { Button, Empty, Modal, Tag } from '@lobehub/ui'
import { Download, History, Loader2 } from 'lucide-react'
import { useEffect, useReducer } from 'react'

import { assetApi } from '../../api'
import { useEditorStore } from '../../store'
import type { AssetVersionDialogRequest } from '../storyboard/StoryboardRow'
import {
  assetVersionDownloadName,
  assetVersionModalReducer,
  createAssetVersionModalState,
} from './asset-dialog-state'

export interface AssetVersionModalProps {
  onClose: () => void
  request: AssetVersionDialogRequest
}

const formatDate = (date: string) =>
  new Date(date).toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  })

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export function AssetVersionModal({ onClose, request }: AssetVersionModalProps) {
  const getAssetVersions = useEditorStore((state) => state.getAssetVersions)
  const setAssetCurrentVersion = useEditorStore((state) => state.setAssetCurrentVersion)
  const [state, dispatch] = useReducer(
    assetVersionModalReducer,
    undefined,
    createAssetVersionModalState,
  )

  const loadVersions = async () => {
    dispatch({ type: 'load-start' })
    try {
      const versions = await getAssetVersions(request.assetId)
      dispatch({ type: 'versions-loaded', versions })
    } catch (error) {
      dispatch({ message: errorMessage(error, '版本历史加载失败'), type: 'load-error' })
    }
  }

  useEffect(() => {
    void loadVersions()
    return () => dispatch({ type: 'reset' })
    // request.assetId 是弹窗数据生命周期边界；store action 引用稳定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.assetId])

  const close = () => {
    if (state.switching) return
    dispatch({ type: 'reset' })
    onClose()
  }

  const switchVersion = async (versionId: number) => {
    if (state.switching || state.versions.some((item) => item.id === versionId && item.isCurrent)) {
      return
    }
    dispatch({ type: 'switch-start', versionId })
    try {
      // store action 在版本切换成功后强制 fetchShots，避免表格继续显示旧版本。
      await setAssetCurrentVersion(request.assetId, { versionId })
      const versions = await getAssetVersions(request.assetId)
      dispatch({ type: 'versions-loaded', versions })
      dispatch({ type: 'switch-finish' })
    } catch (error) {
      dispatch({ message: errorMessage(error, '版本切换失败'), type: 'load-error' })
    }
  }

  const download = async (url: string, versionNo: number) => {
    try {
      const blob = await assetApi.downloadAsset(url)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = assetVersionDownloadName(request, versionNo)
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    } catch (error) {
      dispatch({ message: errorMessage(error, '版本下载失败'), type: 'load-error' })
    }
  }

  return (
    <Modal
      centered
      open
      maskClosable={!state.switching}
      title={`版本历史 · ${request.assetType === 'video' ? '视频' : '分镜图'}`}
      width={900}
      footer={
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">点击版本卡片切换为当前版本</span>
          <Button disabled={state.switching} onClick={close}>
            关闭
          </Button>
        </div>
      }
      onCancel={close}
    >
      <div className="max-h-[64vh] min-h-64 overflow-y-auto py-1">
        {state.loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-5 animate-spin" />
            正在加载版本…
          </div>
        ) : state.versions.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center">
            <Empty
              description={state.error || '暂无版本记录'}
              image={<History aria-hidden className="size-14 text-slate-300" />}
              title="版本历史为空"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {state.versions.map((version) => {
              const isSelected = state.selectedVersionId === version.id
              return (
                <article
                  key={version.id}
                  role="button"
                  tabIndex={0}
                  className={`group relative overflow-hidden rounded-xl border-2 bg-white transition-colors ${
                    version.isCurrent
                      ? 'border-blue-500'
                      : 'border-slate-200 hover:border-slate-300'
                  } ${state.switching ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
                  onClick={() => void switchVersion(version.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      void switchVersion(version.id)
                    }
                  }}
                >
                  <div className="aspect-video overflow-hidden bg-slate-100">
                    {request.assetType === 'video' ? (
                      <video className="size-full object-cover" preload="metadata" src={version.url} />
                    ) : (
                      <img
                        alt={`版本 ${version.versionNo}`}
                        className="size-full object-cover"
                        loading="lazy"
                        src={version.url}
                      />
                    )}
                  </div>
                  <div className="space-y-1.5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm text-slate-900">版本 {version.versionNo}</strong>
                      <Tag>{version.source}</Tag>
                    </div>
                    <p className="text-xs text-slate-400">{formatDate(version.createdAt)}</p>
                  </div>

                  {version.isCurrent ? (
                    <span className="absolute right-2 top-2 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white">
                      当前版本
                    </span>
                  ) : null}
                  {isSelected ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-medium text-slate-700">
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      正在切换
                    </span>
                  ) : null}
                  <Button
                    className="absolute bottom-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
                    icon={Download}
                    size="small"
                    title="下载"
                    onClick={(event) => {
                      event.stopPropagation()
                      void download(version.url, version.versionNo)
                    }}
                  />
                </article>
              )
            })}
          </div>
        )}

        {state.error && state.versions.length > 0 ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
