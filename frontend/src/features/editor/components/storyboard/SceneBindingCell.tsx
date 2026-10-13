import { Button } from '@lobehub/ui'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { notify } from '@/shared/feedback/feedback'
import type { StoryboardShotVO } from '@/shared/types/api'

import { getSceneName } from './asset-binding-utils'
import { AssetSelectionModal } from './AssetSelectionModal'
import { BindingTile } from './BindingTile'
import type { ShotAssetBindings } from './useShotAssetBindings'

interface SceneBindingCellProps {
  bindings: ShotAssetBindings
  shot: StoryboardShotVO
}

export function SceneBindingCell({ bindings, shot }: SceneBindingCellProps) {
  const [selecting, setSelecting] = useState(false)
  const run = async (action: () => Promise<void>) => {
    try {
      await action()
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '移除场景失败')
    }
  }

  return (
    <>
      <div className="grid w-[120px] grid-cols-2 gap-2">
        {shot.scene ? (
          <BindingTile
            imageUrl={shot.scene.thumbnailUrl}
            name={shot.scene.sceneName}
            previewKey={`scene-${shot.scene.bindingId}`}
            onClick={() => bindings.openScene(shot.scene?.sceneId || 0)}
            onRemove={() => void run(() => bindings.unbind(shot.scene?.bindingId || 0))}
          />
        ) : null}
        <Button
          className="!aspect-square !h-auto"
          icon={Plus}
          title="添加场景"
          type="dashed"
          onClick={() => setSelecting(true)}
        />
      </div>

      {selecting ? (
        <AssetSelectionModal
          open
          createLabel="创建新场景"
          title="绑定场景"
          assets={bindings.scenes.map((scene) => ({
            bound: shot.scene?.sceneId === scene.id,
            id: scene.id,
            imageUrl: scene.thumbnailUrl,
            name: getSceneName(scene),
          }))}
          onClose={() => setSelecting(false)}
          onDelete={({ id }) => bindings.deleteScene(id)}
          onBind={async (sceneId) => {
            await bindings.bindScene(sceneId)
            setSelecting(false)
          }}
          onCreate={() => {
            setSelecting(false)
            bindings.createScene()
          }}
        />
      ) : null}
    </>
  )
}
