import { ArrowUp, ChevronDown, Plus } from 'lucide-react'
import { type ChangeEvent, useLayoutEffect, useRef, useState } from 'react'

import type { ModelVO } from '@/shared/types/api'

import { CHAT_FILE_ACCEPT, importChatDocument } from '../chat-input-document'
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
}
export function ChatComposer({
  content,
  onContentChange,
  model,
  onModelChange,
  models,
  busy,
  locked,
  onSend,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const messageInput = useRef<HTMLTextAreaElement>(null)
  const [reading, setReading] = useState(false)
  const [fileError, setFileError] = useState('')
  const available = models.some((item) => item.code === model)
  const validationError = getComposerError(content)
  const disabled = busy || locked || reading || !available || !content.trim() || !!validationError

  useLayoutEffect(() => {
    const input = messageInput.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`
  }, [content])

  const addFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const picker = event.currentTarget
    const file = picker.files?.[0]
    picker.value = ''
    if (!file) return
    setFileError('')
    setReading(true)
    try {
      const draft = await importChatDocument(file, () => messageInput.current?.value ?? '')
      if (fileInput.current !== picker) return
      onContentChange(draft)
      messageInput.current?.focus()
    } catch (error) {
      if (fileInput.current === picker)
        setFileError(error instanceof Error ? error.message : '无法读取文件，请重试。')
    } finally {
      if (fileInput.current === picker) setReading(false)
    }
  }

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
          placeholder="今天想聊点什么？"
          ref={messageInput}
          onChange={(event) => {
            onContentChange(event.target.value)
            if (fileError) setFileError('')
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
          <input
            accept={CHAT_FILE_ACCEPT}
            hidden
            ref={fileInput}
            type="file"
            onChange={(event) => void addFile(event)}
          />
          <button
            aria-label="添加照片或文档"
            className="toolbox-add-file"
            disabled={reading || busy || locked}
            title="添加照片或文档"
            type="button"
            onClick={() => fileInput.current?.click()}
          >
            <Plus aria-hidden size={22} />
          </button>
          <label className="toolbox-model-select">
            <select
              aria-label="选择文字模型"
              disabled={models.length === 0 || busy || locked}
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
          <button
            aria-busy={busy}
            aria-label="发送消息"
            className="toolbox-send"
            disabled={disabled}
            type="submit"
          >
            {busy ? (
              <span aria-label="正在发送" className="toolbox-thinking-dot" role="status" />
            ) : (
              <ArrowUp size={22} />
            )}
          </button>
        </div>
      </form>
      {validationError && (
        <p className="toolbox-capability-note" role="alert">
          {validationError}
        </p>
      )}
      {fileError && (
        <p className="toolbox-capability-note" role="alert">{fileError}</p>
      )}
    </div>
  )
}
