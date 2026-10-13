import { Button, Input, Modal } from '@lobehub/ui'
import { type FormEvent, useState } from 'react'

interface FolderModalProps {
  initialName?: string
  loading: boolean
  onCancel: () => void
  onConfirm: (name: string) => Promise<void>
  title: string
}

const FORM_ID = 'folder-form'

export function FolderModal({
  initialName = '',
  loading,
  onCancel,
  onConfirm,
  title,
}: FolderModalProps) {
  const [name, setName] = useState(initialName)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName) await onConfirm(trimmedName)
  }

  return (
    <Modal
      centered
      open
      maskClosable={!loading}
      title={title}
      width={440}
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={loading} onClick={onCancel}>
            取消
          </Button>
          <Button
            disabled={!name.trim()}
            form={FORM_ID}
            htmlType="submit"
            loading={loading}
            type="primary"
          >
            确认
          </Button>
        </div>
      }
      onCancel={onCancel}
    >
      <form className="pt-2" id={FORM_ID} onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
          文件夹名称
          <Input
            autoFocus
            disabled={loading}
            maxLength={50}
            placeholder="请输入文件夹名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </form>
    </Modal>
  )
}
