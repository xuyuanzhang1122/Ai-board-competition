/* eslint-disable unicorn/prefer-structured-clone -- legacy history intentionally uses JSON snapshots */
import { create, type StoreApi, type UseBoundStore } from 'zustand'

import { useUserStore } from '@/shared/store/user'
import type {
  AssetVersionVO,
  BatchGenerateRequest,
  BatchGenerateResponse,
  ProjectCharacterVO,
  ProjectPropVO,
  ProjectSceneVO,
  SetCurrentVersionRequest,
  StoryboardShotVO,
} from '@/shared/types/api'

import {
  assetApi,
  characterApi,
  generationApi,
  type GenerationParams,
  jobApi,
  propApi,
  sceneApi,
  shotApi,
} from './api'
import { reconcileShots } from './components/storyboard/reconcile-shots'
import { preserveArrayIdentity } from './preserve-identity'

export interface LocalImageHistoryRecord {
  createdAt: string
  groupId?: number
  groupIndex?: number
  id: number
  prompt: string | null
  url: string
  versionNo: number
}

export interface EditorNotifier {
  error: (message: string) => void
  success: (message: string) => void
  warning: (message: string) => void
}

export interface EditorStoreDependencies {
  assetApi: typeof assetApi
  characterApi: typeof characterApi
  generationApi: typeof generationApi
  jobApi: typeof jobApi
  notifier: EditorNotifier
  propApi: typeof propApi
  sceneApi: typeof sceneApi
  shotApi: typeof shotApi
}

/**
 * A generation job we are actively tracking. This is the frontend half of the
 * "generate → Job → asset" data link: instead of brute-force refetching every
 * shot on a timer, we poll the cheap single-row job-status endpoint and only
 * refetch shots once when a job reaches a terminal state.
 */
export interface ActiveGenerationJob {
  jobId: number
  kind: ActiveGenerationJobKind
  /** Target ids for the generated entity. Empty only when the server cannot provide item links. */
  targetIds: number[]
}

export type ActiveGenerationJobKind = 'shot-image' | 'video' | 'character' | 'scene' | 'prop'

export interface EditorData {
  activeCharacters: ProjectCharacterVO[]
  activeJobs: ActiveGenerationJob[]
  activeScenes: ProjectSceneVO[]
  allSelected: boolean
  canRedo: boolean
  canUndo: boolean
  characterDescriptionCache: Map<string, string>
  characters: ProjectCharacterVO[]
  hasSelection: boolean
  history: StoryboardShotVO[][]
  historyIndex: number
  loading: boolean
  localImageHistory: Record<string, LocalImageHistoryRecord[]>
  maxHistorySize: number
  originalScript: string
  projectId: number | null
  props: ProjectPropVO[]
  scenes: ProjectSceneVO[]
  selectedShotIds: Set<number>
  selectedShots: StoryboardShotVO[]
  shots: StoryboardShotVO[]
}

interface EditorActions {
  addLocalImageHistory: (
    assetType: 'character' | 'scene' | 'prop',
    assetId: number,
    record: LocalImageHistoryRecord,
    shotId?: number,
  ) => void
  batchGenerateCharacters: (request: BatchGenerateRequest) => Promise<BatchGenerateResponse>
  batchGenerateScenes: (request: BatchGenerateRequest) => Promise<BatchGenerateResponse>
  batchGenerateShots: (request: BatchGenerateRequest) => Promise<BatchGenerateResponse>
  batchGenerateVideos: (request: BatchGenerateRequest) => Promise<BatchGenerateResponse>
  cacheCharacterDescription: (name: string, description: string) => void
  cleanExpiredHistory: () => void
  clearLocalImageHistory: (
    assetType: 'character' | 'scene' | 'prop',
    assetId: number,
    shotId?: number,
  ) => void
  clearLocalImageHistoryByName: (characterName: string) => void
  createShot: (scriptText: string) => Promise<void>
  deleteLocalImageHistory: (
    assetType: 'character' | 'scene' | 'prop',
    assetId: number,
    recordId: number,
    shotId?: number,
  ) => void
  deleteShot: (shotId: number) => Promise<void>
  deselectAll: () => void
  fetchCharacters: () => Promise<void>
  fetchProps: () => Promise<void>
  fetchScenes: () => Promise<void>
  fetchShots: () => Promise<void>
  generateCharacterImage: (
    characterId: number,
    params: GenerationParams,
  ) => Promise<BatchGenerateResponse>
  generateSceneImage: (
    sceneId: number,
    params: GenerationParams,
  ) => Promise<BatchGenerateResponse>
  generateShotImage: (
    shotId: number,
    params: GenerationParams,
  ) => Promise<BatchGenerateResponse>
  generateVideo: (shotId: number, params: GenerationParams) => Promise<BatchGenerateResponse>
  getAssetVersions: (assetId: number) => Promise<AssetVersionVO[]>
  getLocalImageHistory: (
    assetType: 'character' | 'scene' | 'prop',
    assetId: number,
    shotId?: number,
  ) => LocalImageHistoryRecord[]
  initProject: (projectId: number) => Promise<void>
  invertSelection: () => void
  loadLocalImageHistory: () => void
  mergeShots: (shotIds: number[]) => Promise<void>
  moveShotDown: (shotId: number) => Promise<void>
  moveShotUp: (shotId: number) => Promise<void>
  parseAndCreateShots: (fullScript: string, signal?: AbortSignal) => Promise<void>
  pollActiveJobs: () => Promise<void>
  redo: () => Promise<void>
  /** Targeted refresh: refetch only the given shots and merge them by id, keeping every other shot's reference stable. */
  refreshShots: (shotIds: number[]) => Promise<void>
  registerGenerationJob: (
    jobId: number,
    kind: ActiveGenerationJobKind,
    targetIds?: number[],
  ) => void
  reorderShots: (shotIds: number[]) => Promise<void>
  reset: () => void
  resumeActiveJobs: () => Promise<void>
  saveHistory: () => void
  saveLocalImageHistory: () => void
  selectAll: () => void
  setAssetCurrentVersion: (assetId: number, request: SetCurrentVersionRequest) => Promise<void>
  toggleShotSelection: (shotId: number) => void
  undo: () => Promise<void>
  updateShot: (shotId: number, scriptText: string) => Promise<void>
  uploadAssetVersion: (assetId: number, file: File) => Promise<AssetVersionVO>
}

