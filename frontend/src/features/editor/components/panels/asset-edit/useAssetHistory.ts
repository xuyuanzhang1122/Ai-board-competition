import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  ProjectCharacterVO,
  ProjectPropVO,
  ProjectSceneVO,
} from '@/shared/types/api'

import type { LocalImageHistoryRecord } from '../../../store'
import { useEditorStore } from '../../../store'
import { usePanelTarget } from '../usePanelTarget'
import type { CombinedHistoryItem, EditableAssetType } from './types'
import { aggregateSameNameAssetIds } from './useAssetLibraryAssets'

export const isValidThumbnailUrl = (url: string | null): url is string =>
  !!url && /^(?:https?:|blob:)/.test(url)

export const buildServerHistoryItem = (
  assetType: EditableAssetType,
  asset: ProjectCharacterVO | ProjectSceneVO | ProjectPropVO,
  localRecords: LocalImageHistoryRecord[],
): CombinedHistoryItem | null => {
  if (!isValidThumbnailUrl(asset.thumbnailUrl)) return null
  if (localRecords.some((record) => record.url === asset.thumbnailUrl)) return null

  let prompt: string | null = null
  switch (assetType) {
    case 'character': {
      const character = asset as ProjectCharacterVO
      prompt = character.finalDescription || character.description || null
      break
    }
    case 'scene': {
      const scene = asset as ProjectSceneVO
      prompt = scene.finalDescription || scene.overrideDescription
      break
    }
    case 'prop': {
      const prop = asset as ProjectPropVO
      prompt = prop.description
      break
    }
  }

  return {
    createdAt: asset.createdAt,
    id: -asset.id,
    prompt,
    source: 'server',
    url: asset.thumbnailUrl,
    versionNo: 1,
  }
}

export const buildHistoryItems = (
  assetType: EditableAssetType,
  sameNameAssetIds: number[],
  shotId: number | undefined,
  getLocalImageHistory: (
    assetType: 'character' | 'scene' | 'prop',
    assetId: number,
    shotId?: number,
  ) => LocalImageHistoryRecord[],
  characters: readonly ProjectCharacterVO[],
  scenes: readonly ProjectSceneVO[],
  props: readonly ProjectPropVO[],
): CombinedHistoryItem[] => {
  const findAsset = (id: number) => {
    switch (assetType) {
      case 'character': {
        return characters.find((character) => character.id === id)
      }
      case 'scene': {
        return scenes.find((scene) => scene.id === id)
      }
      case 'prop': {
        return props.find((prop) => prop.id === id)
      }
    }
  }

  const items: CombinedHistoryItem[] = []
  for (const id of sameNameAssetIds) {
    const asset = findAsset(id)
    if (!asset) continue
    const localRecords = getLocalImageHistory(assetType, id, shotId)
    const serverItem = buildServerHistoryItem(assetType, asset, localRecords)
    if (serverItem) items.push(serverItem)
    for (const record of localRecords) {
      items.push({ ...record, source: 'local' as const })
    }
  }

  const seen = new Set<string>()
  const deduped: CombinedHistoryItem[] = []
  for (const item of items) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    deduped.push(item)
  }

  return deduped.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

interface AssetHistorySelectorInput {
  assetId: number | undefined
  assetName: string
  assetType: EditableAssetType
  shotId: number | undefined
}

interface AssetHistorySelectorState {
  characters: readonly ProjectCharacterVO[]
  getLocalImageHistory: (
    assetType: 'character' | 'scene' | 'prop',
    assetId: number,
    shotId?: number,
  ) => LocalImageHistoryRecord[]
  props: readonly ProjectPropVO[]
  scenes: readonly ProjectSceneVO[]
}

/**
 * Pure: derive the asset's combined history from the *current* store snapshot.
 *
 * Same-name ids are computed here from the freshly fetched assets rather than
 * received as a (reference-churning) prop. That keeps `loadHistory` free of
 * `sameNameAssetIds` in its dependency list, so the "load → refetch → re-render
 * → load" infinite cycle in the asset-edit panel cannot form.
 */
export function selectAssetHistory(
  input: AssetHistorySelectorInput,
  state: AssetHistorySelectorState,
): CombinedHistoryItem[] {
  const sameNameAssetIds = aggregateSameNameAssetIds(
    input.assetType,
    input.assetName,
    input.assetId,
    state.characters,
    state.scenes,
    state.props,
  )
  return buildHistoryItems(
    input.assetType,
    sameNameAssetIds,
    input.shotId,
    state.getLocalImageHistory,
    state.characters,
    state.scenes,
    state.props,
  )
}

export function useAssetHistory(
  assetType: EditableAssetType,
  assetName: string,
  assetId: number | undefined,
  projectId: number | null,
  shotId: number | undefined,
) {
  const fetchCharacters = useEditorStore((state) => state.fetchCharacters)
  const fetchScenes = useEditorStore((state) => state.fetchScenes)
  const fetchProps = useEditorStore((state) => state.fetchProps)

  const [history, setHistory] = useState<CombinedHistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const target = usePanelTarget(`history-${assetType}`, assetId ?? assetName)
  const requestIdRef = useRef(0)

  useEffect(() => {
    requestIdRef.current += 1
    setHistory([])
    setLoadingHistory(false)
    return () => { requestIdRef.current += 1 }
  }, [assetId, assetName, assetType, projectId, target])

  const loadHistory = useCallback(async () => {
    if (!projectId) return
    const requestId = ++requestIdRef.current
    setLoadingHistory(true)
    try {
      if (assetType === 'character') await fetchCharacters()
      else if (assetType === 'scene') await fetchScenes()
      else await fetchProps()
      if (requestId !== requestIdRef.current || !target.current()) return
      const state = useEditorStore.getState()
      setHistory(
        selectAssetHistory(
          { assetId, assetName, assetType, shotId },
          {
            characters: state.characters,
            getLocalImageHistory: state.getLocalImageHistory,
            props: state.props,
            scenes: state.scenes,
          },
        ),
      )
    } finally {
      if (requestId === requestIdRef.current) setLoadingHistory(false)
    }
  }, [
    assetType,
    assetName,
    assetId,
    projectId,
    shotId,
    fetchCharacters,
    fetchScenes,
    fetchProps,
    target,
  ])

  return { history, loadingHistory, loadHistory }
}
