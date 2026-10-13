import { App } from 'antd'
import { Package } from 'lucide-react'
import { useCallback } from 'react'

import { propApi } from '../../api'
import { useEditorStore } from '../../store'
import type { ControlledLibraryModalProps } from '../panels/DefaultPanel'
import { LibraryModalShell } from './LibraryModalShell'
import { useLibraryModal } from './useLibraryModal'

export function PropLibraryModal({
  onAdded,
  onClose,
  projectId,
}: ControlledLibraryModalProps) {
  const { message } = App.useApp()
  const fetchProps = useEditorStore((state) => state.fetchProps)
  const clearLocalImageHistoryByName = useEditorStore(
    (state) => state.clearLocalImageHistoryByName,
  )

  const canDelete = useCallback((asset: { name: string }) => {
    const shots = useEditorStore.getState().shots
    const boundShotNames = shots
      .filter((shot) => shot.props.some((prop) => prop.propName === asset.name))
      .map((shot) => `分镜${shot.shotNo}`)

    if (boundShotNames.length > 0) {
      return `道具「${asset.name}」已被绑定到${boundShotNames.join('、')}，请先在分镜表中解绑后再删除`
    }
    return undefined
  }, [])

  const { operations, state } = useLibraryModal<'prop'>({
    type: 'prop',
    projectId,
    api: {
      getCategories: propApi.getPropCategories,
      getAssets: propApi.getLibraryProps,
      createFromLibrary: propApi.createFromLibrary,
      updateLibraryAsset: propApi.updateLibraryProp,
      deleteLibraryAsset: propApi.deleteLibraryProp,
      createCategory: propApi.createCategory,
    },
    fetchProjectAssets: fetchProps,
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
      deleteLabel="删除道具"
      emptyDescription="道具库为空"
      operations={operations}
      placeholderIcon={Package}
      searchPlaceholder="搜索道具名称或描述..."
      state={state}
      title="从道具库中选择"
      type="prop"
      onClose={onClose}
    />
  )
}