export type EditorStore = EditorData & EditorActions
export type EditorStoreHook = UseBoundStore<StoreApi<EditorStore>>

type DataPatch = Partial<EditorData>

const derive = (state: Pick<EditorData, 'characters' | 'history' | 'historyIndex' | 'scenes' | 'selectedShotIds' | 'shots'>) => ({
  activeCharacters: state.characters.filter((character) => character.isActive),
  activeScenes: state.scenes,
  allSelected: state.shots.length > 0 && state.selectedShotIds.size === state.shots.length,
  canRedo: state.historyIndex < state.history.length - 1,
  canUndo: state.historyIndex > 0,
  hasSelection: state.selectedShotIds.size > 0,
  selectedShots: state.shots.filter((shot) => state.selectedShotIds.has(shot.id)),
})

const initialData = (): EditorData => {
  const data = {
    activeJobs: [] as ActiveGenerationJob[],
    characterDescriptionCache: new Map<string, string>(),
    characters: [],
    history: [],
    historyIndex: -1,
    loading: false,
    localImageHistory: {},
    maxHistorySize: 20,
    originalScript: '',
    projectId: null,
    props: [],
    scenes: [],
    selectedShotIds: new Set<number>(),
    shots: [],
  }
  return { ...data, ...derive(data) }
}

const errorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== 'object' || error === null || !('message' in error)) return fallback
  return typeof error.message === 'string' && error.message ? error.message : fallback
}

const legacyNotifier: EditorNotifier = {
  error(message) {
    if (typeof window !== 'undefined')
      (window as Window & { $message?: EditorNotifier }).$message?.error(message)
  },
  success(message) {
    if (typeof window !== 'undefined')
      (window as Window & { $message?: EditorNotifier }).$message?.success(message)
  },
  warning(message) {
    if (typeof window !== 'undefined')
      (window as Window & { $message?: EditorNotifier }).$message?.warning(message)
  },
}

const defaultDependencies: EditorStoreDependencies = {
  assetApi,
  characterApi,
  generationApi,
  jobApi,
  notifier: legacyNotifier,
  propApi,
  sceneApi,
  shotApi,
}

const TERMINAL_JOB_STATUSES = new Set(['SUCCEEDED', 'COMPLETED', 'FAILED', 'CANCELED'])

const GENERATION_JOB_TYPES: Record<string, ActiveGenerationJobKind> = {
  BATCH_GEN_CHAR_IMG: 'character',
  BATCH_GEN_PROP_IMG: 'prop',
  BATCH_GEN_SCENE_IMG: 'scene',
  BATCH_GEN_SHOT_IMG: 'shot-image',
  BATCH_GEN_VIDEO: 'video',
  SINGLE_SHOT_IMAGE: 'shot-image',
  SINGLE_SHOT_VIDEO: 'video',
}

export const classifyGenerationJobType = (jobType: string): ActiveGenerationJobKind | null =>
  GENERATION_JOB_TYPES[jobType.toUpperCase()] ?? null

