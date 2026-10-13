import { Button, Modal, Tag, TextArea } from '@lobehub/ui'
import { useEffect, useState } from 'react'

import { buildScriptChips } from './script-expand-chips'

export interface ScriptExpandModalProps {
  characters?: string[]
  maxLength?: number
  onClose: () => void
  onSave: (scriptText: string) => void
  open: boolean
  props?: string[]
  scenes?: string[]
  scriptText: string
  shotNo: number | string
}

export function ScriptExpandModal({
  characters = [],
  maxLength = 5000,
  onClose,
  onSave,
  open,
  props = [],
  scenes = [],
  scriptText,
  shotNo,
}: ScriptExpandModalProps) {
  const [draft, setDraft] = useState(scriptText)
  const chips = buildScriptChips(characters, scenes, props)

  useEffect(() => {
    if (!open) return
    // Reset draft to the latest scriptText whenever the modal opens.
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
    setDraft(scriptText)
  }, [open, scriptText])

  const handleSave = () => {
    const trimmed = draft.trim()
    if (trimmed !== (scriptText || '').trim()) {
      onSave(trimmed)
    }
    onClose()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      handleSave()
    }
  }

  return (
    <Modal
      centered
      open={open}
      title={`编辑分镜 #${shotNo}`}
      width={860}
      footer={
        <div className="flex items-center justify-between">
          <Tag>{draft.length} / {maxLength}</Tag>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button
              disabled={!draft.trim()}
              title="保存 (Ctrl+Enter)"
              type="primary"
              onClick={handleSave}
            >
              保存
            </Button>
          </div>
        </div>
      }
      onCancel={onClose}
    >
      <div className="flex flex-col gap-4">
        <TextArea
          autoFocus
          showCount
          maxLength={maxLength}
          resize={false}
          rows={18}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {chips.length === 0 ? (
            <span className="text-xs text-slate-400">未绑定角色 / 场景 / 道具</span>
          ) : (
            chips.map((chip) => (
              <span
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
                key={`${chip.type}:${chip.name}`}
                style={{
                  backgroundColor: `${chip.color}1A`,
                  border: `1px solid ${chip.color}40`,
                  color: chip.color,
                }}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: chip.color }}
                />
                {chip.name}
              </span>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
