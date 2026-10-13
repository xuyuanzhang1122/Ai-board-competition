import { Button, Empty, Select } from '@lobehub/ui'
import { AlertTriangle, ArrowLeft, Download, Play, Trash2, Video } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getVideoDurations, getVideoResolutions } from '@/features/toolbox/constants/toolbox-models'
import { modelOptionLabel } from '@/shared/components/ModelProviderIcon'

import { assetApi, generationApi, jobApi } from '../../api'
import { useModelConfigStore } from '../../model-config-store'
import type { ShotGenerationPanelData } from '../../panel-manager-store'
import { useEditorStore } from '../../store'
import { useAvailableModels } from '../../useAvailableModels'
import { defaultNotifier } from './asset-edit/notifier'
import {
  hydrateMissingJobUrls,
  loadExpiringHistory,
  PANEL_HISTORY_TTL_MS,
  pollGenerationJob,
  saveExpiringHistory,
} from './generation-helpers'
import {
  buildVideoGenerationRequest,
  getVideoFallbackThumbnail,
  getVideoSceneAssetError,
  mapVideoSizeToAspectRatio,
  type VideoDuration,
  videoHistoryKey,
  type VideoSize,
} from './video-generation'

export interface VideoHistoryItem {
  duration: VideoDuration
  expiresAt: number
  id: number
  prompt: string
  resultUrl: string
  size: VideoSize
  thumbnailUrl: string
  timestamp: string
}

export interface VideoGeneratePanelProps extends ShotGenerationPanelData {
  onClose: () => void
}

