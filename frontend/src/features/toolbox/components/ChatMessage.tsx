import { Markdown } from '@lobehub/ui'
import { Check, Copy, Square } from 'lucide-react'
import { useState } from 'react'

import type { ChatMessage } from '../api'
import { isActiveTask } from '../store'
import { MediaTaskCard } from './MediaTaskCard'

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
  if (message.type !== 'TEXT')
    return (
      <article aria-label="助手回复" className="toolbox-assistant">
        <MediaTaskCard message={message} onCancel={onCancel} />
      </article>
    )
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
      {message.content ? (
        <div className="toolbox-markdown">
          <Markdown>{message.content}</Markdown>
        </div>
      ) : null}
      {active && (
        <div className="toolbox-task-status">
          <span aria-label="正在生成回复" className="toolbox-thinking-dot" role="status" />
          <button
            aria-label="停止生成"
            title="停止生成；上游已接受的调用可能仍会执行"
            type="button"
            onClick={() => onCancel(message.id)}
          >
            <Square size={12} />
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
