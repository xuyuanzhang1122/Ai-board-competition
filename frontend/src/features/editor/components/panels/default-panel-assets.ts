import { useEffect, useMemo, useState } from 'react'

import type {
  CharacterCategoryVO,
  CharacterLibraryVO,
  ProjectCharacterVO,
  ProjectPropVO,
  ProjectSceneVO,
  PropCategoryVO,
  PropLibraryVO,
  SceneCategoryVO,
  SceneLibraryVO,
} from '@/shared/types/api'

import { characterApi, propApi, sceneApi } from '../../api'
import {
  type CategoryOption,
  type DefaultPanelAssetGroups,
  type DefaultPanelCategories,
  type DefaultPanelGeneratingAssetIds,
  type DefaultPanelTab,
  EMPTY_INDEXES,
  filterDefaultPanelAssets,
  toDefaultPanelAssetGroups,
} from './default-panel-data'

export type {
  CategoryOption,
  CharacterPanelAsset,
  DefaultPanelAsset,
  DefaultPanelAssetGroups,
  DefaultPanelAssetType,
  DefaultPanelCategories,
  DefaultPanelGeneratingAssetIds,
  DefaultPanelTab,
  PropPanelAsset,
  ScenePanelAsset,
} from './default-panel-data'
export { createAssetEditPanelData } from './default-panel-data'

const EMPTY_CATEGORIES: DefaultPanelCategories = {
  characters: [],
  props: [],
  scenes: [],
}

const EMPTY_QUERIES: Record<DefaultPanelTab, string> = {
  characters: '',
  props: '',
  scenes: '',
}

const EMPTY_SELECTIONS: Record<DefaultPanelTab, number | null> = {
  characters: null,
  props: null,
  scenes: null,
}

const toCategoryOptions = (
  categories: null | readonly (CharacterCategoryVO | PropCategoryVO | SceneCategoryVO)[] | undefined,
): CategoryOption[] => (categories ?? []).map(({ id, name }) => ({ id, name }))

const createLibraryCategoryIndex = <T extends { categoryId: number | null; id: number }>(
  assets: null | readonly T[] | undefined,
): ReadonlyMap<number, number | null> =>
  new Map((assets ?? []).map((asset) => [asset.id, asset.categoryId] as const))

interface CatalogResult<TCategory, TAsset> {
  assets: TAsset[]
  categories: TCategory[]
}

const loadCatalog = async <TCategory, TAsset>(
  loadCategories: () => Promise<TCategory[]>,
  loadAssets: () => Promise<TAsset[]>,
): Promise<CatalogResult<TCategory, TAsset>> => {
  const [categories, assets] = await Promise.all([loadCategories(), loadAssets()])
  return { assets, categories }
}

export interface UseDefaultPanelAssetsOptions {
  characters: readonly ProjectCharacterVO[]
  generatingAssetIds?: DefaultPanelGeneratingAssetIds
  props: readonly ProjectPropVO[]
  scenes: readonly ProjectSceneVO[]
}

export function useDefaultPanelAssets({
  characters,
  generatingAssetIds,
  props,
  scenes,
}: UseDefaultPanelAssetsOptions) {
  const [categories, setCategories] = useState(EMPTY_CATEGORIES)
  const [indexes, setIndexes] = useState(EMPTY_INDEXES)
  const [queries, setQueries] = useState(EMPTY_QUERIES)
  const [selectedCategories, setSelectedCategories] = useState(EMPTY_SELECTIONS)

  useEffect(() => {
    let active = true

    const loadCharacters = loadCatalog<CharacterCategoryVO, CharacterLibraryVO>(
      characterApi.getCharacterCategories,
      () => characterApi.getLibraryCharacters(),
    )
    const loadScenes = loadCatalog<SceneCategoryVO, SceneLibraryVO>(
      sceneApi.getSceneCategories,
      () => sceneApi.getLibraryScenes(),
    )
    const loadProps = loadCatalog<PropCategoryVO, PropLibraryVO>(
      propApi.getPropCategories,
      () => propApi.getLibraryProps(),
    )

    void Promise.allSettled([loadCharacters, loadScenes, loadProps]).then((results) => {
      if (!active) return

      const [characterResult, sceneResult, propResult] = results
      setCategories({
        characters:
          characterResult.status === 'fulfilled'
            ? toCategoryOptions(characterResult.value.categories)
            : [],
        props:
          propResult.status === 'fulfilled' ? toCategoryOptions(propResult.value.categories) : [],
        scenes:
          sceneResult.status === 'fulfilled' ? toCategoryOptions(sceneResult.value.categories) : [],
      })
      setIndexes({
        characters:
          characterResult.status === 'fulfilled'
            ? createLibraryCategoryIndex(characterResult.value.assets)
            : new Map(),
        props:
          propResult.status === 'fulfilled'
            ? createLibraryCategoryIndex(propResult.value.assets)
            : new Map(),
        scenes:
          sceneResult.status === 'fulfilled'
            ? createLibraryCategoryIndex(sceneResult.value.assets)
            : new Map(),
      })
    })

    return () => {
      active = false
    }
  }, [])

  const assetGroups = useMemo(
    () => toDefaultPanelAssetGroups(characters, scenes, props, indexes, generatingAssetIds),
    [characters, generatingAssetIds, indexes, props, scenes],
  )

  const filteredAssets = useMemo<DefaultPanelAssetGroups>(
    () => ({
      characters: filterDefaultPanelAssets(
        assetGroups.characters,
        queries.characters,
        selectedCategories.characters,
      ),
      props: filterDefaultPanelAssets(
        assetGroups.props,
        queries.props,
        selectedCategories.props,
      ),
      scenes: filterDefaultPanelAssets(
        assetGroups.scenes,
        queries.scenes,
        selectedCategories.scenes,
      ),
    }),
    [assetGroups, queries, selectedCategories],
  )

  return {
    categories,
    filteredAssets,
    queries,
    selectedCategories,
    setCategory: (tab: DefaultPanelTab, categoryId: number | null) =>
      setSelectedCategories((current) => ({ ...current, [tab]: categoryId })),
    setQuery: (tab: DefaultPanelTab, query: string) =>
      setQueries((current) => ({ ...current, [tab]: query })),
  }
}
