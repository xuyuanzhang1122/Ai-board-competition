import { Button, Modal, Select } from '@lobehub/ui'
import { useState } from 'react'

import type { FolderVO, ProjectVO } from '@/shared/types/api'

interface MoveProjectModalProps {
  folders: FolderVO[]
  loading: boolean
  onCancel: () => void
  onConfirm: (folderId: number | null) => Promise<void>
  project: ProjectVO | null
}

const UNCATEGORIZED = 'uncategorized'

export function MoveProjectModal({
  folders,
  loading,
  onCancel,
  onConfirm,
  project,
}: MoveProjectModalProps) {
  const [selectedFolder, setSelectedFolder] = useState<number | typeof UNCATEGORIZED>(
    project?.folderId ?? UNCATEGORIZED,
  )

  return (
    <Modal
      centered
      open
      maskClosable={!loading}
      title="移动项目"
      width={440}
      footer={
        <div className="flex justify-end gap-2">
          <Button disabled={loading} onClick={onCancel}>
            取消
          </Button>
          <Button
            loading={loading}
            type="primary"
            onClick={() => onConfirm(selectedFolder === UNCATEGORIZED ? null : selectedFolder)}
          >
            确认移动
          </Button>
        </div>
      }
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-3 pt-2">
        <p className="text-sm text-muted-foreground">
          将 <span className="font-medium text-foreground">{project?.name}</span> 移动到：
        </p>
        <Select
          disabled={loading}
          value={selectedFolder}
          options={[
            { label: '未分类', value: UNCATEGORIZED },
            ...folders.map((folder) => ({ label: folder.name, value: folder.id })),
          ]}
          onChange={(value) => setSelectedFolder(value as number | typeof UNCATEGORIZED)}
        />
      </div>
    </Modal>
  )
}
