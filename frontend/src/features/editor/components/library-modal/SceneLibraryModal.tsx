import { App } from 'antd'
import { Image as ImageIcon } from 'lucide-react'
import { useCallback } from 'react'

import { sceneApi } from '../../api'
import { useEditorStore } from '../../store'
import type { ControlledLibraryModalProps } from '../panels/DefaultPanel'
import { LibraryModalShell } from './LibraryModalShell'
import { useLibraryModal } from './useLibraryModal'

export function SceneLibraryModal({
  onAdded,
  onClose,
  projectId,
}: ControlledLibraryModalProps) {
  const { message } = App.useApp()
  const fetchScenes = useEditorStore((state) => state.fetchScenes)
  const clearLocalImageHistoryByName = useEditorStore(
    (state) => state.clearLocalImageHistoryByName,
  )

  const canDelete = useCallback((asset: { name: string }) => {
    const shots = useEditorStore.getState().shots
    const boundShotNames = shots
      .filter((shot) => shot.scene?.sceneName === asset.name)
      .map((shot) => `分镜${shot.shotNo}`)

    if (boundShotNames.length > 0) {
      return `场景「${asset.name}」已被绑定到${boundShotNames.join('、')}，请先在分镜表中解绑后再删除`
    }
    return undefined
  }, [])

  const { operations, state } = useLibraryModal<'scene'>({
    type: 'scene',
    projectId,
    api: {
      getCategories: sceneApi.getSceneCategories,
      getAssets: sceneApi.getLibraryScenes,
      createFromLibrary: sceneApi.createFromLibrary,
      updateLibraryAsset: sceneApi.updateLibraryScene,
      deleteLibraryAsset: sceneApi.deleteLibraryScene,
      createCategory: sceneApi.createCategory,
    },
    fetchProjectAssets: fetchScenes,
    clearLocalImageHistoryByName,
    onAdded,
    onClose,
    notifier: {
      error: (text) => message.error(text),
      success: (text) => message.success(text),
      warning: (text) => message.warning(text),
    },
    canDelete,
  })

  return (
    <LibraryModalShell
      addLabel="添加到项目"
      deleteLabel="删除场景"
      emptyDescription="场景库为空"
      operations={operations}
      placeholderIcon={ImageIcon}
      searchPlaceholder="搜索场景名称或描述..."
      state={state}
      title="从场景库中选择"
      type="scene"
      onClose={onClose}
    />
  )
}
