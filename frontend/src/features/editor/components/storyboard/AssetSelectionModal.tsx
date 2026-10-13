import { ActionIcon, Button, Empty, Modal } from '@lobehub/ui'
import { ImageOff, Plus, Trash2 } from 'lucide-react'

import { confirmAction, notify } from '@/shared/feedback/feedback'

export interface SelectableAsset {
  bound?: boolean
  id: number
  imageUrl?: string | null
  name: string
}

interface AssetSelectionModalProps {
  assets: SelectableAsset[]
  createLabel: string
  onBind: (assetId: number) => Promise<void>
  onClose: () => void
  onCreate: () => void
  onDelete: (asset: SelectableAsset) => Promise<void>
  open: boolean
  title: string
}

const runAction = async (action: () => Promise<void>, fallback: string) => {
  try {
    await action()
  } catch (error) {
    notify.error(error instanceof Error ? error.message : fallback)
  }
}

export function AssetSelectionModal({
  assets,
  createLabel,
  onBind,
  onClose,
  onCreate,
  onDelete,
  open,
  title,
}: AssetSelectionModalProps) {
  return (
    <Modal
      centered
      open={open}
      title={title}
      width={680}
      footer={
        <div className="flex justify-between">
          <Button icon={Plus} onClick={onCreate}>
            {createLabel}
          </Button>
          <Button onClick={onClose}>关闭</Button>
        </div>
      }
      onCancel={onClose}
    >
      {assets.length === 0 ? (
        <Empty description="暂无可绑定资产" />
      ) : (
        <div className="grid max-h-[480px] grid-cols-4 gap-3 overflow-y-auto py-2">
          {assets.map((asset) => (
            <div className="group/select relative rounded-xl border border-slate-200 p-2" key={asset.id}>
              <button
                className="w-full text-left disabled:cursor-default"
                disabled={asset.bound}
                type="button"
                onClick={() => void runAction(() => onBind(asset.id), '绑定失败')}
              >
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                  {asset.imageUrl ? (
                    <img alt={asset.name} className="size-full object-cover" src={asset.imageUrl} />
                  ) : (
                    <ImageOff aria-hidden className="size-8 text-slate-300" />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-1 text-sm font-medium text-slate-800">
                  <span className="truncate">{asset.name}</span>
                  {asset.bound ? <span className="text-xs text-blue-600">已绑定</span> : null}
                </div>
              </button>
              <ActionIcon
                className="!absolute right-3 top-3 opacity-0 transition group-hover/select:opacity-100"
                color="red"
                icon={Trash2}
                size="small"
                title={`删除${asset.name}`}
                onClick={() => {
                  void confirmAction(`确定删除“${asset.name}”吗？`, {
                    confirmLabel: '删除资产', danger: true, title: '删除资产',
                  }).then((confirmed) => {
                    if (confirmed) void runAction(() => onDelete(asset), '删除失败')
                  })
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
