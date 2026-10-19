import { Markdown } from '@lobehub/ui'
import { Check, Copy, Download, ImageIcon, LoaderCircle, Square, Video } from 'lucide-react'
import { useState } from 'react'

import type { ChatMessage } from '../api'
import { isActiveTask } from '../store'

export function ConversationMessage({
  message,
  onCancel,
}: {
  message: ChatMessage
  onCancel: (id: number) => void
}) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  if (message.role === 'USER')
    return (
      <div className="toolbox-user-row">
        <div className="toolbox-user-bubble">{message.content}</div>
      </div>
    )
  const active = isActiveTask(message)
  const media = message.type !== 'TEXT'
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setCopyError(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError(true)
    }
  }
  return (
    <article aria-label="助手回复" className="toolbox-assistant">
      {media ? (
        <div className="toolbox-media-task">
          {message.type === 'IMAGE' ? <ImageIcon size={22} /> : <Video size={22} />}
          <span>
            {active
              ? message.status === 'PENDING'
                ? '任务已排队'
                : `正在生成${message.type === 'IMAGE' ? '图片' : '视频'}`
              : message.status === 'SUCCEEDED'
                ? '生成完成'
                : '媒体任务'}
          </span>
          {message.resultUrl &&
            message.status === 'SUCCEEDED' &&
            (message.type === 'IMAGE' ? (
              <img alt="生成结果" src={message.resultUrl} />
            ) : (
              <video controls src={message.resultUrl} />
            ))}
          {message.resultUrl && (
            <a href={message.resultUrl} rel="noreferrer" target="_blank">
              <Download size={16} />
              查看原始结果
            </a>
          )}
        </div>
      ) : message.content ? (
        <div className="toolbox-markdown">
          <Markdown>{message.content}</Markdown>
        </div>
      ) : null}
      {active && (
        <div className="toolbox-task-status" role="status">
          <LoaderCircle className="toolbox-spinner" size={16} />
          <span>{message.status === 'PENDING' ? '已提交，等待处理' : '正在思考…'}</span>
          <button
            title="停止任务不会保证上游已停止或退款"
            type="button"
            onClick={() => onCancel(message.id)}
          >
            <Square size={12} />
            停止任务
          </button>
        </div>
      )}
      {message.status === 'FAILED' && (
        <p className="toolbox-message-error" role="alert">
          {message.errorMessage || '生成失败，请稍后发起新消息。'}
        </p>
      )}
      {message.status === 'CANCELED' && (
        <p className="toolbox-task-status">任务已取消。上游已接受的调用可能仍会执行。</p>
      )}
      {!active && message.content && (
        <div className="toolbox-message-actions">
          <button
            aria-label={copied ? '已复制' : '复制回复'}
            title={copied ? '已复制' : '复制回复'}
            type="button"
            onClick={() => void copy()}
          >
            {copied ? <Check size={17} /> : <Copy size={17} />}
          </button>
          {copyError && <span role="alert">复制失败，请手动选择文本复制</span>}
        </div>
      )}
    </article>
  )
}
