import { describe, expect, it, vi } from 'vitest'

import { useUserStore } from '@/shared/store/user'
import type {
  AssetStatusVO,
  BatchGenerateResponse,
  JobVO,
  PageResult,
  StoryboardShotVO,
} from '@/shared/types/api'

import { assetApi, characterApi, generationApi, jobApi, propApi, sceneApi, shotApi } from './api'
import {
  type ActiveGenerationJobKind,
  classifyGenerationJobType,
  createEditorStore,
  type EditorStoreDependencies,
} from './store'

vi.mock('@/shared/api/client', () => ({
  default: { delete: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

const emptyAsset = (): AssetStatusVO => ({
  assetId: null,
  currentUrl: null,
  currentVersionId: null,
  status: 'NONE',
  totalVersions: 0,
})

const makeShot = (id: number, shotNo: number, scriptText = `分镜 ${shotNo}`): StoryboardShotVO => ({
  characters: [],
  createdAt: '2026-06-28T00:00:00Z',
  id,
  props: [],
  scene: null,
  scriptText,
  shotImage: emptyAsset(),
  shotNo,
  updatedAt: '2026-06-28T00:00:00Z',
  video: emptyAsset(),
})

// 视频生成要求分镜绑定带画像的场景资产
const makeShotWithScene = (id: number, shotNo: number): StoryboardShotVO => ({
  ...makeShot(id, shotNo),
  scene: { bindingId: 1, sceneId: 2, sceneName: '雨巷', thumbnailUrl: '/scene.png' },
})

const response: BatchGenerateResponse = {
  jobId: 88,
  message: 'submitted',
  status: 'PENDING',
  totalItems: 1,
}

const makeJob = (
  id: number,
  status: JobVO['status'],
  jobType = 'BATCH_GEN_SHOT_IMG',
  overrides: Partial<JobVO> = {},
): JobVO => ({
  allImageUrls: null,
  costPoints: null,
  createdAt: '2026-06-29T00:00:00Z',
  doneItems: 0,
  errorMessage: null,
  id,
  jobType,
  progress: 0,
  resultUrl: null,
  status,
  totalItems: 1,
  ...overrides,
})

const emptyPage = <T,>(): PageResult<T> => ({ current: 1, pages: 0, records: [], size: 100, total: 0 })

const createDependencies = (): EditorStoreDependencies => ({
  assetApi: { ...assetApi },
  characterApi: { ...characterApi },
  generationApi: {
    ...generationApi,
    generateShotsBatch: vi.fn(async () => response),
  },
  jobApi: {
    ...jobApi,
    getJobStatus: vi.fn(async () => makeJob(88, 'RUNNING')),
    getUserJobs: vi.fn(async () => emptyPage<JobVO>()),
  },
  notifier: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  propApi: { ...propApi },
  sceneApi: { ...sceneApi },
  shotApi: {
    ...shotApi,
    createShot: vi.fn(async () => makeShot(4, 4)),
    getProjectShots: vi.fn(async () => [makeShot(1, 1), makeShot(2, 2), makeShot(3, 3)]),
    reorderShots: vi.fn(async () => undefined),
    updateShot: vi.fn(async () => undefined),
  },
})

describe('editor Zustand store actions', () => {
  it('classifies all resumable generation job types', () => {
    expect(classifyGenerationJobType('BATCH_GEN_VIDEO')).toBe('video')
    expect(classifyGenerationJobType('SINGLE_SHOT_VIDEO')).toBe('video')
    expect(classifyGenerationJobType('BATCH_GEN_SHOT_IMG')).toBe('shot-image')
    expect(classifyGenerationJobType('SINGLE_SHOT_IMAGE')).toBe('shot-image')
    expect(classifyGenerationJobType('BATCH_GEN_CHAR_IMG')).toBe('character')
    expect(classifyGenerationJobType('BATCH_GEN_SCENE_IMG')).toBe('scene')
    expect(classifyGenerationJobType('BATCH_GEN_PROP_IMG')).toBe('prop')
    expect(classifyGenerationJobType('PARSE_TEXT')).toBeNull()
  })

  it('registers generation jobs once by job id', () => {
    const store = createEditorStore({}, { projectId: 7 })

    store.getState().registerGenerationJob(11, 'shot-image', [1, 1, 2])
    store.getState().registerGenerationJob(11, 'video', [3])
    store.getState().registerGenerationJob(12, 'character', [5])

    expect(store.getState().activeJobs).toEqual([
      { jobId: 11, kind: 'shot-image', targetIds: [1, 2] },
      { jobId: 12, kind: 'character', targetIds: [5] },
    ])
  })

  it('creates and updates shots through the API, refreshes, and snapshots each result', async () => {
    const dependencies = createDependencies()
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().createShot('新分镜')
    await store.getState().updateShot(2, '修改后的文本')

    expect(dependencies.shotApi.createShot).toHaveBeenCalledWith(7, '新分镜')
    expect(dependencies.shotApi.updateShot).toHaveBeenCalledWith(7, 2, '修改后的文本')
    expect(dependencies.shotApi.getProjectShots).toHaveBeenCalledTimes(2)
    expect(store.getState().history).toHaveLength(2)
    expect(store.getState().historyIndex).toBe(1)
  })

  it('preserves move-up/down ordering and no-ops at boundaries', async () => {
    const dependencies = createDependencies()
    const currentShots = [makeShot(1, 1), makeShot(2, 2), makeShot(3, 3)]
    const store = createEditorStore(dependencies, { projectId: 7, shots: currentShots })

    await store.getState().moveShotUp(2)
    await store.getState().moveShotDown(2)
    await store.getState().moveShotUp(1)

    expect(dependencies.shotApi.reorderShots).toHaveBeenNthCalledWith(1, 7, [2, 1, 3])
    expect(dependencies.shotApi.reorderShots).toHaveBeenNthCalledWith(2, 7, [1, 3, 2])
    expect(dependencies.shotApi.reorderShots).toHaveBeenCalledTimes(2)
  })

  it('forwards generation requests, returns responses, and rejects without a selected project', async () => {
    const dependencies = createDependencies()
    const store = createEditorStore(dependencies, { projectId: 7 })
    const request = { countPerItem: 1, mode: 'MISSING' as const, targetIds: [1] }

    await expect(store.getState().batchGenerateShots(request)).resolves.toBe(response)
    expect(dependencies.generationApi.generateShotsBatch).toHaveBeenCalledWith(7, request)

    store.setState({ projectId: null })
    await expect(store.getState().batchGenerateShots(request)).rejects.toThrow(
      'No project selected',
    )
  })

  it('rethrows generation errors after reporting the legacy fallback message', async () => {
    const dependencies = createDependencies()
    const failure = new Error('provider unavailable')
    dependencies.generationApi.generateShotsBatch = vi.fn(async () => {
      throw failure
    })
    const store = createEditorStore(dependencies, { projectId: 7 })

    await expect(
      store.getState().batchGenerateShots({ countPerItem: 1, mode: 'ALL', targetIds: [1] }),
    ).rejects.toBe(failure)
    expect(dependencies.notifier.error).toHaveBeenCalledWith('provider unavailable')
  })

  it('refreshes shots after switching the current asset version', async () => {
    const dependencies = createDependencies()
    dependencies.assetApi.setCurrentVersion = vi.fn(async () => undefined)
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().setAssetCurrentVersion(91, { versionId: 17 })

    expect(dependencies.assetApi.setCurrentVersion).toHaveBeenCalledWith(91, { versionId: 17 })
    expect(dependencies.shotApi.getProjectShots).toHaveBeenCalledTimes(1)
  })

  it('preserves shot object identity across refetches when content is unchanged', async () => {
    const dependencies = createDependencies()
    // Each call returns deep-equal but freshly-allocated shot objects, like a real poll.
    dependencies.shotApi.getProjectShots = vi
      .fn(async () => [makeShot(1, 1), makeShot(2, 2)])
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().fetchShots()
    const first = store.getState().shots
    await store.getState().fetchShots()
    const second = store.getState().shots

    expect(second).toBe(first)
    expect(second[0]).toBe(first[0])
    expect(second[1]).toBe(first[1])
  })

  it('preserves optimistic GENERATING status when polling returns stale NONE', async () => {
    const dependencies = createDependencies()
    // Polling always returns the same NONE status (backend hasn't created the asset yet).
    dependencies.shotApi.getProjectShots = vi.fn(async () => [makeShotWithScene(1, 1), makeShot(2, 2)])
    dependencies.generationApi.generateVideosBatch = vi.fn(async () => response)
    const store = createEditorStore(dependencies, { projectId: 7 })

    // Initial fetch: both shots have NONE video status.
    await store.getState().fetchShots()
    expect(store.getState().shots[0].video.status).toBe('NONE')

    // Submit batch video generation → optimistic update sets GENERATING.
    await store.getState().batchGenerateVideos({
      targetIds: [1],
      mode: 'ALL',
      countPerItem: 1,
      aspectRatio: '16:9',
      model: 'test-model',
    })
    expect(store.getState().shots[0].video.status).toBe('GENERATING')

    // First poll: backend still returns NONE → GENERATING must survive.
    await store.getState().fetchShots()
    expect(store.getState().shots[0].video.status).toBe('GENERATING')

    // Backend eventually creates the asset → poll returns READY.
    const readyShot = makeShot(1, 1)
    readyShot.video = { ...readyShot.video, assetId: 99, currentVersionId: 200, currentUrl: '/v.mp4', status: 'READY', totalVersions: 1 }
    dependencies.shotApi.getProjectShots = vi.fn(async () => [readyShot, makeShot(2, 2)])
    await store.getState().fetchShots()
    expect(store.getState().shots[0].video.status).toBe('READY')
  })

  it('clears GENERATING when backend returns FAILED', async () => {
    const dependencies = createDependencies()
    dependencies.shotApi.getProjectShots = vi.fn(async () => [makeShot(1, 1)])
    dependencies.generationApi.generateShotsBatch = vi.fn(async () => response)
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().fetchShots()
    await store.getState().batchGenerateShots({
      targetIds: [1],
      mode: 'ALL',
      countPerItem: 1,
      aspectRatio: '16:9',
      model: 'test-model',
    })
    expect(store.getState().shots[0].shotImage.status).toBe('GENERATING')

    const failedShot = makeShot(1, 1)
    failedShot.shotImage = { ...failedShot.shotImage, status: 'FAILED' }
    dependencies.shotApi.getProjectShots = vi.fn(async () => [failedShot])
    await store.getState().fetchShots()
    expect(store.getState().shots[0].shotImage.status).toBe('FAILED')
  })

  it('registers a job on submit and refetches shots once when it completes', async () => {
    const dependencies = createDependencies()
    dependencies.jobApi.getJobStatus = vi
      .fn()
      .mockResolvedValueOnce(makeJob(88, 'RUNNING'))
      .mockResolvedValueOnce(makeJob(88, 'SUCCEEDED'))
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().batchGenerateShots({ countPerItem: 1, mode: 'ALL', targetIds: [1] })
    expect(store.getState().activeJobs).toHaveLength(1)
    expect(store.getState().activeJobs[0]).toMatchObject({
      kind: 'shot-image',
      targetIds: [1],
    })
    const callsAfterSubmit = (dependencies.shotApi.getProjectShots as ReturnType<typeof vi.fn>).mock
      .calls.length

    // First poll: job still RUNNING → no refetch, job stays active.
    await store.getState().pollActiveJobs()
    expect(store.getState().activeJobs).toHaveLength(1)
    expect(dependencies.shotApi.getProjectShots).toHaveBeenCalledTimes(callsAfterSubmit)

    // Second poll: job SUCCEEDED → exactly one refetch, job cleared.
    await store.getState().pollActiveJobs()
    expect(store.getState().activeJobs).toHaveLength(0)
    expect(dependencies.shotApi.getProjectShots).toHaveBeenCalledTimes(callsAfterSubmit + 1)
  })

  it('registers batch and single asset generation jobs', async () => {
    const dependencies = createDependencies()
    dependencies.generationApi.generateCharactersBatch = vi.fn(async () => ({
      ...response,
      jobId: 101,
    }))
    dependencies.generationApi.generateScenesBatch = vi.fn(async () => ({
      ...response,
      jobId: 102,
    }))
    dependencies.generationApi.generateSingleCharacter = vi.fn(async () => ({
      ...response,
      jobId: 103,
    }))
    dependencies.generationApi.generateSingleScene = vi.fn(async () => ({
      ...response,
      jobId: 104,
    }))
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().batchGenerateCharacters({ countPerItem: 1, mode: 'ALL', targetIds: [1, 2] })
    await store.getState().batchGenerateScenes({ countPerItem: 1, mode: 'ALL', targetIds: [3] })
    await store.getState().generateCharacterImage(4, { model: 'image-model' })
    await store.getState().generateSceneImage(5, { model: 'image-model' })

    expect(store.getState().activeJobs).toEqual([
      { jobId: 101, kind: 'character', targetIds: [1, 2] },
      { jobId: 102, kind: 'scene', targetIds: [3] },
      { jobId: 103, kind: 'character', targetIds: [4] },
      { jobId: 104, kind: 'scene', targetIds: [5] },
    ])
  })

  it('registers single shot-image and video generation jobs', async () => {
    const dependencies = createDependencies()
    dependencies.generationApi.generateSingleShot = vi.fn(async () => ({
      ...response,
      jobId: 111,
    }))
    dependencies.generationApi.generateSingleVideo = vi.fn(async () => ({
      ...response,
      jobId: 112,
    }))
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().generateShotImage(1, { model: 'image-model' })
    await store.getState().generateVideo(2, { model: 'video-model' })

    expect(store.getState().activeJobs).toEqual([
      { jobId: 111, kind: 'shot-image', targetIds: [1] },
      { jobId: 112, kind: 'video', targetIds: [2] },
    ])
  })

  it('refreshes only the finished job\'s shots (定点刷新) and keeps other rows referentially stable', async () => {
    const dependencies = createDependencies()
    dependencies.jobApi.getJobStatus = vi.fn(async () => makeJob(88, 'SUCCEEDED'))
    const readyShot2 = makeShot(2, 2)
    readyShot2.shotImage = { ...readyShot2.shotImage, currentUrl: 'https://img/2.png', status: 'READY' }
    dependencies.shotApi.getProjectShots = vi.fn(async () => [readyShot2])

    const store = createEditorStore(dependencies, {
      projectId: 7,
      shots: [makeShot(1, 1), makeShot(2, 2), makeShot(3, 3)],
    })
    const shot1Before = store.getState().shots[0]
    const shot3Before = store.getState().shots[2]

    await store.getState().batchGenerateShots({ countPerItem: 1, mode: 'ALL', targetIds: [2] })
    await store.getState().pollActiveJobs()

    // Only shot 2 (the job's target) is refetched — a scoped ids= query, not the whole table.
    expect(dependencies.shotApi.getProjectShots).toHaveBeenLastCalledWith(7, [2])
    expect(store.getState().shots[1].shotImage.status).toBe('READY')
    // Untouched rows keep their exact reference so their memoized rows never re-render.
    expect(store.getState().shots[0]).toBe(shot1Before)
    expect(store.getState().shots[2]).toBe(shot3Before)
  })

  it('surfaces a failed job error and stops polling it', async () => {
    const dependencies = createDependencies()
    dependencies.jobApi.getJobStatus = vi.fn(async () => ({
      ...makeJob(88, 'FAILED'),
      errorMessage: '上游模型不可用',
    }))
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().batchGenerateShots({ countPerItem: 1, mode: 'ALL', targetIds: [1] })
    await store.getState().pollActiveJobs()

    expect(store.getState().activeJobs).toHaveLength(0)
    expect(dependencies.notifier.error).toHaveBeenCalledWith('上游模型不可用')
  })

  it('clears an optimistic video spinner when the parent job fails before an asset exists', async () => {
    const dependencies = createDependencies()
    dependencies.generationApi.generateVideosBatch = vi.fn(async () => response)
    dependencies.shotApi.getProjectShots = vi.fn(async () => [makeShotWithScene(1, 1)])
    dependencies.jobApi.getJobStatus = vi.fn(async () => ({
      ...makeJob(88, 'FAILED', 'BATCH_GEN_VIDEO'),
      errorMessage: '视频上游拒绝请求',
    }))
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().fetchShots()
    await store.getState().batchGenerateVideos({ countPerItem: 1, mode: 'ALL', targetIds: [1] })
    expect(store.getState().shots[0].video.status).toBe('GENERATING')

    await store.getState().pollActiveJobs()

    expect(store.getState().activeJobs).toHaveLength(0)
    expect(store.getState().shots[0].video.status).toBe('FAILED')
    expect(dependencies.notifier.error).toHaveBeenCalledWith('视频上游拒绝请求')
  })

  it('refuses to submit video generation when a target shot lacks the scene asset', async () => {
    const dependencies = createDependencies()
    dependencies.generationApi.generateVideosBatch = vi.fn(async () => response)
    dependencies.shotApi.getProjectShots = vi.fn(async () => [makeShot(1, 1)])
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().fetchShots()
    await expect(
      store.getState().batchGenerateVideos({ countPerItem: 1, mode: 'ALL', targetIds: [1] }),
    ).rejects.toThrowError('分镜 #1 缺少场景画像资产，禁止生成视频')

    expect(dependencies.generationApi.generateVideosBatch).not.toHaveBeenCalled()
    expect(dependencies.notifier.error).toHaveBeenCalledWith('分镜 #1 缺少场景画像资产，禁止生成视频')
    expect(store.getState().shots[0].video.status).toBe('NONE')
  })

  it('keeps a job active when its status check throws transiently', async () => {
    const dependencies = createDependencies()
    dependencies.jobApi.getJobStatus = vi.fn(async () => {
      throw new Error('network blip')
    })
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().batchGenerateShots({ countPerItem: 1, mode: 'ALL', targetIds: [1] })
    const callsAfterSubmit = (dependencies.shotApi.getProjectShots as ReturnType<typeof vi.fn>).mock
      .calls.length
    await store.getState().pollActiveJobs()

    expect(store.getState().activeJobs).toHaveLength(1)
    expect(dependencies.shotApi.getProjectShots).toHaveBeenCalledTimes(callsAfterSubmit)
  })

  it('retries a completed job when the terminal asset refresh fails transiently', async () => {
    const dependencies = createDependencies()
    dependencies.jobApi.getJobStatus = vi.fn(async () => makeJob(88, 'SUCCEEDED'))
    dependencies.shotApi.getProjectShots = vi.fn(async () => {
      throw new Error('refresh failed')
    })
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().batchGenerateShots({ countPerItem: 1, mode: 'ALL', targetIds: [1] })
    await store.getState().pollActiveJobs()

    expect(store.getState().activeJobs).toHaveLength(1)
  })

  it('resumes all generation jobs that are still running after a reload', async () => {
    const dependencies = createDependencies()
    dependencies.jobApi.getUserJobs = vi.fn(async ({ status }) => {
      if (status === 'RUNNING') {
        return {
          ...emptyPage<JobVO>(),
          records: [
            makeJob(101, 'RUNNING', 'BATCH_GEN_VIDEO', { targetIds: [1] }),
            makeJob(102, 'RUNNING', 'BATCH_GEN_CHAR_IMG', { targetIds: [2, 3] }),
            makeJob(105, 'RUNNING', 'BATCH_GEN_SCENE_IMG', { targetIds: [5] }),
            makeJob(106, 'RUNNING', 'BATCH_GEN_PROP_IMG', { targetIds: [6] }),
            makeJob(104, 'RUNNING', 'VIDEO_GENERATION'),
          ],
        }
      }
      return {
        ...emptyPage<JobVO>(),
        records: [makeJob(103, 'PENDING', 'BATCH_GEN_SHOT_IMG', { targetIds: [4] })],
      }
    })
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().resumeActiveJobs()

    const active = store.getState().activeJobs
    expect(active.map((job) => job.jobId).sort()).toEqual([101, 102, 103, 105, 106])
    expect(active.find((job) => job.jobId === 101)?.kind).toBe('video')
    expect(active.find((job) => job.jobId === 102)?.kind).toBe('character')
    expect(active.find((job) => job.jobId === 103)?.kind).toBe('shot-image')
    expect(active.find((job) => job.jobId === 105)?.kind).toBe('scene')
    expect(active.find((job) => job.jobId === 106)?.kind).toBe('prop')
    expect(active.find((job) => job.jobId === 102)?.targetIds).toEqual([2, 3])
    expect(active.find((job) => job.jobId === 103)?.targetIds).toEqual([4])
  })

  it.each(['character', 'scene', 'prop'] as const)(
    'refreshes %s assets and shots when an asset generation job completes',
    async (kind) => {
      const dependencies = createDependencies()
      const jobType = {
        character: 'BATCH_GEN_CHAR_IMG',
        prop: 'BATCH_GEN_PROP_IMG',
        scene: 'BATCH_GEN_SCENE_IMG',
      }[kind]
      dependencies.jobApi.getJobStatus = vi.fn(async () =>
        makeJob(201, 'SUCCEEDED', jobType),
      )
      dependencies.characterApi.getProjectCharacters = vi.fn(async () => [])
      dependencies.sceneApi.getProjectScenes = vi.fn(async () => [])
      dependencies.propApi.getProjectProps = vi.fn(async () => [])
      dependencies.shotApi.getProjectShots = vi.fn(async () => [makeShot(1, 1)])
      const store = createEditorStore(dependencies, {
        activeJobs: [{ jobId: 201, kind: kind as ActiveGenerationJobKind, targetIds: [9] }],
        projectId: 7,
      })

      await store.getState().pollActiveJobs()

      if (kind === 'character') {
        expect(dependencies.characterApi.getProjectCharacters).toHaveBeenCalledWith(7)
      } else if (kind === 'scene') {
        expect(dependencies.sceneApi.getProjectScenes).toHaveBeenCalledWith(7)
      } else {
        expect(dependencies.propApi.getProjectProps).toHaveBeenCalledWith(7)
      }
      expect(dependencies.shotApi.getProjectShots).toHaveBeenCalledWith(7)
      expect(store.getState().activeJobs).toHaveLength(0)
    },
  )

  it('preserves character/scene/prop array identity across refetches with unchanged data', async () => {
    const dependencies = createDependencies()
    dependencies.characterApi.getProjectCharacters = vi.fn(async () => [
      { id: 1, name: '小花' } as never,
    ])
    dependencies.sceneApi.getProjectScenes = vi.fn(async () => [{ id: 5 } as never])
    dependencies.propApi.getProjectProps = vi.fn(async () => [{ id: 9 } as never])
    const store = createEditorStore(dependencies, { projectId: 7 })

    await store.getState().fetchCharacters()
    await store.getState().fetchScenes()
    await store.getState().fetchProps()
    const first = store.getState()
    await store.getState().fetchCharacters()
    await store.getState().fetchScenes()
    await store.getState().fetchProps()
    const second = store.getState()

    expect(second.characters).toBe(first.characters)
    expect(second.scenes).toBe(first.scenes)
    expect(second.props).toBe(first.props)
  })

  it('keeps shot-specific and general local image history isolated, merged and deduplicated', () => {
    const store = createEditorStore({}, { projectId: 7 })
    const older = {
      createdAt: '2026-06-27T00:00:00Z',
      id: 1,
      prompt: null,
      url: 'https://example.com/shared.png',
      versionNo: 1,
    }
    const newer = {
      createdAt: '2026-06-28T00:00:00Z',
      id: 2,
      prompt: 'close-up',
      url: 'https://example.com/shot.png',
      versionNo: 2,
    }

    store.getState().addLocalImageHistory('character', 5, older)
    store.getState().addLocalImageHistory('character', 5, older, 11)
    store.getState().addLocalImageHistory('character', 5, newer, 11)

    expect(store.getState().getLocalImageHistory('character', 5, 11)).toEqual([newer, older])

    store.getState().deleteLocalImageHistory('character', 5, newer.id, 11)
    expect(store.getState().getLocalImageHistory('character', 5, 11)).toEqual([older])
  })
})

it('discards an old project asset response after switching the editor project', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof characterApi.getProjectCharacters>>) => void
  const store = createEditorStore({ characterApi: { ...characterApi, getProjectCharacters: vi.fn(() => new Promise<Awaited<ReturnType<typeof characterApi.getProjectCharacters>>>((done) => { resolve = done })) } }, { projectId: 1 })
  const pending = store.getState().fetchCharacters()
  store.setState({ projectId: 2 })
  resolve([{ id: 77 } as Awaited<ReturnType<typeof characterApi.getProjectCharacters>>[number]])
  await pending
  expect(store.getState().characters).toEqual([])
})

it('discards an old account asset response even when project id matches', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof characterApi.getProjectCharacters>>) => void
  const store = createEditorStore({ characterApi: { ...characterApi, getProjectCharacters: vi.fn(() => new Promise<Awaited<ReturnType<typeof characterApi.getProjectCharacters>>>((done) => { resolve = done })) } }, { projectId: 1 })
  const pending = store.getState().fetchCharacters()
  const identity = useUserStore.getState()
  useUserStore.setState({ userId: 99, token: 'different-session' })
  resolve([{ id: 88 } as Awaited<ReturnType<typeof characterApi.getProjectCharacters>>[number]])
  await pending
  expect(store.getState().characters).toEqual([])
  useUserStore.setState({ userId: identity.userId, token: identity.token })
})
