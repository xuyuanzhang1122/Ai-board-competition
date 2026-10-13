import { Button, Tag } from '@lobehub/ui'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { notify } from '@/shared/feedback/feedback'
import type { StoryboardShotVO } from '@/shared/types/api'

import { getCharacterName } from './asset-binding-utils'
import { AssetSelectionModal } from './AssetSelectionModal'
import { BindingTile } from './BindingTile'
import type { ShotAssetBindings } from './useShotAssetBindings'

interface CharacterBindingsCellProps {
  bindings: ShotAssetBindings
  shot: StoryboardShotVO
}

const run = async (action: () => Promise<void>, fallback: string) => {
  try {
    await action()
  } catch (error) {
    notify.error(error instanceof Error ? error.message : fallback)
  }
}

export function CharacterBindingsCell({ bindings, shot }: CharacterBindingsCellProps) {
  const [selecting, setSelecting] = useState(false)

  return (
    <>
      <div className="grid w-[196px] grid-cols-3 gap-2">
        {shot.characters.slice(0, 5).map((character) => {
          const projectCharacter = bindings.characters.find(
            (item) => item.id === character.characterId,
          )
          return (
            <BindingTile
              imageUrl={character.thumbnailUrl}
              key={character.bindingId}
              name={character.characterName}
              previewKey={`character-${character.bindingId}`}
              previewVariant="detail"
              description={
                projectCharacter?.finalDescription ||
                projectCharacter?.overrideDescription ||
                projectCharacter?.description
              }
              onClick={() => bindings.openCharacter(character.characterId)}
              onRemove={() => void run(() => bindings.unbind(character.bindingId), '移除角色失败')}
            />
          )
        })}
        {shot.characters.length > 5 ? <Tag>+{shot.characters.length - 5}</Tag> : null}
        <Button
          className="!aspect-square !h-auto"
          icon={Plus}
          title="添加角色"
          type="dashed"
          onClick={() => setSelecting(true)}
        />
      </div>

      {selecting ? (
        <AssetSelectionModal
          open
          createLabel="创建新角色"
          title="绑定角色"
          assets={bindings.characters.map((character) => ({
            bound: shot.characters.some(({ characterId }) => characterId === character.id),
            id: character.id,
            imageUrl: character.thumbnailUrl,
            name: getCharacterName(character),
          }))}
          onClose={() => setSelecting(false)}
          onDelete={({ id }) => bindings.deleteCharacter(id)}
          onBind={async (characterId) => {
            await bindings.bindCharacter(characterId)
            setSelecting(false)
          }}
          onCreate={() => {
            setSelecting(false)
            bindings.createCharacter()
          }}
        />
      ) : null}
    </>
  )
}
