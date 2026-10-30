import { useCallback, useMemo, useState } from 'react'

import api from '@/shared/api/client'
import type {
  ProjectCharacterVO,
  ProjectPropVO,
  ProjectSceneVO,
} from '@/shared/types/api'

import { characterApi, propApi, sceneApi } from '../../../api'
import { useEditorStore } from '../../../store'
import { guardTargetDependencies } from '../panel-target'
import { usePanelTarget } from '../usePanelTarget'
import { defaultNotifier, type Notifier } from './notifier'
import type { EditableAssetType } from './types'

export interface SelectImageOptions {
  prompt?: string | null
  skipServerUpdate?: boolean
}

export interface ThumbnailMutationDeps {
  api: { put: (path: string, data: Record<string, unknown>) => Promise<unknown> }
  characterApi: {
    createLibraryCharacter: (data: { name: string; description: string; thumbnailUrl: string }) => Promise<{ id: number }>
    getCharacter: (projectId: number, characterId: number) => Promise<ProjectCharacterVO>
    updateLibraryCharacter: (characterId: number, data: { name: string; description: string; thumbnailUrl: string }) => Promise<void>
  }
  fetchCharacters: () => Promise<void>
  fetchProps: () => Promise<void>
  fetchScenes: () => Promise<void>
  fetchShots?: () => Promise<void>
  notifier: Notifier
  propApi: {
    createLibraryProp: (data: { name: string; description: string; thumbnailUrl: string }) => Promise<{ id: number }>
    getProp: (projectId: number, propId: number) => Promise<ProjectPropVO>
    updateLibraryProp: (propId: number, data: { name: string; description: string; thumbnailUrl: string }) => Promise<void>
  }
  sceneApi: {
    createLibraryScene: (data: { name: string; description: string; thumbnailUrl: string }) => Promise<{ id: number }>
    getScene: (projectId: number, sceneId: number) => Promise<ProjectSceneVO>
    updateLibraryScene: (sceneId: number, data: { name: string; description: string; thumbnailUrl: string }) => Promise<void>
  }
}

export interface ThumbnailMutationInput {
  assetId?: number
  assetType: EditableAssetType
  onThumbnailUpdated?: () => void
  projectId?: number | null
}

const isBlobUrl = (url: string): boolean => url.startsWith('blob:')

const isNotFoundError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('不存在') || message.toLowerCase().includes('not found')
}

async function refreshAssets(
  assetType: EditableAssetType,
  deps: Pick<ThumbnailMutationDeps, 'fetchCharacters' | 'fetchProps' | 'fetchScenes' | 'fetchShots'>,
): Promise<void> {
  const promises: Promise<void>[] = []
  if (assetType === 'character') promises.push(deps.fetchCharacters())
  if (assetType === 'scene') promises.push(deps.fetchScenes())
  if (assetType === 'prop') promises.push(deps.fetchProps())
  promises.push(deps.fetchShots?.() ?? Promise.resolve())
  await Promise.all(promises)
}

async function updateLibraryThumbnail(
  assetType: EditableAssetType,
  libraryId: number,
  name: string,
  description: string,
  thumbnailUrl: string,
  deps: Pick<ThumbnailMutationDeps, 'characterApi' | 'sceneApi' | 'propApi'>,
): Promise<void> {
  const payload = { name, description, thumbnailUrl }
  if (assetType === 'character') {
    await deps.characterApi.updateLibraryCharacter(libraryId, payload)
  } else if (assetType === 'scene') {
    await deps.sceneApi.updateLibraryScene(libraryId, payload)
  } else {
    await deps.propApi.updateLibraryProp(libraryId, payload)
  }
}

async function createLibraryThumbnail(
  assetType: EditableAssetType,
  name: string,
  description: string,
  thumbnailUrl: string,
  deps: Pick<ThumbnailMutationDeps, 'characterApi' | 'sceneApi' | 'propApi'>,
): Promise<number> {
  const payload = { name, description, thumbnailUrl }
  if (assetType === 'character') {
    const created = await deps.characterApi.createLibraryCharacter(payload)
    return created.id
  }
  if (assetType === 'scene') {
    const created = await deps.sceneApi.createLibraryScene(payload)
    return created.id
  }
  const created = await deps.propApi.createLibraryProp(payload)
  return created.id
}

async function updateProjectLibraryLink(
  assetType: EditableAssetType,
  projectId: number,
  assetId: number,
  libraryId: number,
  thumbnailUrl: string,
  deps: Pick<ThumbnailMutationDeps, 'api'>,
): Promise<void> {
  if (assetType === 'character') {
    await deps.api.put(`/projects/${projectId}/characters/${assetId}`, {
      libraryCharacterId: libraryId,
      thumbnailUrl,
    })
  } else if (assetType === 'scene') {
    await deps.api.put(`/projects/${projectId}/scenes/${assetId}`, {
      librarySceneId: libraryId,
      thumbnailUrl,
    })
  } else {
    await deps.api.put(`/projects/${projectId}/props/${assetId}`, {
      libraryPropId: libraryId,
      thumbnailUrl,
    })
  }
}

