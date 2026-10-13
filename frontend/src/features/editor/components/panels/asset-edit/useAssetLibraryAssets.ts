import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  ProjectCharacterVO,
  ProjectPropVO,
  ProjectSceneVO,
} from '@/shared/types/api'

import { characterApi, propApi, sceneApi } from '../../../api'
import { useEditorStore } from '../../../store'
import type { EditableAssetType, LibraryAsset } from './types'

export const aggregateSameNameAssetIds = (
  assetType: EditableAssetType,
  assetName: string,
  assetId: number | undefined,
  characters: readonly ProjectCharacterVO[],
  scenes: readonly ProjectSceneVO[],
  props: readonly ProjectPropVO[],
): number[] => {
  if (!assetName.trim()) return assetId ? [assetId] : []

  const normalizedName = assetName.trim()

  const nameMatchesCharacter = (character: ProjectCharacterVO) =>
    (character.displayName || character.name || '').trim() === normalizedName

  const nameMatchesScene = (scene: ProjectSceneVO) =>
    (scene.displayName || scene.librarySceneName || '').trim() === normalizedName

  const nameMatchesProp = (prop: ProjectPropVO) =>
    (prop.displayName || prop.name || '').trim() === normalizedName

  switch (assetType) {
    case 'character': {
      return characters.filter(nameMatchesCharacter).map((character) => character.id)
    }
    case 'scene': {
      return scenes.filter(nameMatchesScene).map((scene) => scene.id)
    }
    case 'prop': {
      return props.filter(nameMatchesProp).map((prop) => prop.id)
    }
  }
}

export function useAssetLibraryAssets(
  assetType: EditableAssetType,
  assetName: string,
  assetId?: number,
  projectId?: number | null,
) {
  const characters = useEditorStore((state) => state.characters)
  const scenes = useEditorStore((state) => state.scenes)
  const props = useEditorStore((state) => state.props)

  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([])
  const [loadingLibraryAssets, setLoadingLibraryAssets] = useState(false)

  const sameNameAssetIds = useMemo(
    () =>
      aggregateSameNameAssetIds(
        assetType,
        assetName,
        assetId,
        characters,
        scenes,
        props,
      ),
    [assetType, assetName, assetId, characters, scenes, props],
  )

  useEffect(() => {
    setLibraryAssets([])
    setLoadingLibraryAssets(false)
  }, [assetId])

  const loadLibraryAssets = useCallback(async () => {
    if (!projectId) return
    setLoadingLibraryAssets(true)
    try {
      let nextAssets: LibraryAsset[] = []
      switch (assetType) {
        case 'character': {
          const items = await characterApi.getLibraryCharacters()
          nextAssets = items
            .filter((item) => item.thumbnailUrl)
            .map((data) => ({ type: 'character' as const, data }))
          break
        }
        case 'scene': {
          const items = await sceneApi.getLibraryScenes()
          nextAssets = items
            .filter((item) => item.thumbnailUrl)
            .map((data) => ({ type: 'scene' as const, data }))
          break
        }
        case 'prop': {
          const items = await propApi.getLibraryProps()
          nextAssets = items
            .filter((item) => item.thumbnailUrl)
            .map((data) => ({ type: 'prop' as const, data }))
          break
        }
      }
      setLibraryAssets(nextAssets)
    } finally {
      setLoadingLibraryAssets(false)
    }
  }, [assetType, projectId])

  return {
    libraryAssets,
    loadingLibraryAssets,
    loadLibraryAssets,
    sameNameAssetIds,
  }
}
