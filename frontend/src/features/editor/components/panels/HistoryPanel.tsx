import { Button, Empty, Modal, Segmented, Select, Tag } from '@lobehub/ui'
import { ArrowLeft, Download, ExternalLink, ImageIcon, RefreshCw, Video } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { JobVO } from '@/shared/types/api'

import { jobApi } from '../../api'
import { useEditorStore } from '../../store'
import {
  classifyGenerationJob,
  type GenerationHistoryFilter,
  type GenerationHistorySort,
  getGenerationJobPreviewUrl,
  selectGenerationHistoryJobs,
} from './generation-history'

export interface HistoryPanelProps {
  onClose: () => void
}

const statusLabel = (status: JobVO['status']) => {
  if (status === 'SUCCEEDED' || status === 'COMPLETED') return '已完成'
  if (status === 'FAILED') return '失败'
  if (status === 'CANCELED') return '已取消'
  if (status === 'RUNNING' || status === 'GENERATING') return '生成中'
  return '等待中'
}

const statusColor = (status: JobVO['status']): 'blue' | 'default' | 'error' | 'success' | 'warning' => {
  if (status === 'SUCCEEDED' || status === 'COMPLETED') return 'success'
  if (status === 'FAILED') return 'error'
  if (status === 'RUNNING' || status === 'GENERATING') return 'blue'
  if (status === 'PENDING') return 'warning'
  return 'default'
}

export function HistoryPanel({ onClose }: HistoryPanelProps) {
  const projectId = useEditorStore((state) => state.projectId)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<GenerationHistoryFilter>('all')
  const [jobs, setJobs] = useState<JobVO[]>([])
  const [loading, setLoading] = useState(false)
  const [previewJob, setPreviewJob] = useState<JobVO | null>(null)
  const [sort, setSort] = useState<GenerationHistorySort>('date')

  const loadJobs = useCallback(async () => {
    if (!projectId) {
      setJobs([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const page = await jobApi.getUserJobs({ page: 1, projectId, size: 100 })
      setJobs(Array.isArray(page.records) ? page.records : [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '历史记录加载失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void loadJobs()
  }, [loadJobs])

  const visibleJobs = useMemo(
    () => selectGenerationHistoryJobs(jobs, { filter, projectId, sort }),
    [filter, jobs, projectId, sort],
  )

  const downloadResult = (job: JobVO) => {
    const url = getGenerationJobPreviewUrl(job)
    if (!url) return
    const link = document.createElement('a')
    link.href = url
    link.download = `${classifyGenerationJob(job.jobType) === 'video' ? 'video' : 'shot'}_${job.id}`
    link.target = '_blank'
    link.click()
  }

  const previewUrl = previewJob ? getGenerationJobPreviewUrl(previewJob) : null
  const previewType = previewJob ? classifyGenerationJob(previewJob.jobType) : null

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
        <div className="text-right">
          <h3 className="text-sm font-semibold text-slate-800">生成历史</h3>
          <p className="text-xs text-slate-400">当前项目的真实任务记录</p>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <Segmented
          block
          value={filter}
          options={[
            { label: '全部', value: 'all' },
            { label: '分镜图', value: 'shot_image' },
            { label: '视频', value: 'video' },
          ]}
          onChange={(value) => setFilter(value as GenerationHistoryFilter)}
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">共 {visibleJobs.length} 条</span>
          <div className="flex items-center gap-2">
            <Select
              size="small"
              value={sort}
              options={[
                { label: '按日期', value: 'date' },
                { label: '按类型', value: 'type' },
              ]}
              onChange={(value) => setSort(String(value) as GenerationHistorySort)}
            />
            <Button icon={RefreshCw} loading={loading} size="small" onClick={() => void loadJobs()}>
              刷新
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button className="mt-3" size="small" onClick={() => void loadJobs()}>重试</Button>
          </div>
        ) : loading && jobs.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">正在加载任务历史…</div>
        ) : visibleJobs.length === 0 ? (
          <Empty description="当前项目暂无生成记录" />
        ) : (
          <div className="space-y-3">
            {visibleJobs.map((job) => {
              const type = classifyGenerationJob(job.jobType)
              const url = getGenerationJobPreviewUrl(job)
              return (
                <article className="overflow-hidden rounded-xl border border-slate-200" key={job.id}>
                  <button
                    className="flex aspect-video w-full items-center justify-center bg-slate-50"
                    disabled={!url}
                    type="button"
                    onClick={() => setPreviewJob(job)}
                  >
                    {type === 'shot_image' && url ? (
                      <img alt={`任务 ${job.id} 分镜图`} className="size-full object-cover" src={url} />
                    ) : type === 'video' ? (
                      <div className="text-center text-slate-400">
                        <Video className="mx-auto mb-2 size-10" />
                        <span className="text-xs">{url ? '点击预览视频' : `任务进度 ${job.progress}%`}</span>
                      </div>
                    ) : (
                      <ImageIcon className="size-10 text-slate-300" />
                    )}
                  </button>
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Tag>{type === 'video' ? '视频' : '分镜图'}</Tag>
                        <Tag color={statusColor(job.status)}>{statusLabel(job.status)}</Tag>
                      </div>
                      <span className="text-xs text-slate-400">#{job.id}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{new Date(job.createdAt).toLocaleString('zh-CN')}</span>
                      <span>{job.costPoints == null ? '—' : `${job.costPoints} 积分`}</span>
                    </div>
                    {job.errorMessage ? <p className="text-xs text-red-500">{job.errorMessage}</p> : null}
                    {url ? (
                      <div className="flex justify-end gap-2">
                        <Button icon={ExternalLink} size="small" onClick={() => setPreviewJob(job)}>预览</Button>
                        <Button icon={Download} size="small" onClick={() => downloadResult(job)}>下载</Button>
                      </div>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      <Modal
        centered
        footer={null}
        open={Boolean(previewJob && previewUrl)}
        title={previewJob ? `任务 #${previewJob.id}` : '生成预览'}
        width={760}
        onCancel={() => setPreviewJob(null)}
      >
        {previewType === 'video' && previewUrl ? (
          <video controls className="max-h-[70vh] w-full rounded-lg bg-black" src={previewUrl} />
        ) : previewUrl ? (
          <img alt="生成结果预览" className="max-h-[70vh] w-full rounded-lg object-contain" src={previewUrl} />
        ) : null}
      </Modal>
    </section>
  )
}