async function getAssetDetails(
  input: Pick<ThumbnailMutationInput, 'assetType' | 'assetId' | 'projectId'>,
  deps: Pick<ThumbnailMutationDeps, 'characterApi' | 'sceneApi' | 'propApi'>,
): Promise<{
  description: string
  libraryId: number | null
  name: string
}> {
  const { assetType, assetId, projectId } = input
  if (!projectId || !assetId) {
    return { description: '', libraryId: null, name: '' }
  }

  if (assetType === 'character') {
    const character = await deps.characterApi.getCharacter(projectId, assetId)
    return {
      description: character.finalDescription || character.description || '',
      libraryId: character.libraryCharacterId,
      name: character.displayName || character.name || '未命名角色',
    }
  }

  if (assetType === 'scene') {
    const scene = await deps.sceneApi.getScene(projectId, assetId)
    return {
      description: scene.finalDescription || scene.overrideDescription || '',
      libraryId: scene.librarySceneId,
      name: scene.displayName || scene.librarySceneName || '未命名场景',
    }
  }

  const prop = await deps.propApi.getProp(projectId, assetId)
  return {
    description: prop.description || '',
    libraryId: prop.libraryPropId,
    name: prop.displayName || prop.name || '未命名道具',
  }
}

export async function runSelectImage(
  input: ThumbnailMutationInput,
  url: string,
  options: SelectImageOptions,
  deps: ThumbnailMutationDeps,
): Promise<void> {
  const { assetType, assetId, projectId, onThumbnailUpdated } = input
  const { notifier } = deps

  if (isBlobUrl(url)) {
    notifier.success('已选择本地图片')
    return
  }

  if (options.skipServerUpdate) {
    notifier.success('已选择该图片')
    return
  }

  if (!projectId || !assetId) {
    notifier.success('已选择该图片')
    return
  }

  try {
    const { description, libraryId, name } = await getAssetDetails(input, deps)
    let currentLibraryId = libraryId

    if (currentLibraryId) {
      try {
        await updateLibraryThumbnail(assetType, currentLibraryId, name, description, url, deps)
      } catch (error) {
        if (isNotFoundError(error)) {
          currentLibraryId = await createLibraryThumbnail(assetType, name, description, url, deps)
          await updateProjectLibraryLink(assetType, projectId, assetId, currentLibraryId, url, deps)
        } else {
          throw error
        }
      }
    } else {
      currentLibraryId = await createLibraryThumbnail(assetType, name, description, url, deps)
      await updateProjectLibraryLink(assetType, projectId, assetId, currentLibraryId, url, deps)
    }

    await refreshAssets(assetType, deps)
    onThumbnailUpdated?.()
    notifier.success(`已更新${assetType === 'character' ? '角色' : assetType === 'scene' ? '场景' : '道具'}图片`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    notifier.warning(`图片已选择，但更新${assetType === 'character' ? '角色' : assetType === 'scene' ? '场景' : '道具'}图标失败: ${message}`)
    throw error
  }
}

const createDefaultDeps = (): ThumbnailMutationDeps => ({
  api,
  characterApi,
  fetchCharacters: () => useEditorStore.getState().fetchCharacters(),
  fetchProps: () => useEditorStore.getState().fetchProps(),
  fetchScenes: () => useEditorStore.getState().fetchScenes(),
  fetchShots: () => useEditorStore.getState().fetchShots(),
  notifier: defaultNotifier,
  propApi,
  sceneApi,
})

export interface UseAssetThumbnailMutationReturn {
  deleteGeneratedImage: () => void
  isUpdatingThumbnail: boolean
  selectImage: (url: string, options?: SelectImageOptions) => Promise<void>
}

export function useAssetThumbnailMutation(
  input: ThumbnailMutationInput,
  deps?: Partial<ThumbnailMutationDeps>,
): UseAssetThumbnailMutationReturn {
  const [isUpdatingThumbnail, setIsUpdatingThumbnail] = useState(false)

  const target = usePanelTarget('thumbnail', input.assetId ?? 'new')

  const resolvedDeps = useMemo<ThumbnailMutationDeps>(
    () => guardTargetDependencies({ ...createDefaultDeps(), ...deps }, target.current),
    [deps, target],
  )

  const selectImage = useCallback(
    async (url: string, options?: SelectImageOptions) => {
      setIsUpdatingThumbnail(true)
      try {
        await runSelectImage(input, url, options ?? {}, resolvedDeps)
      } finally {
        setIsUpdatingThumbnail(false)
      }
    },
    [input, resolvedDeps, target],
  )

  const deleteGeneratedImage = useCallback(() => {
    resolvedDeps.notifier.info('已删除图片')
  }, [resolvedDeps])

  return {
    deleteGeneratedImage,
    isUpdatingThumbnail,
    selectImage,
  }
}
