import { Button, Input, Modal, Segmented, TextArea } from '@lobehub/ui'
import { type FormEvent, useState } from 'react'

import { notify } from '@/shared/feedback/feedback'
import type { CreateProjectDTO } from '@/shared/types/api'

interface CreateProjectModalProps {
  folderId: number | null
  loading: boolean
  onCancel: () => void
  onConfirm: (data: CreateProjectDTO) => Promise<void>
}

const FORM_ID = 'create-project-form'
const MAX_STORY_LENGTH = 5000

const STYLE_OPTIONS = [
  { label: '3DGC动漫', value: '3DGC' },
  { label: '写实', value: 'REALISTIC' },
] as const
type ProjectStyle = (typeof STYLE_OPTIONS)[number]['value']

export function CreateProjectModal({
  folderId,
  loading,
  onCancel,
  onConfirm,
}: CreateProjectModalProps) {
  const [projectName, setProjectName] = useState('')
  const [storyText, setStoryText] = useState('')
  const [styleCode, setStyleCode] = useState<ProjectStyle>('REALISTIC')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = projectName.trim()

    if (!name) {
      notify.warning('请输入项目名称')
      return
    }

    await onConfirm({
      aspectRatio: '16:9',
      folderId: folderId ?? undefined,
      name,
      rawText: storyText,
      styleCode,
    })
  }

  return (
    <Modal
      centered
      open
      maskClosable={!loading}
      title="创建作品"
      width={520}
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={loading} onClick={onCancel}>
            取消
          </Button>
          <Button form={FORM_ID} htmlType="submit" loading={loading} type="primary">
            创建
          </Button>
        </div>
      }
      onCancel={onCancel}
    >
      <form className="flex flex-col gap-5 pt-2" id={FORM_ID} onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
          项目名称
          <Input
            autoFocus
            disabled={loading}
            placeholder="请输入项目名称"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
          风格
          <Segmented
            block
            disabled={loading}
            options={STYLE_OPTIONS as unknown as { label: string; value: string }[]}
            value={styleCode}
            onChange={(value) => setStyleCode(value as ProjectStyle)}
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
          故事文案（选填）
          <TextArea
            showCount
            disabled={loading}
            maxLength={MAX_STORY_LENGTH}
            placeholder="输入你的故事文案..."
            resize={false}
            rows={6}
            value={storyText}
            onChange={(event) => setStoryText(event.target.value)}
          />
        </label>
      </form>
    </Modal>
  )
}
