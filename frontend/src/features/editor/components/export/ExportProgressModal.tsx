import { Button, Modal } from '@lobehub/ui'
import { AlertCircle, Check, Download, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { JobVO } from '@/shared/types/api'

import { exportApi } from '../../api'
import { pollExportJob } from './export-state'

export interface ExportProgressModalProps {
  jobId: number
  onClose: () => void
}

const statusText = (job: JobVO | null, error: string | null): string => {
  if (error) return '导出失败'
  if (!job) return '初始化中...'
  switch (job.status) {
    case 'PENDING': {
      return '等待处理中...'
    }
    case 'RUNNING':
    case 'GENERATING': {
      return '正在导出...'
    }
    case 'COMPLETED':
    case 'SUCCEEDED': {
      return '导出完成！'
    }
    case 'FAILED': {
      return '导出失败'
    }
    default: {
      return '处理中...'
    }
  }
}

const canDownload = (job: JobVO | null, error: string | null): boolean =>
  (job?.status === 'COMPLETED' || job?.status === 'SUCCEEDED') && !error

export function ExportProgressModal({ jobId, onClose }: ExportProgressModalProps) {
  const [job, setJob] = useState<JobVO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const progress = job?.progress ?? 0
  const doneItems = job?.doneItems ?? 0
  const totalItems = job?.totalItems ?? 0
  const completed = canDownload(job, error)

  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    abortControllerRef.current = controller

    const run = async () => {
      try {
        const finalJob = await pollExportJob(
          jobId,
          (updated) => {
            if (!cancelled) setJob(updated)
          },
          controller.signal,
        )
        if (!cancelled) setJob(finalJob)
      } catch (pollError) {
        if (cancelled || controller.signal.aborted) return
        const message = pollError instanceof Error ? pollError.message : '导出失败'
        if (!cancelled) setError(message)
      }
    }

    void run()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [jobId])

  const handleDownload = async () => {
    if (!completed || downloading) return
    setDownloading(true)
    try {
      await exportApi.downloadExportFile(jobId)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : '下载失败'
      setError(`下载失败: ${message}`)
    } finally {
      setDownloading(false)
    }
  }

  const StatusIcon = completed
    ? Check
    : error
      ? AlertCircle
      : Loader2

  return (
    <Modal
      centered
      open
      maskClosable={completed || !!error}
      title="导出进度"
      width={480}
      footer={
        completed ? (
          <Button
            block
            icon={Download}
            loading={downloading}
            type="primary"
            onClick={() => void handleDownload()}
          >
            下载导出文件
          </Button>
        ) : error ? (
          <Button block onClick={onClose}>关闭</Button>
        ) : null
      }
      onCancel={completed || !!error ? onClose : undefined}
    >
      <div className="flex flex-col items-center px-4 py-6">
        <div
          className={`mb-6 flex size-28 items-center justify-center rounded-2xl border-2 ${
            completed
              ? 'border-green-200 bg-green-50'
              : error
                ? 'border-red-200 bg-red-50'
                : 'border-purple-200 bg-purple-50'
          }`}
        >
          <StatusIcon
            className={`size-14 ${
              completed
                ? 'text-green-500'
                : error
                  ? 'text-red-500'
                  : 'animate-spin text-purple-500'
            }`}
          />
        </div>

        <div className="mb-6 text-center">
          <p className="mb-2 text-xl font-semibold text-slate-900">{statusText(job, error)}</p>
          {job && totalItems > 0 ? (
            <p className="text-sm text-slate-500">
              已完成 {doneItems} / {totalItems} 项
            </p>
          ) : null}
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </div>

        {!completed && !error ? (
          <div className="w-full">
            <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-sm font-medium text-purple-600">{progress}%</p>
            <p className="mt-3 text-center text-xs text-slate-400">导出正在后台处理中,请稍候...</p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
