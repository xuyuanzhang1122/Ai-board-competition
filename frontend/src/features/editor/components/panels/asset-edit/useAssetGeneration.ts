import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  BatchGenerateResponse,
  JobVO,
  ProjectCharacterVO,
  ProjectPropVO,
  ProjectSceneVO,
} from '@/shared/types/api'

import type { GenerationParams } from '../../../api'
import {
  characterApi,
  generationApi,
  jobApi,
  propApi,
  sceneApi,
  shotApi,
} from '../../../api'
import type { ActiveGenerationJobKind, LocalImageHistoryRecord } from '../../../store'
import { useEditorStore } from '../../../store'
import {
  GenerationJobTimeoutError,
  pollGenerationJob,
} from '../generation-helpers'
import { defaultNotifier, type Notifier } from './notifier'
import type { EditableAssetType } from './types'
import { isValidThumbnailUrl } from './useAssetHistory'

export const DEFAULT_MODELS: Record<EditableAssetType, string> = {
  character: '',
  prop: '',
  scene: '',
}

export interface AssetGenerationInput {
  aiDescription: string
  aspectRatio: string
  assetId?: number
  assetName?: string
  assetType: EditableAssetType
  model?: string
  onCreatedAssetId?: (id: number) => void
  projectId?: number | null
  shotId?: number
}

export interface AssetGenerationDeps {
  addLocalImageHistory: (
    assetType: 'character' | 'scene' | 'prop',
    assetId: number,
    record: LocalImageHistoryRecord,
    shotId?: number,
  ) => void
  characterApi: {
    createCharacter: (projectId: number, data: { name: string; description: string; characterLibraryId?: number }) => Promise<ProjectCharacterVO>
    createLibraryCharacter: (data: { name: string; description: string }) => Promise<{ id: number }>
    updateCharacter: (projectId: number, characterId: number, data: { description?: string; name?: string; thumbnailUrl?: string | null }) => Promise<ProjectCharacterVO>
  }
  fetchCharacters: () => Promise<void>
  fetchProps: () => Promise<void>
  fetchScenes: () => Promise<void>
  fetchShots?: () => Promise<void>
  generationApi: {
    generateSingleCharacter: (projectId: number, characterId: number, params: GenerationParams) => Promise<BatchGenerateResponse>
    generateSingleProp: (projectId: number, propId: number, params: GenerationParams) => Promise<BatchGenerateResponse>
    generateSingleScene: (projectId: number, sceneId: number, params: GenerationParams) => Promise<BatchGenerateResponse>
  }
  getCharacter?: (projectId: number, characterId: number) => Promise<ProjectCharacterVO>
  getLocalImageHistory: (
    assetType: 'character' | 'scene' | 'prop',
    assetId: number,
    shotId?: number,
  ) => LocalImageHistoryRecord[]
  getProp?: (projectId: number, propId: number) => Promise<ProjectPropVO>
  getScene?: (projectId: number, sceneId: number) => Promise<ProjectSceneVO>
  jobApi: { getJobStatus: (jobId: number) => Promise<JobVO> }
  notifier: Notifier
  propApi: {
    addPropToProject: (projectId: number, data: { libraryPropId: number; displayName?: string; overrideDescription?: string }) => Promise<ProjectPropVO>
    createLibraryProp: (data: { name: string; description: string }) => Promise<{ id: number }>
    updateProp: (projectId: number, propId: number, data: { displayName?: string; overrideDescription?: string; thumbnailUrl?: string | null }) => Promise<ProjectPropVO>
  }
  registerGenerationJob: (
    jobId: number,
    kind: ActiveGenerationJobKind,
    targetIds?: number[],
  ) => void
  sceneApi: {
    createLibraryScene: (data: { name: string; description: string }) => Promise<{ id: number }>
    createScene: (projectId: number, data: { name: string; description: string; sceneLibraryId?: number }) => Promise<ProjectSceneVO>
    updateScene: (projectId: number, sceneId: number, data: { description?: string; name?: string; thumbnailUrl?: string | null }) => Promise<ProjectSceneVO>
  }
  shotApi: { createBinding: (projectId: number, shotId: number, bindType: 'PCHAR' | 'PSCENE' | 'PPROP', bindId: number) => Promise<void> }
  sleep: (ms: number) => Promise<void>
}

