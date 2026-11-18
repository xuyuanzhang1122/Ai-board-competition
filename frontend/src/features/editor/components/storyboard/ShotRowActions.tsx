import { ActionIcon } from '@lobehub/ui'
import { MoveDown, MoveUp, Trash2 } from 'lucide-react'

interface ShotRowActionsProps {
  isFirst: boolean
  isLast: boolean
  onDelete: () => void
  onMergeDown: () => void
  onMergeUp: () => void
}

export function ShotRowActions({
  isFirst,
  isLast,
  onDelete,
  onMergeDown,
  onMergeUp,
}: ShotRowActionsProps) {
  return (
    <div className="storyboard-actions flex flex-col items-center gap-1">
      <ActionIcon
        disabled={isFirst}
        icon={MoveUp}
        size="small"
        title="向上合并"
        onClick={onMergeUp}
      />
      <ActionIcon
        disabled={isLast}
        icon={MoveDown}
        size="small"
        title="向下合并"
        onClick={onMergeDown}
      />
      <ActionIcon color="red" icon={Trash2} size="small" title="删除分镜" onClick={onDelete} />
    </div>
  )
}
