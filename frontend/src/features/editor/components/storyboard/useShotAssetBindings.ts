import type { StoryboardShotVO } from '@/shared/types/api'

import { characterApi, propApi, sceneApi, shotApi } from '../../api'
import { usePanelManagerStore } from '../../panel-manager-store'
import { useEditorStore } from '../../store'
import {
  buildAssetEditPanelData,
  editablePropDescription,
  getCharacterName,
  getPropName,
  getSceneName,
  replaceSceneBinding,
} from './asset-binding-utils'

export function useShotAssetBindings(shot: StoryboardShotVO) {
  const projectId = useEditorStore((state) => state.projectId)
  const originalScript = useEditorStore((state) => state.originalScript)
  const characters = useEditorStore((state) => state.characters)
  const scenes = useEditorStore((state) => state.scenes)
  const props = useEditorStore((state) => state.props)
  const fetchCharacters = useEditorStore((state) => state.fetchCharacters)
  const fetchScenes = useEditorStore((state) => state.fetchScenes)
  const fetchProps = useEditorStore((state) => state.fetchProps)
  const fetchShots = useEditorStore((state) => state.fetchShots)
  const clearLocalImageHistory = useEditorStore((state) => state.clearLocalImageHistory)
  const clearLocalImageHistoryByName = useEditorStore(
    (state) => state.clearLocalImageHistoryByName,
  )
  const openPanel = usePanelManagerStore((state) => state.openPanel)

  const scriptText = originalScript || shot.scriptText
  const requireProjectId = () => {
    if (!projectId) throw new Error('项目尚未加载')
    return projectId
  }
  const openCharacter = (characterId: number) => {
    const character = characters.find(({ id }) => id === characterId)
    const bound = shot.characters.find((item) => item.characterId === characterId)
    const name = character ? getCharacterName(character) : bound?.characterName || '未命名角色'
    openPanel(
      'asset-edit',
      buildAssetEditPanelData({
        assetId: characterId,
        assetType: 'character',
        description: character?.finalDescription || character?.description,
        name,
        scriptText,
        shotId: shot.id,
        thumbnailUrl: character?.thumbnailUrl || bound?.thumbnailUrl,
      }),
    )
  }
  const openScene = (sceneId: number) => {
    const scene = scenes.find(({ id }) => id === sceneId)
    openPanel(
      'asset-edit',
      buildAssetEditPanelData({
        assetId: sceneId,
        assetType: 'scene',
        description: scene?.finalDescription,
        name: scene ? getSceneName(scene) : shot.scene?.sceneName || '未命名场景',
        scriptText,
        shotId: shot.id,
        thumbnailUrl: scene?.thumbnailUrl || shot.scene?.thumbnailUrl,
      }),
    )
  }
  const openProp = (propId: number) => {
    const prop = props.find(({ id }) => id === propId)
    const bound = shot.props.find((item) => item.propId === propId)
    openPanel(
      'asset-edit',
      buildAssetEditPanelData({
        assetId: propId,
        assetType: 'prop',
        description: editablePropDescription(prop?.description, shot.scriptText),
        name: prop ? getPropName(prop) : bound?.propName || '未命名道具',
        scriptText,
        shotId: shot.id,
        thumbnailUrl: prop?.thumbnailUrl || bound?.thumbnailUrl,
      }),
    )
  }

  return {
    bindCharacter: async (characterId: number) => {
      await shotApi.createBinding(requireProjectId(), shot.id, 'PCHAR', characterId)
      await fetchShots()
    },
    bindProp: async (propId: number) => {
      await shotApi.createBinding(requireProjectId(), shot.id, 'PPROP', propId)
      await fetchShots()
    },
    bindScene: async (sceneId: number) => {
      const currentProjectId = requireProjectId()
      await replaceSceneBinding({
        bind: (nextSceneId) =>
          shotApi.createBinding(currentProjectId, shot.id, 'PSCENE', nextSceneId),
        currentBindingId: shot.scene?.bindingId,
        sceneId,
        unbind: (bindingId) => shotApi.deleteBinding(currentProjectId, shot.id, bindingId),
      })
      await fetchShots()
    },
    characters,
    createCharacter: () =>
      openPanel(
        'asset-edit',
        buildAssetEditPanelData({
          assetType: 'character',
          name: '新角色',
          scriptText,
          shotId: shot.id,
        }),
      ),
    createProp: () =>
      openPanel(
        'asset-edit',
        buildAssetEditPanelData({
          assetType: 'prop',
          name: '新道具',
          scriptText,
          shotId: shot.id,
        }),
      ),
    createScene: () =>
      openPanel(
        'asset-edit',
        buildAssetEditPanelData({
          assetType: 'scene',
          name: '新场景',
          scriptText,
          shotId: shot.id,
        }),
      ),
    deleteCharacter: async (characterId: number) => {
      const currentProjectId = requireProjectId()
      const character = characters.find(({ id }) => id === characterId)
      await characterApi.deleteCharacter(currentProjectId, characterId)
      clearLocalImageHistory('character', characterId)
      if (character) clearLocalImageHistoryByName(getCharacterName(character))
      await Promise.all([fetchCharacters(), fetchShots()])
    },
    deleteProp: async (propId: number) => {
      await propApi.deleteProp(requireProjectId(), propId)
      clearLocalImageHistory('prop', propId)
      await Promise.all([fetchProps(), fetchShots()])
    },
    deleteScene: async (sceneId: number) => {
      await sceneApi.deleteScene(requireProjectId(), sceneId)
      clearLocalImageHistory('scene', sceneId)
      await Promise.all([fetchScenes(), fetchShots()])
    },
    openCharacter,
    openProp,
    openScene,
    props,
    scenes,
    unbind: async (bindingId: number) => {
      await shotApi.deleteBinding(requireProjectId(), shot.id, bindingId)
      await fetchShots()
    },
  }
}

export type ShotAssetBindings = ReturnType<typeof useShotAssetBindings>