export interface AssetGenerationOptions {
  signal?: AbortSignal
}

export interface AssetGenerationResult {
  error: Error | null
  generatedImageUrl: string | null
  historyRecordsAdded: number
}

const asAspectRatioParam = (
  ratio: string,
): GenerationParams['aspectRatio'] => {
  if (['1:1', '16:9', '9:16', '21:9', '4:3', '3:4', '3:2', '2:3'].includes(ratio)) {
    return ratio as GenerationParams['aspectRatio']
  }
  return undefined
}

export async function createProjectAsset(
  input: Pick<AssetGenerationInput, 'assetType' | 'assetName' | 'aiDescription' | 'projectId' | 'shotId' | 'onCreatedAssetId'>,
  deps: Pick<
    AssetGenerationDeps,
    'characterApi' | 'propApi' | 'sceneApi' | 'shotApi'
  >,
): Promise<number> {
  const { assetType, assetName, aiDescription, projectId, shotId, onCreatedAssetId } = input
  if (!projectId) throw new Error('项目未加载')

  const name = (assetName || '').trim() || `新${assetType === 'character' ? '角色' : assetType === 'scene' ? '场景' : '道具'}`
  const description = aiDescription.trim()

  let projectAssetId: number

  if (assetType === 'character') {
    const library = await deps.characterApi.createLibraryCharacter({ name, description })
    const project = await deps.characterApi.createCharacter(projectId, {
      characterLibraryId: library.id,
      description,
      name,
    })
    projectAssetId = project.id
  } else if (assetType === 'scene') {
    const library = await deps.sceneApi.createLibraryScene({ name, description })
    const project = await deps.sceneApi.createScene(projectId, {
      description,
      name,
      sceneLibraryId: library.id,
    })
    projectAssetId = project.id

    if (shotId) {
      try {
        await deps.shotApi.createBinding(projectId, shotId, 'PSCENE', projectAssetId)
      } catch {
        // 绑定失败不影响后续生成
      }
    }
  } else {
    const library = await deps.propApi.createLibraryProp({ name, description })
    const project = await deps.propApi.addPropToProject(projectId, {
      displayName: name,
      libraryPropId: library.id,
      overrideDescription: description,
    })
    projectAssetId = project.id

    if (shotId) {
      try {
        await deps.shotApi.createBinding(projectId, shotId, 'PPROP', projectAssetId)
      } catch {
        // 绑定失败不影响后续生成
      }
    }
  }

  onCreatedAssetId?.(projectAssetId)
  return projectAssetId
}

async function updateAssetDescription(
  input: Pick<AssetGenerationInput, 'assetType' | 'assetName' | 'aiDescription' | 'projectId'>,
  deps: Pick<AssetGenerationDeps, 'characterApi' | 'propApi' | 'sceneApi'>,
  assetId: number,
): Promise<void> {
  const { assetType, assetName, aiDescription, projectId } = input
  if (!projectId) throw new Error('项目未加载')

  const description = aiDescription.trim()
  const name = (assetName || '').trim() || undefined

  if (assetType === 'character') {
    await deps.characterApi.updateCharacter(projectId, assetId, { description, name })
  } else if (assetType === 'scene') {
    await deps.sceneApi.updateScene(projectId, assetId, { description, name })
  } else {
    await deps.propApi.updateProp(projectId, assetId, {
      displayName: name,
      overrideDescription: description,
    })
  }
}

async function callGenerateApi(
  input: Pick<AssetGenerationInput, 'assetType' | 'aspectRatio' | 'model'>,
  deps: Pick<AssetGenerationDeps, 'generationApi'>,
  projectId: number,
  assetId: number,
): Promise<BatchGenerateResponse> {
  const model = input.model || DEFAULT_MODELS[input.assetType]
  const params = { aspectRatio: asAspectRatioParam(input.aspectRatio), model }

  switch (input.assetType) {
    case 'character': {
      return deps.generationApi.generateSingleCharacter(projectId, assetId, params)
    }
    case 'scene': {
      return deps.generationApi.generateSingleScene(projectId, assetId, params)
    }
    case 'prop': {
      return deps.generationApi.generateSingleProp(projectId, assetId, params)
    }
  }
}

