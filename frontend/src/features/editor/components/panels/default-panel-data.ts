import type { ProjectCharacterVO, ProjectPropVO, ProjectSceneVO } from '@/shared/types/api'

import type { AssetEditPanelData } from '../../panel-manager-store'

export type DefaultPanelTab = 'characters' | 'props' | 'scenes'
export type DefaultPanelAssetType = 'character' | 'prop' | 'scene'

export interface CategoryOption {
  id: number
  name: string
}

interface PanelAssetBase {
  categoryId: number | null
  description: string
  id: number
  imageUrl: string | null
  isGenerating: boolean
  name: string
}

export interface CharacterPanelAsset extends PanelAssetBase {
  assetType: 'character'
  isActive: boolean
}

export interface ScenePanelAsset extends PanelAssetBase {
  assetType: 'scene'
}

export interface PropPanelAsset extends PanelAssetBase {
  assetType: 'prop'
}

export type DefaultPanelAsset = CharacterPanelAsset | PropPanelAsset | ScenePanelAsset

export interface DefaultPanelAssetGroups {
  characters: CharacterPanelAsset[]
  props: PropPanelAsset[]
  scenes: ScenePanelAsset[]
}

export interface DefaultPanelCategories {
  characters: CategoryOption[]
  props: CategoryOption[]
  scenes: CategoryOption[]
}

export interface LibraryCategoryIndexes {
  characters: ReadonlyMap<number, number | null>
  props: ReadonlyMap<number, number | null>
  scenes: ReadonlyMap<number, number | null>
}

export interface DefaultPanelGeneratingAssetIds {
  characters: ReadonlySet<number>
  props: ReadonlySet<number>
  scenes: ReadonlySet<number>
}

export const EMPTY_INDEXES: LibraryCategoryIndexes = {
  characters: new Map(),
  props: new Map(),
  scenes: new Map(),
}

export const EMPTY_GENERATING_ASSET_IDS: DefaultPanelGeneratingAssetIds = {
  characters: new Set(),
  props: new Set(),
  scenes: new Set(),
}

export const toDefaultPanelAssetGroups = (
  characters: readonly ProjectCharacterVO[],
  scenes: readonly ProjectSceneVO[],
  props: readonly ProjectPropVO[],
  indexes: LibraryCategoryIndexes = EMPTY_INDEXES,
  generatingAssetIds: DefaultPanelGeneratingAssetIds = EMPTY_GENERATING_ASSET_IDS,
): DefaultPanelAssetGroups => ({
  characters: characters.map((character) => ({
    assetType: 'character',
    categoryId:
      character.libraryCharacterId === null
        ? null
        : (indexes.characters.get(character.libraryCharacterId) ?? null),
    description:
      character.finalDescription || character.description || character.overrideDescription || '',
    id: character.id,
    imageUrl: character.thumbnailUrl,
    isActive: character.isActive ?? false,
    isGenerating: generatingAssetIds.characters.has(character.id),
    name:
      character.displayName ||
      character.name ||
      character.libraryCharacterName ||
      '未命名角色',
  })),
  props: props.map((prop) => ({
    assetType: 'prop',
    categoryId: indexes.props.get(prop.libraryPropId) ?? null,
    description: prop.description || '',
    id: prop.id,
    imageUrl: prop.thumbnailUrl,
    isGenerating: generatingAssetIds.props.has(prop.id),
    name: prop.displayName || prop.name || '未命名道具',
  })),
  scenes: scenes.map((scene) => ({
    assetType: 'scene',
    categoryId:
      scene.librarySceneId === null
        ? null
        : (indexes.scenes.get(scene.librarySceneId) ?? null),
    description: scene.finalDescription || scene.overrideDescription || '',
    id: scene.id,
    imageUrl: scene.thumbnailUrl,
    isGenerating: generatingAssetIds.scenes.has(scene.id),
    name: scene.displayName || scene.librarySceneName || '未命名场景',
  })),
})

export const filterDefaultPanelAssets = <T extends DefaultPanelAsset>(
  assets: readonly T[],
  query: string,
  categoryId: number | null,
): T[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return assets.filter(
    (asset) =>
      (categoryId === null || asset.categoryId === categoryId) &&
      (!normalizedQuery || asset.name.toLocaleLowerCase().includes(normalizedQuery)),
  )
}

const truncateScript = (script: string): string =>
  script.length > 2000 ? `${script.slice(0, 2000)}...` : script

export const createAssetEditPanelData = (
  asset: DefaultPanelAsset,
  originalScript: string,
): AssetEditPanelData => {
  if (asset.assetType === 'character') {
    return {
      assetId: asset.id,
      assetType: 'character',
      characterName: asset.name,
      existingDescription: asset.description,
      ...(asset.imageUrl
        ? { existingThumbnailUrl: asset.imageUrl }
        : { prefillDescription: truncateScript(originalScript) }),
    }
  }

  if (asset.assetType === 'scene') {
    return {
      assetId: asset.id,
      assetType: 'scene',
      existingDescription: asset.description,
      existingThumbnailUrl: asset.imageUrl,
      sceneName: asset.name,
    }
  }

  return {
    assetId: asset.id,
    assetType: 'prop',
    existingDescription: asset.description,
    existingThumbnailUrl: asset.imageUrl,
    propName: asset.name,
  }
}
