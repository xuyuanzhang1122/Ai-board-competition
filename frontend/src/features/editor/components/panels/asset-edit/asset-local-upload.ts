import type {
  ProjectCharacterVO,
  ProjectPropVO,
  ProjectSceneVO,
} from '@/shared/types/api'

import type { LocalImageHistoryRecord } from '../../../store'
import type { Notifier } from './notifier'
import type { EditableAssetType } from './types'

export interface AssetLocalUploadInput {
  aiDescription: string
  assetId?: number
  assetName?: string
  assetType: EditableAssetType
  onCreatedAssetId?: () => void
  onUploadComplete?: () => void
  projectId?: number | null
  shotId?: number
}

export interface LocalUploadDeps {
  addLocalImageHistory: (
    assetType: 'character' | 'scene' | 'prop',
    assetId: number,
    record: LocalImageHistoryRecord,
    shotId?: number,
  ) => void
  api: { put: (path: string, data: Record<string, unknown>) => Promise<unknown> }
  characterApi: {
    createCharacter: (projectId: number, data: { name: string; description: string; characterLibraryId?: number }) => Promise<ProjectCharacterVO>
    createLibraryCharacter: (data: { name: string; description: string; thumbnailUrl?: string }) => Promise<{ id: number }>
    getCharacter: (projectId: number, characterId: number) => Promise<ProjectCharacterVO>
    updateCharacter: (projectId: number, characterId: number, data: { description?: string; name?: string; thumbnailUrl?: string | null }) => Promise<ProjectCharacterVO>
    updateLibraryCharacter: (characterId: number, data: { name: string; description: string; thumbnailUrl: string }) => Promise<void>
  }
  fetchCharacters: () => Promise<void>
  fetchProps: () => Promise<void>
  fetchScenes: () => Promise<void>
  fetchShots?: () => Promise<void>
  getLocalImageHistory: (
    assetType: 'character' | 'scene' | 'prop',
    assetId: number,
    shotId?: number,
  ) => LocalImageHistoryRecord[]
  notifier: Notifier
  propApi: {
    addPropToProject: (projectId: number, data: { libraryPropId: number; displayName?: string; overrideDescription?: string }) => Promise<ProjectPropVO>
    createLibraryProp: (data: { name: string; description: string; thumbnailUrl?: string }) => Promise<{ id: number }>
    getProp: (projectId: number, propId: number) => Promise<ProjectPropVO>
    updateLibraryProp: (propId: number, data: { name: string; description: string; thumbnailUrl: string }) => Promise<void>
    updateProp: (projectId: number, propId: number, data: { description?: string; name?: string; thumbnailUrl?: string | null }) => Promise<ProjectPropVO>
  }
  sceneApi: {
    createLibraryScene: (data: { name: string; description: string; thumbnailUrl?: string }) => Promise<{ id: number }>
    createScene: (projectId: number, data: { name: string; description: string; sceneLibraryId?: number }) => Promise<ProjectSceneVO>
    getScene: (projectId: number, sceneId: number) => Promise<ProjectSceneVO>
    updateLibraryScene: (sceneId: number, data: { name: string; description: string; thumbnailUrl: string }) => Promise<void>
    updateScene: (projectId: number, sceneId: number, data: { description?: string; name?: string; thumbnailUrl?: string | null }) => Promise<ProjectSceneVO>
  }
  shotApi: { createBinding: (projectId: number, shotId: number, bindType: 'PCHAR' | 'PSCENE' | 'PPROP', bindId: number) => Promise<void> }
  uploadApi: { upload: (file: File, type: 'image') => Promise<{ url: string }> }
}

async function refreshAssets(
  assetType: EditableAssetType,
  deps: Pick<LocalUploadDeps, 'fetchCharacters' | 'fetchProps' | 'fetchScenes' | 'fetchShots'>,
): Promise<void> {
  const promises: Promise<void>[] = []
  if (assetType === 'character') promises.push(deps.fetchCharacters())
  if (assetType === 'scene') promises.push(deps.fetchScenes())
  if (assetType === 'prop') promises.push(deps.fetchProps())
  promises.push(deps.fetchShots?.() ?? Promise.resolve())
  await Promise.all(promises)
}

export async function runLocalImageUpload(
  input: AssetLocalUploadInput,
  file: File,
  deps: LocalUploadDeps,
): Promise<void> {
  const { assetType, assetId, assetName, aiDescription, projectId, shotId, onCreatedAssetId, onUploadComplete } = input
  if (!projectId) throw new Error('项目未加载')

  const { createProjectAsset } = await import('./useAssetGeneration')
  const { runSelectImage } = await import('./useAssetThumbnailMutation')

  const blobUrl = URL.createObjectURL(file)
  deps.notifier.info('正在上传图片到云端…')

  try {
    const { url: ossUrl } = await deps.uploadApi.upload(file, 'image')

    let targetId = assetId
    if (!targetId) {
      targetId = await createProjectAsset(
        {
          aiDescription,
          assetName,
          assetType,
          onCreatedAssetId: onCreatedAssetId ? () => onCreatedAssetId() : undefined,
          projectId,
          shotId,
        },
        deps,
      )
    }

    await runSelectImage(
      { assetId: targetId, assetType, projectId },
      ossUrl,
      { prompt: '本地上传' },
      deps,
    )

    const localRecords = deps.getLocalImageHistory(assetType, targetId, shotId)
    const record: LocalImageHistoryRecord = {
      createdAt: new Date().toISOString(),
      id: Date.now(),
      prompt: '本地上传',
      url: ossUrl,
      versionNo: localRecords.length + 1,
    }
    deps.addLocalImageHistory(assetType, targetId, record, shotId)

    await refreshAssets(assetType, deps)
    onUploadComplete?.()
    deps.notifier.success('图片上传成功并已更新')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    deps.notifier.error(`图片上传失败: ${message}`)
    throw error
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}