async function fetchAssetThumbnail(
  assetType: EditableAssetType,
  projectId: number,
  assetId: number,
  deps: Pick<AssetGenerationDeps, 'getCharacter' | 'getProp' | 'getScene'>,
): Promise<string | null> {
  try {
    if (assetType === 'character') {
      const asset = await deps.getCharacter?.(projectId, assetId)
      return asset?.thumbnailUrl ?? null
    }
    if (assetType === 'scene') {
      const asset = await deps.getScene?.(projectId, assetId)
      return asset?.thumbnailUrl ?? null
    }
    const asset = await deps.getProp?.(projectId, assetId)
    return asset?.thumbnailUrl ?? null
  } catch {
    return null
  }
}

async function refreshAssets(
  assetType: EditableAssetType,
  deps: Pick<AssetGenerationDeps, 'fetchCharacters' | 'fetchProps' | 'fetchScenes' | 'fetchShots'>,
): Promise<void> {
  const promises: Promise<void>[] = []
  if (assetType === 'character') promises.push(deps.fetchCharacters())
  if (assetType === 'scene') promises.push(deps.fetchScenes())
  if (assetType === 'prop') promises.push(deps.fetchProps())
  promises.push(deps.fetchShots?.() ?? Promise.resolve())
  await Promise.all(promises)
}

function addHistoryRecords(
  assetType: EditableAssetType,
  assetId: number,
  aiDescription: string,
  allImageUrls: string[] | null | undefined,
  primaryUrl: string | null,
  shotId: number | undefined,
  deps: Pick<AssetGenerationDeps, 'addLocalImageHistory' | 'getLocalImageHistory'>,
): number {
  const localRecords = deps.getLocalImageHistory(assetType, assetId, shotId)
  const baseVersionNo = localRecords.length + 1
  const groupId = Date.now()
  const validUrls = (allImageUrls ?? []).filter((url) => isValidThumbnailUrl(url))
  let added = 0

  if (validUrls.length > 0) {
    validUrls.forEach((url, index) => {
      deps.addLocalImageHistory(
        assetType,
        assetId,
        {
          createdAt: new Date().toISOString(),
          groupId,
          groupIndex: index,
          id: groupId + index,
          prompt: aiDescription,
          url,
          versionNo: baseVersionNo,
        },
        shotId,
      )
      added += 1
    })
  } else if (primaryUrl && isValidThumbnailUrl(primaryUrl)) {
    deps.addLocalImageHistory(
      assetType,
      assetId,
      {
        createdAt: new Date().toISOString(),
        id: groupId,
        prompt: aiDescription,
        url: primaryUrl,
        versionNo: baseVersionNo,
      },
      shotId,
    )
    added += 1
  }

  return added
}

async function pollJob(
  jobId: number,
  assetType: EditableAssetType,
  assetId: number,
  projectId: number,
  aiDescription: string,
  shotId: number | undefined,
  deps: AssetGenerationDeps,
  options?: AssetGenerationOptions,
): Promise<AssetGenerationResult> {
  const { notifier, sleep, jobApi } = deps

  try {
    const job = await pollGenerationJob(jobId, {
      getJobStatus: jobApi.getJobStatus,
      onQueryError: (error) => {
        console.error('[useAssetGeneration] 轮询任务状态失败:', error)
      },
      signal: options?.signal,
      sleep,
    })

    if (!job) return { error: null, generatedImageUrl: null, historyRecordsAdded: 0 }

    notifier.success('图片生成成功!')
    await refreshAssets(assetType, deps)

    let primaryUrl = job.allImageUrls?.[0] ?? null
    if (!primaryUrl) {
      primaryUrl = await fetchAssetThumbnail(assetType, projectId, assetId, deps)
    }

    if (!primaryUrl || !isValidThumbnailUrl(primaryUrl)) {
      return { error: null, generatedImageUrl: null, historyRecordsAdded: 0 }
    }

    const historyRecordsAdded = addHistoryRecords(
      assetType,
      assetId,
      aiDescription,
      job.allImageUrls,
      primaryUrl,
      shotId,
      deps,
    )

    return { error: null, generatedImageUrl: primaryUrl, historyRecordsAdded }
  } catch (error) {
    const failure = error instanceof Error ? error : new Error('图片生成失败')
    if (failure instanceof GenerationJobTimeoutError) notifier.warning('生成超时，请稍后刷新查看')
    else notifier.error(failure.message)
    return { error: failure, generatedImageUrl: null, historyRecordsAdded: 0 }
  }
}

