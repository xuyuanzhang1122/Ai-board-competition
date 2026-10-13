import { Button, Tag } from '@lobehub/ui'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { notify } from '@/shared/feedback/feedback'
import type { StoryboardShotVO } from '@/shared/types/api'

import { getPropName } from './asset-binding-utils'
import { AssetSelectionModal } from './AssetSelectionModal'
import { BindingTile } from './BindingTile'
import type { ShotAssetBindings } from './useShotAssetBindings'

interface PropBindingsCellProps {
  bindings: ShotAssetBindings
  shot: StoryboardShotVO
}

export function PropBindingsCell({ bindings, shot }: PropBindingsCellProps) {
  const [selecting, setSelecting] = useState(false)
  const run = async (action: () => Promise<void>) => {
    try {
      await action()
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '移除道具失败')
    }
  }

  return (
    <>
      <div className="grid w-[120px] grid-cols-2 gap-2">
        {shot.props.slice(0, 3).map((prop) => (
          <BindingTile
            imageUrl={prop.thumbnailUrl}
            key={prop.bindingId}
            name={prop.propName}
            previewKey={`prop-${prop.bindingId}`}
            onClick={() => bindings.openProp(prop.propId)}
            onRemove={() => void run(() => bindings.unbind(prop.bindingId))}
          />
        ))}
        {shot.props.length > 3 ? <Tag>+{shot.props.length - 3}</Tag> : null}
        <Button
          className="!aspect-square !h-auto"
          icon={Plus}
          title="添加道具"
          type="dashed"
          onClick={() => setSelecting(true)}
        />
      </div>

      {selecting ? (
        <AssetSelectionModal
          open
          createLabel="创建新道具"
          title="绑定道具"
          assets={bindings.props.map((prop) => ({
            bound: shot.props.some(({ propId }) => propId === prop.id),
            id: prop.id,
            imageUrl: prop.thumbnailUrl,
            name: getPropName(prop),
          }))}
          onClose={() => setSelecting(false)}
          onDelete={({ id }) => bindings.deleteProp(id)}
          onBind={async (propId) => {
            await bindings.bindProp(propId)
            setSelecting(false)
          }}
          onCreate={() => {
            setSelecting(false)
            bindings.createProp()
          }}
        />
      ) : null}
    </>
  )
}
