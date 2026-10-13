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
    <div className="flex min-w-[112px] items-center gap-1 opacity-30 transition-opacity group-hover/shot:opacity-100">
      <ActionIcon
        disabled={isFirst}
        icon={MoveUp}
        title="向上合并"
        onClick={onMergeUp}
      />
      <ActionIcon
        disabled={isLast}
        icon={MoveDown}
        title="向下合并"
        onClick={onMergeDown}
      />
      <ActionIcon color="red" icon={Trash2} title="删除分镜" onClick={onDelete} />
    </div>
  )
}