export async function runAssetGeneration(
  input: AssetGenerationInput,
  deps: AssetGenerationDeps,
  options?: AssetGenerationOptions,
): Promise<AssetGenerationResult> {
  const { assetType, assetId, aiDescription, projectId, shotId, onCreatedAssetId } = input

  if (!projectId) throw new Error('项目未加载')
  const fallbackPropPrompt = (input.assetName || '').trim() || '新道具'
  const historyPrompt = aiDescription.trim() || fallbackPropPrompt
  if (!aiDescription.trim() && assetType !== 'prop') throw new Error('请填写描述后再生成')

  let targetId: number

  if (assetId) {
    targetId = assetId
    await updateAssetDescription(input, deps, targetId)
  } else {
    targetId = await createProjectAsset(
      { aiDescription, assetName: input.assetName, assetType, onCreatedAssetId, projectId, shotId },
      deps,
    )
  }

  const response = await callGenerateApi(input, deps, projectId, targetId)

  if (!response.jobId) {
    return { error: null, generatedImageUrl: null, historyRecordsAdded: 0 }
  }

  deps.registerGenerationJob(response.jobId, assetType, [targetId])

  return pollJob(response.jobId, assetType, targetId, projectId, historyPrompt, shotId, deps, options)
}

const createDefaultDeps = (): AssetGenerationDeps => ({
  addLocalImageHistory: (...args) => useEditorStore.getState().addLocalImageHistory(...args),
  characterApi,
  fetchCharacters: () => useEditorStore.getState().fetchCharacters(),
  fetchProps: () => useEditorStore.getState().fetchProps(),
  fetchScenes: () => useEditorStore.getState().fetchScenes(),
  fetchShots: () => useEditorStore.getState().fetchShots(),
  generationApi,
  getCharacter: (projectId, characterId) => characterApi.getCharacter(projectId, characterId),
  getLocalImageHistory: (...args) => useEditorStore.getState().getLocalImageHistory(...args),
  getProp: (projectId, propId) => propApi.getProp(projectId, propId),
  getScene: (projectId, sceneId) => sceneApi.getScene(projectId, sceneId),
  jobApi,
  notifier: defaultNotifier,
  propApi,
  registerGenerationJob: (...args) => useEditorStore.getState().registerGenerationJob(...args),
  sceneApi,
  shotApi,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
})

export interface UseAssetGenerationReturn {
  error: Error | null
  generate: () => Promise<void>
  generatedImageUrl: string | null
  isGenerating: boolean
  resetGeneratedState: () => void
  setGeneratedImageUrl: (url: string | null) => void
}

export function useAssetGeneration(
  input: AssetGenerationInput,
  deps?: Partial<AssetGenerationDeps>,
): UseAssetGenerationReturn {
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const resolvedDeps = useMemo<AssetGenerationDeps>(
    () => ({
      ...createDefaultDeps(),
      ...deps,
    }),
    [deps],
  )

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    setGeneratedImageUrl(null)
    setError(null)
    abortRef.current?.abort()
    abortRef.current = new AbortController()
  }, [input.assetId, input.assetType])

  const generate = useCallback(async () => {
    setIsGenerating(true)
    setError(null)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const result = await runAssetGeneration(input, resolvedDeps, {
        signal: abortRef.current.signal,
      })
      setGeneratedImageUrl(result.generatedImageUrl)
      setError(result.error)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI生成失败'
      resolvedDeps.notifier.error(message)
      setError(err instanceof Error ? err : new Error(message))
    } finally {
      setIsGenerating(false)
    }
  }, [input, resolvedDeps])

  const resetGeneratedState = useCallback(() => {
    setGeneratedImageUrl(null)
    setError(null)
    abortRef.current?.abort()
  }, [])

  return {
    error,
    generate,
    generatedImageUrl,
    isGenerating,
    resetGeneratedState,
    setGeneratedImageUrl,
  }
}