export function VideoGeneratePanel({ onClose, shotId, shotNo }: VideoGeneratePanelProps) {
  const refreshShots = useEditorStore((state) => state.refreshShots)
  const registerGenerationJob = useEditorStore((state) => state.registerGenerationJob)
  const projectId = useEditorStore((state) => state.projectId)
  const configuredModel = useModelConfigStore((state) => state.videoModel)
  const { loading: modelsLoading, models } = useAvailableModels('VIDEO')
  const shot = useEditorStore((state) => state.shots.find((item) => item.id === shotId))

  const [model, setModel] = useState(configuredModel)
  const [duration, setDuration] = useState<VideoDuration>(() => getVideoDurations(configuredModel)[0] || 5)
  const [history, setHistory] = useState<VideoHistoryItem[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewItem, setPreviewItem] = useState<VideoHistoryItem | null>(null)
  const [progress, setProgress] = useState(0)
  const [size, setSize] = useState<VideoSize>(() => getVideoResolutions(configuredModel)[0] || '854x480')
  const abortRef = useRef<AbortController | null>(null)
  const storageKey = useMemo(() => videoHistoryKey(shotId), [shotId])
  const sceneAssetError = getVideoSceneAssetError(shot)

  useEffect(() => {
    if (models.length === 0) return
    const nextModel = models.some((item) => item.code === model)
      ? model
      : models.find((item) => item.code === configuredModel)?.code || models[0].code
    if (nextModel !== model) setModel(nextModel)
    const durations = getVideoDurations(nextModel)
    const resolutions = getVideoResolutions(nextModel)
    if (!durations.includes(duration) && durations[0]) setDuration(durations[0])
    if (!resolutions.includes(size) && resolutions[0]) setSize(resolutions[0])
  }, [configuredModel, duration, model, models, size])

  const commitHistory = useCallback(
    (records: VideoHistoryItem[]) => {
      setHistory(records)
      saveExpiringHistory(storageKey, records)
    },
    [storageKey],
  )

  /* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect -- panel history and preview reset when the managed shot changes */
  useEffect(() => {
    const loaded = loadExpiringHistory<VideoHistoryItem>(storageKey)
    setHistory(loaded)
    setPreviewItem(null)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    void hydrateMissingJobUrls(loaded, jobApi.getJobStatus).then((hydrated) => {
      setHistory(hydrated)
      saveExpiringHistory(storageKey, hydrated)
    })

    return () => abortRef.current?.abort()
  }, [storageKey])
  /* eslint-enable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */

  const handleGenerate = async () => {
    if (!projectId || !shot || !model || isGenerating) {
      if (!projectId || !shot) defaultNotifier.error('分镜数据尚未加载')
      return
    }
    if (sceneAssetError) {
      defaultNotifier.error(sceneAssetError)
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setIsGenerating(true)
    setProgress(0)

    try {
      const request = buildVideoGenerationRequest(shot, {
        duration,
        model,
        size,
      })
      const response = await generationApi.generateSingleShotVideo(projectId, shot.id, request)
      if (!response.jobId) throw new Error('视频生成任务缺少 jobId')
      registerGenerationJob(response.jobId, 'video', [shot.id])

      const pending: VideoHistoryItem = {
        duration,
        expiresAt: Date.now() + PANEL_HISTORY_TTL_MS,
        id: response.jobId,
        prompt: request.prompt,
        resultUrl: '',
        size,
        thumbnailUrl: getVideoFallbackThumbnail(shot),
        timestamp: new Date().toLocaleString('zh-CN'),
      }
      commitHistory([pending, ...history.filter((item) => item.id !== pending.id)])
      setPreviewItem(pending)
      defaultNotifier.info(`视频任务 #${response.jobId} 已提交`)

      const job = await pollGenerationJob(response.jobId, {
        getJobStatus: jobApi.getJobStatus,
        onProgress: (value) => setProgress(value.progress ?? 0),
        signal: abortRef.current.signal,
      })
      if (!job) return
      if (!job.resultUrl) throw new Error('视频已生成，但任务未返回播放地址')

      const completed = { ...pending, resultUrl: job.resultUrl }
      const nextHistory = [completed, ...history.filter((item) => item.id !== completed.id)]
      commitHistory(nextHistory)
      setPreviewItem(completed)
      await refreshShots([shotId])
      defaultNotifier.success('视频生成完成')
    } catch (error) {
      defaultNotifier.error(error instanceof Error ? error.message : '视频生成失败')
    } finally {
      setIsGenerating(false)
    }
  }

  const applyHistoryVideo = async (record: VideoHistoryItem) => {
    setPreviewItem(record)
    if (!record.resultUrl) {
      defaultNotifier.info('该任务仍在生成，稍后重新打开面板会自动补全地址')
      return
    }
    if (!shot?.video.assetId) return
    try {
      await assetApi.uploadFromUrl(shot.video.assetId, record.resultUrl)
      await refreshShots([shotId])
      defaultNotifier.success('历史视频已应用到分镜')
    } catch (error) {
      defaultNotifier.error(error instanceof Error ? error.message : '应用视频失败')
    }
  }

  const downloadVideo = (record: VideoHistoryItem) => {
    if (!record.resultUrl) return
    const link = document.createElement('a')
    link.href = record.resultUrl
    link.download = `shot_${shotNo}_${Date.now()}.mp4`
    link.target = '_blank'
    link.click()
  }

  const removeHistory = (id: number) => {
    commitHistory(history.filter((item) => item.id !== id))
    if (previewItem?.id === id) setPreviewItem(null)
  }

  const previewThumbnail = previewItem?.thumbnailUrl || getVideoFallbackThumbnail(shot)

  return (
    <section className="bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button
          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          type="button"
          onClick={onClose}
        >
          <ArrowLeft className="size-4" />
          返回
        </button>
        <h3 className="text-sm font-semibold text-slate-800">分镜 #{shotNo} · 生成视频</h3>
      </header>

      <div className="space-y-6 p-6">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <div className="flex aspect-video items-center justify-center">
            {previewItem?.resultUrl ? (
              <video controls className="size-full bg-black object-contain" src={previewItem.resultUrl} />
            ) : previewThumbnail ? (
              <div className="relative size-full">
                <img alt="视频首帧预览" className="size-full object-cover" src={previewThumbnail} />
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/20">
                  <span className="rounded-full bg-white/90 p-3 text-slate-700">
                    <Play className="size-6" />
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400">
                <Video className="mx-auto mb-2 size-10" />
                <p className="text-sm">生成分镜图或绑定场景资产后可预览参考画面</p>
              </div>
            )}
          </div>
          {previewItem ? (
            <div className="flex items-center justify-between border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
              <span>任务 #{previewItem.id} · {previewItem.size} · {previewItem.duration}s</span>
              <Button
                disabled={!previewItem.resultUrl}
                icon={Download}
                size="small"
                onClick={() => downloadVideo(previewItem)}
              >
                下载
              </Button>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-700">参考资产</p>
          <p className="mb-3 text-xs text-slate-400">自动使用分镜绑定的人物、道具、场景资产和分镜图作为多图参考</p>
          <ul className="space-y-1.5 text-xs">
            <li className="flex items-center justify-between">
              <span className="text-slate-500">场景画像（必须）</span>
              {shot?.scene?.thumbnailUrl ? (
                <span className="text-slate-700">{shot.scene.sceneName}</span>
              ) : (
                <span className="flex items-center gap-1 text-rose-500">
                  <AlertTriangle className="size-3.5" />
                  未绑定或未生成画像
                </span>
              )}
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-500">人物画像</span>
              <span className="text-slate-700">
                {shot?.characters.filter((item) => item.thumbnailUrl).length || 0} 个
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-500">道具画像</span>
              <span className="text-slate-700">
                {shot?.props.filter((item) => item.thumbnailUrl).length || 0} 个
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-500">分镜图</span>
              <span className="text-slate-700">{shot?.shotImage.currentUrl ? '已生成' : '无（可选）'}</span>
            </li>
          </ul>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="space-y-1 text-xs text-slate-500">
            <span>生成模型</span>
            <Select
              disabled={modelsLoading || models.length === 0}
              options={models.map((item) => ({ label: modelOptionLabel(item), value: item.code }))}
              style={{ width: '100%' }}
              value={model}
              onChange={(value) => {
                const nextModel = String(value)
                setModel(nextModel)
                setDuration(getVideoDurations(nextModel)[0] || 5)
                setSize(getVideoResolutions(nextModel)[0] || '854x480')
              }}
            />
          </label>
          <label className="space-y-1 text-xs text-slate-500">
            <span>画面尺寸</span>
            <Select
              style={{ width: '100%' }}
              value={size}
              options={getVideoResolutions(model).map((value) => ({
                label: `${value} (${mapVideoSizeToAspectRatio(value)})`,
                value,
              }))}
              onChange={(value) => setSize(String(value) as VideoSize)}
            />
          </label>
          <label className="space-y-1 text-xs text-slate-500">
            <span>视频时长</span>
            <Select
              options={getVideoDurations(model).map((value) => ({ label: `${value} 秒`, value }))}
              style={{ width: '100%' }}
              value={duration}
              onChange={(value) => setDuration(Number(value) as VideoDuration)}
            />
          </label>
        </div>

        <Button
          block
          disabled={modelsLoading || models.length === 0 || Boolean(sceneAssetError)}
          loading={isGenerating}
          type="primary"
          onClick={() => void handleGenerate()}
        >
          {isGenerating && progress > 0 ? `生成中 ${progress}%` : 'AI 生成视频'}
        </Button>
        {sceneAssetError ? (
          <p className="text-center text-xs text-rose-500">{sceneAssetError}</p>
        ) : null}

        <div className="border-t border-slate-200 pt-5">
          <h4 className="mb-3 text-sm font-medium text-slate-700">生成历史</h4>
          {history.length === 0 ? (
            <Empty description="暂无视频生成记录" />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {history.map((record) => (
                <div className="group relative overflow-hidden rounded-lg border border-slate-200" key={record.id}>
                  <button className="block aspect-video w-full bg-slate-100" type="button" onClick={() => void applyHistoryVideo(record)}>
                    {record.thumbnailUrl ? (
                      <img alt="视频历史首帧" className="size-full object-cover" src={record.thumbnailUrl} />
                    ) : (
                      <Video className="m-auto size-6 text-slate-300" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 transition-colors group-hover:bg-slate-900/20">
                      <Play className="size-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </button>
                  <div className="flex items-center justify-between px-2 py-1 text-[10px] text-slate-500">
                    <span>{record.duration}s</span>
                    <span>{record.resultUrl ? '已完成' : '生成中'}</span>
                  </div>
                  <button
                    aria-label="删除视频历史"
                    className="absolute right-1 top-1 rounded bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    type="button"
                    onClick={() => removeHistory(record.id)}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-center text-xs text-rose-500">生成记录保留 7 天，请及时下载</p>
        </div>
      </div>
    </section>
  )
}
