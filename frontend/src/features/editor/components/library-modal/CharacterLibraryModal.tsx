import { App } from 'antd'
import { UserRound } from 'lucide-react'
import { useCallback } from 'react'

import { characterApi } from '../../api'
import { useEditorStore } from '../../store'
import type { ControlledLibraryModalProps } from '../panels/DefaultPanel'
import { LibraryModalShell } from './LibraryModalShell'
import { useLibraryModal } from './useLibraryModal'

export function CharacterLibraryModal({
  onAdded,
  onClose,
  projectId,
}: ControlledLibraryModalProps) {
  const { message } = App.useApp()
  const fetchCharacters = useEditorStore((state) => state.fetchCharacters)
  const clearLocalImageHistoryByName = useEditorStore(
    (state) => state.clearLocalImageHistoryByName,
  )

  const canDelete = useCallback((asset: { name: string }) => {
    const shots = useEditorStore.getState().shots
    const boundShotNames = shots
      .filter((shot) =>
        shot.characters.some((character) => character.characterName === asset.name),
      )
      .map((shot) => `分镜${shot.shotNo}`)

    if (boundShotNames.length > 0) {
      return `角色「${asset.name}」已被绑定到${boundShotNames.join('、')}，请先在分镜表中解绑后再删除`
    }
    return undefined
  }, [])

  const { operations, state } = useLibraryModal<'character'>({
    type: 'character',
    projectId,
    api: {
      getCategories: characterApi.getCharacterCategories,
      getAssets: characterApi.getLibraryCharacters,
      createFromLibrary: characterApi.createFromLibrary,
      updateLibraryAsset: characterApi.updateLibraryCharacter,
      deleteLibraryAsset: characterApi.deleteLibraryCharacter,
      createCategory: characterApi.createCategory,
    },
    fetchProjectAssets: fetchCharacters,
    clearLocalImageHistoryByName,
    onAdded,
    onClose,
    notifier: {
      error: (text) => message.error(text),
      success: (text) => message.success(text),
      warning: (text) => message.warning(text),
    },
    canDelete,
    deleteThumbnail: async (asset) => {
      await characterApi.updateLibraryCharacter(asset.id, {
        name: asset.name,
        description: asset.description || '',
        categoryId: asset.categoryId,
        thumbnailUrl: null,
      })
    },
  })

  return (
    <LibraryModalShell
      addLabel="添加到项目"
      deleteLabel="删除角色"
      emptyDescription="角色库为空"
      operations={operations}
      placeholderIcon={UserRound}
      searchPlaceholder="搜索角色名称或描述..."
      state={state}
      title="从角色库中选择"
      type="character"
      onClose={onClose}
    />
  )
}