export const createEditorStore = (
  dependencyOverrides: Partial<EditorStoreDependencies> = {},
  initialState: Partial<EditorData> = {},
): EditorStoreHook => {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides }
  const seededState = { ...initialData(), ...initialState }
  const initialStateWithDerived = { ...seededState, ...derive(seededState) }

  return create<EditorStore>((set, get) => {
    const update = (patch: DataPatch) => {
      set((state) => {
        const next = { ...state, ...patch }
        const derived = derive(next)
        if (next.characters === state.characters) {
          derived.activeCharacters = state.activeCharacters
        }
        if (next.shots === state.shots && next.selectedShotIds === state.selectedShotIds) {
          derived.selectedShots = state.selectedShots
        }
        return { ...patch, ...derived }
      })
    }

    const captureScope = () => {
      const projectId = get().projectId
      const { userId, token } = useUserStore.getState()
      return () => get().projectId === projectId &&
        useUserStore.getState().userId === userId && useUserStore.getState().token === token
    }

    const notifyError = (error: unknown, fallback: string) =>
      dependencies.notifier.error(errorMessage(error, fallback))

    return {
      ...initialStateWithDerived,

      addLocalImageHistory(assetType, assetId, record, shotId) {
        const key = shotId ? `${assetType}_${assetId}_shot_${shotId}` : `${assetType}_${assetId}`
        const localImageHistory = get().localImageHistory
        update({
          localImageHistory: {
            ...localImageHistory,
            [key]: [record, ...(localImageHistory[key] ?? [])],
          },
        })
        get().saveLocalImageHistory()
      },

      async batchGenerateCharacters(request) {
        const projectId = get().projectId
        if (!projectId) throw new Error('No project selected')
        try {
          const response = await dependencies.generationApi.generateCharactersBatch(projectId, request)
          get().registerGenerationJob(response.jobId, 'character', request.targetIds)
          dependencies.notifier.success(`批量生成任务已提交 (Job ID: ${response.jobId})`)
          return response
        } catch (error) {
          notifyError(error, '批量生成失败')
          throw error
        }
      },

      cacheCharacterDescription(name, description) {
        const nextCache = new Map(get().characterDescriptionCache)
        nextCache.set(name, description)
        update({ characterDescriptionCache: nextCache })
      },

      async batchGenerateScenes(request) {
        const projectId = get().projectId
        if (!projectId) throw new Error('No project selected')
        try {
          const response = await dependencies.generationApi.generateScenesBatch(projectId, request)
          get().registerGenerationJob(response.jobId, 'scene', request.targetIds)
          dependencies.notifier.success(`批量生成任务已提交 (Job ID: ${response.jobId})`)
          return response
        } catch (error) {
          notifyError(error, '批量生成失败')
          throw error
        }
      },

      async batchGenerateShots(request) {
        const projectId = get().projectId
        if (!projectId) throw new Error('No project selected')
        try {
          const response = await dependencies.generationApi.generateShotsBatch(projectId, request)
          const targetIds = new Set(request.targetIds)
          get().registerGenerationJob(response.jobId, 'shot-image', request.targetIds)
          update({
            shots: get().shots.map((shot) =>
              targetIds.has(shot.id) && (request.mode === 'ALL' || shot.shotImage.status !== 'READY')
                ? { ...shot, shotImage: { ...shot.shotImage, status: 'GENERATING' } }
                : shot,
            ),
          })
          dependencies.notifier.success(`批量生成任务已提交 (Job ID: ${response.jobId})`)
          return response
        } catch (error) {
          notifyError(error, '批量生成失败')
          throw error
        }
      },

      async batchGenerateVideos(request) {
        const projectId = get().projectId
        if (!projectId) throw new Error('No project selected')
        // 场景画像资产为强制项：任一目标分镜缺失时禁止提交
        const targetIdSet = new Set(request.targetIds)
        const missingNos = get()
          .shots.filter((shot) => targetIdSet.has(shot.id) && !shot.scene?.thumbnailUrl)
          .map((shot) => `#${shot.shotNo}`)
        if (missingNos.length > 0) {
          const displayNos =
            missingNos.length > 10
              ? `${missingNos.slice(0, 10).join('、')} 等${missingNos.length}个`
              : missingNos.join('、')
          const message = `分镜 ${displayNos} 缺少场景画像资产，禁止生成视频`
          dependencies.notifier.error(message)
          throw new Error(message)
        }
        try {
          const response = await dependencies.generationApi.generateVideosBatch(projectId, request)
          const targetIds = new Set(request.targetIds)
          get().registerGenerationJob(response.jobId, 'video', request.targetIds)
          update({
            shots: get().shots.map((shot) =>
              targetIds.has(shot.id) && (request.mode === 'ALL' || shot.video.status !== 'READY')
                ? { ...shot, video: { ...shot.video, status: 'GENERATING' } }
                : shot,
            ),
          })
          dependencies.notifier.success(`批量生成任务已提交 (Job ID: ${response.jobId})`)
          return response
        } catch (error) {
          notifyError(error, '批量生成失败')
          throw error
        }
      },

      cleanExpiredHistory() {
        const now = Date.now()
        const sevenDays = 7 * 24 * 60 * 60 * 1000
        const current = get().localImageHistory
        const localImageHistory: Record<string, LocalImageHistoryRecord[]> = { ...current }
        let changed = false

        for (const [key, records] of Object.entries(current)) {
          const validRecords = records.filter(
            (record) => now - new Date(record.createdAt).getTime() < sevenDays,
          )
          if (validRecords.length !== records.length) {
            localImageHistory[key] = validRecords
            changed = true
          }
        }

        if (changed) {
          update({ localImageHistory })
          get().saveLocalImageHistory()
        }
      },

      clearLocalImageHistory(assetType, assetId, shotId) {
        const key = shotId ? `${assetType}_${assetId}_shot_${shotId}` : `${assetType}_${assetId}`
        const localImageHistory = { ...get().localImageHistory }
        delete localImageHistory[key]
        update({ localImageHistory })
        get().saveLocalImageHistory()
      },

      clearLocalImageHistoryByName(characterName) {
        const matchingIds = get()
          .characters.filter(
            (character) =>
              character.name === characterName || character.displayName === characterName,
          )
          .map((character) => character.id)
        const localImageHistory = { ...get().localImageHistory }
        let changed = false

        for (const id of matchingIds) {
          const generalKey = `character_${id}`
          if (localImageHistory[generalKey]) {
            delete localImageHistory[generalKey]
            changed = true
          }
          for (const key of Object.keys(localImageHistory)) {
            if (key.startsWith(`character_${id}_shot_`)) {
              delete localImageHistory[key]
              changed = true
            }
          }
        }

        if (changed) {
          update({ localImageHistory })
          get().saveLocalImageHistory()
        }
      },

      async createShot(scriptText) {
        const projectId = get().projectId
        if (!projectId) return
        try {
          await dependencies.shotApi.createShot(projectId, scriptText)
          await get().fetchShots()
          get().saveHistory()
          dependencies.notifier.success('分镜添加成功')
        } catch (error) {
          notifyError(error, '分镜添加失败')
        }
      },

      deleteLocalImageHistory(assetType, assetId, recordId, shotId) {
        const key = shotId ? `${assetType}_${assetId}_shot_${shotId}` : `${assetType}_${assetId}`
        const current = get().localImageHistory
        update({
          localImageHistory: {
            ...current,
            [key]: (current[key] ?? []).filter((record) => record.id !== recordId),
          },
        })
        get().saveLocalImageHistory()
      },

      async deleteShot(shotId) {
        const projectId = get().projectId
        if (!projectId) return
        try {
          await dependencies.shotApi.deleteShot(projectId, shotId)
          await get().fetchShots()
          const selectedShotIds = new Set(get().selectedShotIds)
          selectedShotIds.delete(shotId)
          update({ selectedShotIds })
          get().saveHistory()
          dependencies.notifier.success('分镜删除成功')
        } catch (error) {
          notifyError(error, '分镜删除失败')
        }
      },

      deselectAll() {
        update({ selectedShotIds: new Set() })
      },

      async fetchCharacters() {
        const projectId = get().projectId
        if (!projectId) return
        const current = captureScope()
        try {
          const fetched = await dependencies.characterApi.getProjectCharacters(projectId)
          if (!current()) return
          update({ characters: preserveArrayIdentity(get().characters, fetched) })
        } catch {
          if (!current()) return
          update({ characters: [] })
        }
      },

      async fetchProps() {
        const projectId = get().projectId
        if (!projectId) return
        const current = captureScope()
        try {
          const fetched = await dependencies.propApi.getProjectProps(projectId)
          if (!current()) return
          update({ props: preserveArrayIdentity(get().props, fetched) })
        } catch {
          if (!current()) return
          update({ props: [] })
        }
      },

      async fetchScenes() {
        const projectId = get().projectId
        if (!projectId) return
        const current = captureScope()
        try {
          const fetched = await dependencies.sceneApi.getProjectScenes(projectId)
          if (!current()) return
          update({ scenes: preserveArrayIdentity(get().scenes, fetched) })
        } catch {
          if (!current()) return
          update({ scenes: [] })
        }
      },

      async fetchShots() {
        const projectId = get().projectId
        if (!projectId) return
        const current = captureScope()
        const fetched = await dependencies.shotApi.getProjectShots(projectId)
        if (!current()) return
        const prev = get().shots

        // The backend derives shot asset status from Asset/AssetVersion tables.
        // Batch generation only creates assets AFTER completion, so during
        // generation the backend still returns NONE (or the old READY).
        // Without this merge the first poll would overwrite the optimistic
        // GENERATING status, stop polling, and lose the result permanently.
        let adjusted = fetched
        if (prev.some((s) => s.shotImage.status === 'GENERATING' || s.video.status === 'GENERATING')) {
          const prevById = new Map(prev.map((s) => [s.id, s]))
          let anyMerged = false
          const merged = fetched.map((shot) => {
            const old = prevById.get(shot.id)
            if (!old) return shot
            const keepImg =
              old.shotImage.status === 'GENERATING' &&
              shot.shotImage.status !== 'GENERATING' &&
              shot.shotImage.status !== 'FAILED' &&
              shot.shotImage.currentVersionId === old.shotImage.currentVersionId
            const keepVid =
              old.video.status === 'GENERATING' &&
              shot.video.status !== 'GENERATING' &&
              shot.video.status !== 'FAILED' &&
              shot.video.currentVersionId === old.video.currentVersionId
            if (!keepImg && !keepVid) return shot
            anyMerged = true
            return {
              ...shot,
              ...(keepImg
                ? { shotImage: { ...shot.shotImage, status: 'GENERATING' as const } }
                : {}),
              ...(keepVid ? { video: { ...shot.video, status: 'GENERATING' as const } } : {}),
            }
          })
          if (anyMerged) adjusted = merged
        }

        const reconciled = reconcileShots(prev, adjusted)
        if (reconciled !== prev) {
          update({ shots: reconciled })
        }
      },

      async refreshShots(shotIds) {
        const projectId = get().projectId
        const ids = [...new Set(shotIds)].filter((id) => Number.isFinite(id))
        if (!projectId || ids.length === 0) return
        // Only the affected shots are refetched and merged by id; every other shot
        // keeps its exact reference so its row/cells never re-render. Throws on
        // network error so the caller (pollActiveJobs) can retry next tick.
        const current = captureScope()
        const fetched = await dependencies.shotApi.getProjectShots(projectId, ids)
        if (!current()) return
        const fetchedById = new Map(fetched.map((shot) => [shot.id, shot]))
        const prev = get().shots
        let changed = false
        const next = prev.map((shot) => {
          const incoming = fetchedById.get(shot.id)
          if (!incoming || JSON.stringify(incoming) === JSON.stringify(shot)) return shot
          changed = true
          return incoming
        })
        if (changed) update({ shots: next })
      },

      async generateCharacterImage(characterId, params) {
        const projectId = get().projectId
        if (!projectId) throw new Error('No project selected')
        try {
          const response = await dependencies.generationApi.generateSingleCharacter(
            projectId,
            characterId,
            params,
          )
          get().registerGenerationJob(response.jobId, 'character', [characterId])
          dependencies.notifier.success(`角色画像生成任务已提交 (Job ID: ${response.jobId})`)
          return response
        } catch (error) {
          notifyError(error, '生成失败')
          throw error
        }
      },

      async generateSceneImage(sceneId, params) {
        const projectId = get().projectId
        if (!projectId) throw new Error('No project selected')
        try {
          const response = await dependencies.generationApi.generateSingleScene(
            projectId,
            sceneId,
            params,
          )
          get().registerGenerationJob(response.jobId, 'scene', [sceneId])
          dependencies.notifier.success(`场景画像生成任务已提交 (Job ID: ${response.jobId})`)
          return response
        } catch (error) {
          notifyError(error, '生成失败')
          throw error
        }
      },

      async generateShotImage(shotId, params) {
        const projectId = get().projectId
        if (!projectId) throw new Error('No project selected')
        try {
          const response = await dependencies.generationApi.generateSingleShot(
            projectId,
            shotId,
            params,
          )
          get().registerGenerationJob(response.jobId, 'shot-image', [shotId])
          dependencies.notifier.success(`分镜图生成任务已提交 (Job ID: ${response.jobId})`)
          return response
        } catch (error) {
          notifyError(error, '生成失败')
          throw error
        }
      },

      async generateVideo(shotId, params) {
        const projectId = get().projectId
        if (!projectId) throw new Error('No project selected')
        try {
          const response = await dependencies.generationApi.generateSingleVideo(
            projectId,
            shotId,
            params,
          )
          get().registerGenerationJob(response.jobId, 'video', [shotId])
          dependencies.notifier.success(`视频生成任务已提交 (Job ID: ${response.jobId})`)
          return response
        } catch (error) {
          notifyError(error, '生成失败')
          throw error
        }
      },

      async getAssetVersions(assetId) {
        try {
          return await dependencies.assetApi.getAssetVersions(assetId)
        } catch (error) {
          notifyError(error, '获取版本历史失败')
          throw error
        }
      },

      getLocalImageHistory(assetType, assetId, shotId) {
        const history = get().localImageHistory
        if (!shotId) return history[`${assetType}_${assetId}`] ?? []

        const shotHistory = history[`${assetType}_${assetId}_shot_${shotId}`] ?? []
        const generalHistory = history[`${assetType}_${assetId}`] ?? []
        const combined = [...shotHistory]
        const urls = new Set(shotHistory.map((record) => record.url))
        for (const record of generalHistory) {
          if (!urls.has(record.url)) {
            combined.push(record)
            urls.add(record.url)
          }
        }
        return combined.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
      },

      async initProject(projectId) {
        if (get().projectId !== projectId) update({ characterDescriptionCache: new Map(), localImageHistory: {} })
        update({ loading: true, projectId })
        const current = captureScope()
        try {
          get().loadLocalImageHistory()
          get().cleanExpiredHistory()
          await Promise.all([
            get().fetchShots(),
            get().fetchCharacters(),
            get().fetchScenes(),
            get().fetchProps(),
          ])
          if (!current()) return
          get().saveHistory()
          // Resume tracking any generation still running on the server so a
          // page reload mid-generation doesn't lose the spinner/result.
          await get().resumeActiveJobs()
        } finally {
          if (current()) update({ loading: false })
        }
      },

      invertSelection() {
        const state = get()
        const selectedShotIds = new Set<number>()
        for (const shot of state.shots) {
          if (!state.selectedShotIds.has(shot.id)) selectedShotIds.add(shot.id)
        }
        update({ selectedShotIds })
      },

      loadLocalImageHistory() {
        const projectId = get().projectId
        if (!projectId) return
        try {
          const stored = localStorage.getItem(`ai_story_studio_user_${useUserStore.getState().userId}_project_${projectId}_history`)
          if (stored) update({ localImageHistory: JSON.parse(stored) as EditorData['localImageHistory'] })
        } catch {
          // Legacy behaviour ignores malformed or unavailable local storage.
        }
      },

      async mergeShots(shotIds) {
        const state = get()
        if (!state.projectId || shotIds.length < 2) return
        try {
          const selectedShots = state.shots
            .filter((shot) => shotIds.includes(shot.id))
            .sort((a, b) => a.shotNo - b.shotNo)
          if (selectedShots.length < 2) {
            dependencies.notifier.warning('请至少选择两条分镜进行合并')
            return
          }

          const [firstShot, ...otherShots] = selectedShots
          await dependencies.shotApi.updateShot(
            state.projectId,
            firstShot.id,
            selectedShots.map((shot) => shot.scriptText).join('\n\n'),
          )
          for (const shot of otherShots) {
            await dependencies.shotApi.deleteShot(state.projectId, shot.id)
          }
          await get().fetchShots()
          get().deselectAll()
          get().saveHistory()
          dependencies.notifier.success(`已合并 ${selectedShots.length} 条分镜`)
        } catch (error) {
          notifyError(error, '合并分镜失败')
        }
      },

      async moveShotDown(shotId) {
        const shots = get().shots
        const index = shots.findIndex((shot) => shot.id === shotId)
        if (index < 0 || index >= shots.length - 1) return
        const newOrder = [...shots]
        ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
        await get().reorderShots(newOrder.map((shot) => shot.id))
      },

      async moveShotUp(shotId) {
        const shots = get().shots
        const index = shots.findIndex((shot) => shot.id === shotId)
        if (index <= 0) return
        const newOrder = [...shots]
        ;[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]
        await get().reorderShots(newOrder.map((shot) => shot.id))
      },

      async parseAndCreateShots(fullScript, signal) {
        const projectId = get().projectId
        if (!projectId) return
        try {
          update({ originalScript: fullScript })
          await dependencies.shotApi.parseAndCreateShots(projectId, fullScript, signal)
          await get().fetchShots()
          get().saveHistory()
          dependencies.notifier.success('AI解析完成，分镜已创建')
        } catch (error) {
          const cancellation =
            typeof error === 'object' && error !== null
              ? (error as { message?: unknown; name?: unknown })
              : null
          if (cancellation?.name === 'CanceledError' || cancellation?.message === 'canceled') return
          notifyError(error, 'AI解析失败')
          throw error
        }
      },

      registerGenerationJob(jobId, kind, targetIds = []) {
        if (!Number.isFinite(jobId) || get().activeJobs.some((job) => job.jobId === jobId)) {
          return
        }
        update({
          activeJobs: [
            ...get().activeJobs,
            { jobId, kind, targetIds: [...new Set(targetIds)] },
          ],
        })
      },

      async pollActiveJobs() {
        const jobs = get().activeJobs
        if (jobs.length === 0) return

        const stillActive: ActiveGenerationJob[] = []
        const finished: ActiveGenerationJob[] = []
        const unsuccessful: ActiveGenerationJob[] = []
        const failedMessages: string[] = []

        // Poll the cheap single-row job-status endpoint per job. A transient
        // network error keeps the job in the active set so we retry next tick;
        // it never triggers a full-table refetch.
        for (const job of jobs) {
          try {
            const status = await dependencies.jobApi.getJobStatus(job.jobId)
            if (TERMINAL_JOB_STATUSES.has(status.status)) {
              finished.push(job)
              if (status.status === 'FAILED' || status.status === 'CANCELED') {
                unsuccessful.push(job)
                failedMessages.push(status.errorMessage || `任务 ${job.jobId} 生成失败`)
              }
            } else {
              stillActive.push(job)
            }
          } catch {
            stillActive.push(job)
          }
        }

        if (finished.length === 0) return

        // A terminal failed Job is authoritative even if the shot endpoint still
        // reports NONE. Clear the optimistic spinner before fetchShots so its
        // stale-response merge cannot resurrect GENERATING forever.
        let shots = get().shots
        if (unsuccessful.length > 0) {
          const failedImages = new Set(
            unsuccessful.filter((job) => job.kind === 'shot-image').flatMap((job) => job.targetIds),
          )
          const failedVideos = new Set(
            unsuccessful.filter((job) => job.kind === 'video').flatMap((job) => job.targetIds),
          )
          shots = shots.map((shot) => ({
            ...shot,
            ...(failedImages.has(shot.id)
              ? { shotImage: { ...shot.shotImage, status: 'FAILED' as const } }
              : {}),
            ...(failedVideos.has(shot.id)
              ? { video: { ...shot.video, status: 'FAILED' as const } }
              : {}),
          }))
        }

        update({ activeJobs: stillActive, shots })
        const finishedAssetJobs = finished.filter(
          (job) => job.kind === 'character' || job.kind === 'scene' || job.kind === 'prop',
        )
        const finishedShotJobs = finished.filter(
          (job) => job.kind === 'shot-image' || job.kind === 'video',
        )
        try {
          if (finishedAssetJobs.length > 0) {
            await Promise.all([
              ...(finishedAssetJobs.some((job) => job.kind === 'character')
                ? [get().fetchCharacters()]
                : []),
              ...(finishedAssetJobs.some((job) => job.kind === 'scene')
                ? [get().fetchScenes()]
                : []),
              ...(finishedAssetJobs.some((job) => job.kind === 'prop') ? [get().fetchProps()] : []),
              get().fetchShots(),
            ])
          } else if (finishedShotJobs.length > 0) {
            // Shot-image/video jobs can use a scoped refresh when target ids
            // are known. Older restored jobs without item links fall back to full shots.
            const finishedShotIds = [...new Set(finishedShotJobs.flatMap((job) => job.targetIds))]
            const canTarget =
              finishedShotJobs.every((job) => job.targetIds.length > 0) && finishedShotIds.length > 0
            if (canTarget) {
              await get().refreshShots(finishedShotIds)
            } else {
              await get().fetchShots()
            }
          } else {
            await Promise.resolve()
          }
        } catch {
          // A successful provider job is not visible to the user until its asset
          // refresh succeeds. Keep only those successful jobs for a retry; failed
          // targets were already settled locally above.
          const failedJobIds = new Set(unsuccessful.map((job) => job.jobId))
          update({
            activeJobs: [
              ...stillActive,
              ...finished.filter((job) => !failedJobIds.has(job.jobId)),
            ],
          })
          for (const message of failedMessages) {
            dependencies.notifier.error(message)
          }
          return
        }
        if (unsuccessful.length > 0) {
          const failedImages = new Set(
            unsuccessful.filter((job) => job.kind === 'shot-image').flatMap((job) => job.targetIds),
          )
          const failedVideos = new Set(
            unsuccessful.filter((job) => job.kind === 'video').flatMap((job) => job.targetIds),
          )
          update({
            shots: get().shots.map((shot) => {
              const imageFailed = failedImages.has(shot.id)
              const videoFailed = failedVideos.has(shot.id)
              if (!imageFailed && !videoFailed) return shot
              return {
                ...shot,
                ...(imageFailed
                  ? { shotImage: { ...shot.shotImage, status: 'FAILED' as const } }
                  : {}),
                ...(videoFailed
                  ? { video: { ...shot.video, status: 'FAILED' as const } }
                  : {}),
              }
            }),
          })
        }
        for (const message of failedMessages) {
          dependencies.notifier.error(message)
        }
      },

      async redo() {
        const state = get()
        if (!state.canRedo) return
        const historyIndex = state.historyIndex + 1
        const shots = JSON.parse(JSON.stringify(state.history[historyIndex])) as StoryboardShotVO[]
        update({ historyIndex, shots })
        const projectId = get().projectId
        if (projectId && shots.length > 0) {
          try {
            await dependencies.shotApi.reorderShots(
              projectId,
              shots.map((shot) => shot.id),
            )
            dependencies.notifier.success('重做成功')
          } catch {
            update({ historyIndex: get().historyIndex - 1 })
            dependencies.notifier.error('重做失败')
          }
        }
      },

      async reorderShots(shotIds) {
        const projectId = get().projectId
        if (!projectId) return
        try {
          await dependencies.shotApi.reorderShots(projectId, shotIds)
          await get().fetchShots()
          get().saveHistory()
        } catch (error) {
          notifyError(error, '调整顺序失败')
        }
      },

      reset() {
        update({
          activeJobs: [],
          characterDescriptionCache: new Map(),
          characters: [],
          history: [],
          historyIndex: -1,
          loading: false,
          localImageHistory: {},
          projectId: null,
          scenes: [],
          selectedShotIds: new Set(),
          shots: [],
        })
      },

      async resumeActiveJobs() {
        const projectId = get().projectId
        if (!projectId) return
        // After a reload the optimistic GENERATING flags are gone. Rebuild the
        // active-job set from the server so polling resumes and terminal
        // refreshes pull back generated shots and asset thumbnails.
        try {
          const pages = await Promise.all([
            dependencies.jobApi.getUserJobs({ page: 1, projectId, size: 100, status: 'RUNNING' }),
            dependencies.jobApi.getUserJobs({ page: 1, projectId, size: 100, status: 'PENDING' }),
          ])
          const restored: ActiveGenerationJob[] = []
          const seen = new Set<number>()
          for (const page of pages) {
            for (const job of page.records) {
              const kind = classifyGenerationJobType(job.jobType)
              if (!kind || seen.has(job.id)) continue
              seen.add(job.id)
              restored.push({ jobId: job.id, kind, targetIds: [...new Set(job.targetIds ?? [])] })
            }
          }
          if (restored.length > 0) {
            const existing = get().activeJobs
            const existingJobIds = new Set(existing.map((job) => job.jobId))
            update({
              activeJobs: [
                ...existing,
                ...restored.filter((job) => !existingJobIds.has(job.jobId)),
              ],
            })
          }
        } catch {
          // Restoring is best-effort; a failure here must not block the editor.
        }
      },

      saveHistory() {
        const state = get()
        const snapshot = JSON.parse(JSON.stringify(state.shots)) as StoryboardShotVO[]
        const history =
          state.historyIndex < state.history.length - 1
            ? state.history.slice(0, state.historyIndex + 1)
            : [...state.history]
        history.push(snapshot)
        let historyIndex = state.historyIndex + 1
        if (history.length > state.maxHistorySize) {
          history.shift()
          historyIndex -= 1
        }
        update({ history, historyIndex })
      },

      saveLocalImageHistory() {
        const state = get()
        if (!state.projectId) return
        try {
          localStorage.setItem(
            `ai_story_studio_user_${useUserStore.getState().userId}_project_${state.projectId}_history`,
            JSON.stringify(state.localImageHistory),
          )
        } catch {
          // Legacy behaviour ignores unavailable or exhausted local storage.
        }
      },

      selectAll() {
        update({ selectedShotIds: new Set(get().shots.map((shot) => shot.id)) })
      },

      async setAssetCurrentVersion(assetId, request) {
        try {
          await dependencies.assetApi.setCurrentVersion(assetId, request)
          await get().fetchShots()
          dependencies.notifier.success('版本切换成功')
        } catch (error) {
          notifyError(error, '版本切换失败')
          throw error
        }
      },

      toggleShotSelection(shotId) {
        const selectedShotIds = new Set(get().selectedShotIds)
        if (selectedShotIds.has(shotId)) selectedShotIds.delete(shotId)
        else selectedShotIds.add(shotId)
        update({ selectedShotIds })
      },

      async undo() {
        const state = get()
        if (!state.canUndo) return
        const historyIndex = state.historyIndex - 1
        const shots = JSON.parse(JSON.stringify(state.history[historyIndex])) as StoryboardShotVO[]
        update({ historyIndex, shots })
        const projectId = get().projectId
        if (projectId && shots.length > 0) {
          try {
            await dependencies.shotApi.reorderShots(
              projectId,
              shots.map((shot) => shot.id),
            )
            dependencies.notifier.success('撤销成功')
          } catch {
            update({ historyIndex: get().historyIndex + 1 })
            dependencies.notifier.error('撤销失败')
          }
        }
      },

      async updateShot(shotId, scriptText) {
        const projectId = get().projectId
        if (!projectId) return
        try {
          await dependencies.shotApi.updateShot(projectId, shotId, scriptText)
          await get().fetchShots()
          get().saveHistory()
          dependencies.notifier.success('分镜更新成功')
        } catch (error) {
          notifyError(error, '分镜更新失败')
        }
      },

      async uploadAssetVersion(assetId, file) {
        try {
          const version = await dependencies.assetApi.uploadNewVersion(assetId, file)
          await get().fetchShots()
          dependencies.notifier.success('版本上传成功')
          return version
        } catch (error) {
          notifyError(error, '版本上传失败')
          throw error
        }
      },
    }
  })
}

export const useEditorStore = createEditorStore()
