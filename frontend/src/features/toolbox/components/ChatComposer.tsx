import { ArrowUp, ChevronDown, ImageIcon, MessageSquare, Plus, Video } from 'lucide-react'
import { useRef } from 'react'

import type { ModelVO } from '@/shared/types/api'

import type { MessageType } from '../api'
import { getComposerError, MAX_CHAT_LENGTH } from '../composer-validation'

interface Props {
  busy: boolean
  content: string
  locked: boolean
  model: string
  models: ModelVO[]
  onContentChange: (value: string) => void
  onModelChange: (value: string) => void
  onSend: () => void
  onTypeChange: (value: MessageType) => void
  type: MessageType
}
export function ChatComposer({
  content,
  onContentChange,
  model,
  onModelChange,
  models,
  type,
  onTypeChange,
  busy,
  locked,
  onSend,
}: Props) {
  const menuRef = useRef<HTMLDetailsElement>(null)
  const available = type === 'TEXT' && models.some((item) => item.code === model)
  const validationError = getComposerError(content)
  const disabled = busy || locked || !available || !content.trim() || !!validationError
  return (
    <div className="toolbox-composer-wrap">
      <form
        className="toolbox-composer"
        onSubmit={(event) => {
          event.preventDefault()
          if (!disabled) onSend()
        }}
      >
        <textarea
          aria-invalid={!!validationError}
          aria-label="消息内容"
          maxLength={MAX_CHAT_LENGTH}
          rows={1}
          value={content}
          placeholder={
            type === 'TEXT'
              ? '今天想聊点什么？'
              : `${type === 'IMAGE' ? '图片' : '视频'}生成暂未开放`
          }
          onChange={(event) => {
            onContentChange(event.target.value)
            event.target.style.height = 'auto'
            event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (!disabled) onSend()
            }
          }}
          onPaste={(event) => {
            const input = event.currentTarget
            const text = event.clipboardData.getData('text')
            const next =
              content.slice(0, input.selectionStart) + text + content.slice(input.selectionEnd)
            if (next.length > MAX_CHAT_LENGTH) {
              event.preventDefault()
              onContentChange(next)
            }
          }}
        />
        <div className="toolbox-composer-tools">
          <details className="toolbox-mode-menu" ref={menuRef}>
            <summary aria-label="选择创作类型" title="选择创作类型">
              <Plus size={22} />
            </summary>
            <div className="toolbox-mode-options">
              {(
                [
                  { value: 'TEXT', label: '文字对话', Icon: MessageSquare },
                  { value: 'IMAGE', label: '图片生成 · 暂未开放', Icon: ImageIcon },
                  { value: 'VIDEO', label: '视频生成 · 暂未开放', Icon: Video },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  aria-pressed={type === value}
                  key={value}
                  type="button"
                  onClick={() => {
                    onTypeChange(value)
                    if (menuRef.current) menuRef.current.open = false
                  }}
                >
                  <Icon size={17} />
                  {label}
                </button>
              ))}
            </div>
          </details>
          <span className="toolbox-type-label">
            {type === 'TEXT'
              ? '文字对话'
              : type === 'IMAGE'
                ? '图片生成暂未开放'
                : '视频生成暂未开放'}
          </span>
          <label className="toolbox-model-select">
            <select
              aria-label="选择文字模型"
              disabled={type !== 'TEXT' || models.length === 0 || busy || locked}
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
            >
              {models.length === 0 && <option value="">暂无可用文字模型</option>}
              {models.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </label>
          <button aria-label="发送消息" className="toolbox-send" disabled={disabled} type="submit">
            <ArrowUp size={22} />
          </button>
        </div>
      </form>
      {validationError && (
        <p className="toolbox-capability-note" role="alert">
          {validationError}
        </p>
      )}
      {type !== 'TEXT' && (
        <p className="toolbox-capability-note" role="status">
          {type === 'IMAGE' ? '图片' : '视频'}
          生成暂未开放，当前不会提交媒体任务。请选择文字对话继续。
        </p>
      )}
    </div>
  )
}
