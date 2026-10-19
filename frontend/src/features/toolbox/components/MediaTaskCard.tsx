import {
  CircleAlert,
  Download,
  ExternalLink,
  ImageIcon,
  LoaderCircle,
  Square,
  Video,
  X,
} from 'lucide-react'

import type { ChatMessage } from '../api'

interface Props {
  message: ChatMessage
  onCancel: (id: number) => void
  /** Only pass an actual measurement supplied by the server. */
  progress?: number | null
}
export function MediaTaskCard({ message, onCancel, progress }: Props) {
  const image = message.type === 'IMAGE'
  const active = message.status === 'PENDING' || message.status === 'RUNNING'
  const realProgress =
    active &&
    typeof progress === 'number' &&
    Number.isFinite(progress) &&
    progress >= 0 &&
    progress <= 100
      ? progress
      : null
  const title =
    message.status === 'PENDING'
      ? '任务已排队'
      : message.status === 'RUNNING'
        ? realProgress !== null && realProgress >= 95
          ? '即将完成'
          : image
            ? '正在创建图像'
            : '正在创建视频'
        : message.status === 'SUCCEEDED'
          ? image
            ? '图像已创建'
            : '视频已创建'
          : message.status === 'FAILED'
            ? '创建失败'
            : '已取消'
  return (
    <section aria-label={image ? '图像任务' : '视频任务'} className="toolbox-media-card">
      <h3 aria-live="polite">{title}</h3>
      {active ? (
        <>
          <div aria-label={title} className="toolbox-media-canvas" role="status">
            <div className="toolbox-media-loading-mark">
              <LoaderCircle className="toolbox-spinner" size={34} strokeWidth={1.3} />
            </div>
            {realProgress !== null && (
              <span className="toolbox-media-progress">{Math.round(realProgress)}%</span>
            )}
          </div>
          <div className="toolbox-media-task-actions">
            <button
              title="停止任务不会保证上游已停止或退款"
              type="button"
              onClick={() => onCancel(message.id)}
            >
              <Square size={12} />
              停止任务
            </button>
          </div>
        </>
      ) : message.status === 'SUCCEEDED' ? (
        message.resultUrl ? (
          <>
            <div className="toolbox-media-result">
              {image ? (
                <img alt="生成的图像" src={message.resultUrl} />
              ) : (
                <video controls src={message.resultUrl} />
              )}
            </div>
            <div className="toolbox-media-result-actions">
              <a download={`toolbox-${message.id}`} href={message.resultUrl}>
                <Download size={17} />
                下载{image ? '图像' : '视频'}
              </a>
              <a href={message.resultUrl} rel="noreferrer" target="_blank">
                <ExternalLink size={16} />
                查看原图
              </a>
            </div>
          </>
        ) : (
          <p className="toolbox-media-terminal">
            <CircleAlert size={18} />
            任务已完成，但服务端尚未提供结果地址。
          </p>
        )
      ) : (
        <div
          className="toolbox-media-terminal"
          role={message.status === 'FAILED' ? 'alert' : 'status'}
        >
          {message.status === 'FAILED' ? <CircleAlert size={20} /> : <X size={20} />}
          <div>
            <p>
              {message.status === 'FAILED'
                ? message.errorMessage || '本次创建未完成，请稍后重试。'
                : '此任务已取消。上游已接受的调用可能仍会执行。'}
            </p>
            <span>
              {image ? <ImageIcon size={15} /> : <Video size={15} />}
              {image ? '图像任务' : '视频任务'}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
