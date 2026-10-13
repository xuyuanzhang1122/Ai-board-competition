import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type LocalUploadDeps, runLocalImageUpload } from './asset-local-upload'
import type { AssetGenerationDeps, AssetGenerationInput } from './useAssetGeneration'
import { DEFAULT_MODELS, runAssetGeneration } from './useAssetGeneration'
import { runSelectImage, type ThumbnailMutationDeps } from './useAssetThumbnailMutation'

const apiMocks = vi.hoisted(() => ({
  defaults: { baseURL: '/api' },
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({ default: apiMocks }))

const createGenerationDeps = (overrides?: Partial<AssetGenerationDeps>): AssetGenerationDeps =>
  ({
    addLocalImageHistory: vi.fn(),
    characterApi: {
      createCharacter: vi.fn().mockResolvedValue({ id: 101 }),
      createLibraryCharacter: vi.fn().mockResolvedValue({ id: 201 }),
      updateCharacter: vi.fn().mockResolvedValue({ id: 1 }),
    },
    fetchCharacters: vi.fn().mockResolvedValue(undefined),
    fetchProps: vi.fn().mockResolvedValue(undefined),
    fetchScenes: vi.fn().mockResolvedValue(undefined),
    fetchShots: vi.fn().mockResolvedValue(undefined),
    generationApi: {
      generateSingleCharacter: vi.fn().mockResolvedValue({ jobId: 123 }),
      generateSingleProp: vi.fn().mockResolvedValue({ jobId: 123 }),
      generateSingleScene: vi.fn().mockResolvedValue({ jobId: 123 }),
    },
    getCharacter: vi.fn().mockResolvedValue({ thumbnailUrl: 'https://example.com/fallback.png' }),
    getLocalImageHistory: vi.fn().mockReturnValue([]),
    getProp: vi.fn().mockResolvedValue({ thumbnailUrl: 'https://example.com/fallback.png' }),
    getScene: vi.fn().mockResolvedValue({ thumbnailUrl: 'https://example.com/fallback.png' }),
    jobApi: { getJobStatus: vi.fn() },
    notifier: {
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    propApi: {
      addPropToProject: vi.fn().mockResolvedValue({ id: 103 }),
      createLibraryProp: vi.fn().mockResolvedValue({ id: 203 }),
      updateProp: vi.fn().mockResolvedValue({ id: 3 }),
    },
    registerGenerationJob: vi.fn(),
    sceneApi: {
      createLibraryScene: vi.fn().mockResolvedValue({ id: 202 }),
      createScene: vi.fn().mockResolvedValue({ id: 102 }),
      updateScene: vi.fn().mockResolvedValue({ id: 2 }),
    },
    shotApi: { createBinding: vi.fn().mockResolvedValue(undefined) },
    sleep: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as AssetGenerationDeps

const baseInput: AssetGenerationInput = {
  aiDescription: '黑色短发侦探',
  aspectRatio: '1:1',
  assetId: 1,
  assetName: '林默',
  assetType: 'character',
  projectId: 10,
}

describe('useAssetGeneration polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the first image and writes all urls to local history when job SUCCEEDED', async () => {
    const deps = createGenerationDeps()
    deps.jobApi.getJobStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: 'PENDING' })
      .mockResolvedValueOnce({ status: 'RUNNING' })
      .mockResolvedValue({
        allImageUrls: ['https://example.com/1.png', 'https://example.com/2.png'],
        status: 'SUCCEEDED',
      })

    const result = await runAssetGeneration(baseInput, deps)

    expect(result.generatedImageUrl).toBe('https://example.com/1.png')
    expect(result.historyRecordsAdded).toBe(2)
    expect(result.error).toBeNull()
    expect(deps.jobApi.getJobStatus).toHaveBeenCalledTimes(3)
    expect(deps.notifier.success).toHaveBeenCalledWith('图片生成成功!')

    const addHistory = deps.addLocalImageHistory as ReturnType<typeof vi.fn>
    expect(addHistory).toHaveBeenCalledTimes(2)
    expect(addHistory).toHaveBeenNthCalledWith(
      1,
      'character',
      1,
      expect.objectContaining({
        groupIndex: 0,
        prompt: '黑色短发侦探',
        url: 'https://example.com/1.png',
      }),
      undefined,
    )
    expect(addHistory).toHaveBeenNthCalledWith(
      2,
      'character',
      1,
      expect.objectContaining({
        groupIndex: 1,
        prompt: '黑色短发侦探',
        url: 'https://example.com/2.png',
      }),
      undefined,
    )
  })

  it('returns an error when the job FAILED', async () => {
    const deps = createGenerationDeps()
    deps.jobApi.getJobStatus = vi.fn().mockResolvedValue({
      errorMessage: '模型调用失败',
      status: 'FAILED',
    })

    const result = await runAssetGeneration(baseInput, deps)

    expect(result.generatedImageUrl).toBeNull()
    expect(result.error?.message).toBe('模型调用失败')
    expect(deps.notifier.error).toHaveBeenCalledWith('模型调用失败')
  })

  it('returns a timeout error when the job never completes', async () => {
    const deps = createGenerationDeps()
    deps.jobApi.getJobStatus = vi.fn().mockResolvedValue({ status: 'PENDING' })

    const result = await runAssetGeneration(baseInput, deps)

    expect(result.generatedImageUrl).toBeNull()
    expect(result.error?.message).toContain('超时')
    expect(deps.notifier.warning).toHaveBeenCalledWith('生成超时，请稍后刷新查看')
  })
})

describe('useAssetGeneration asset types', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes local history for character generation', async () => {
    const deps = createGenerationDeps()
    deps.jobApi.getJobStatus = vi.fn().mockResolvedValue({
      allImageUrls: ['https://example.com/char.png'],
      status: 'SUCCEEDED',
    })

    await runAssetGeneration({ ...baseInput, assetType: 'character' }, deps)

    expect(deps.generationApi.generateSingleCharacter).toHaveBeenCalledWith(
      10,
      1,
      expect.objectContaining({ aspectRatio: '1:1', model: DEFAULT_MODELS.character }),
    )
    expect(deps.addLocalImageHistory).toHaveBeenCalledWith(
      'character',
      1,
      expect.objectContaining({ prompt: '黑色短发侦探', url: 'https://example.com/char.png' }),
      undefined,
    )
    expect(deps.registerGenerationJob).toHaveBeenCalledWith(123, 'character', [1])
  })

  it('writes local history for scene generation', async () => {
    const deps = createGenerationDeps()
    deps.jobApi.getJobStatus = vi.fn().mockResolvedValue({
      allImageUrls: ['https://example.com/scene.png'],
      status: 'SUCCEEDED',
    })

    await runAssetGeneration({ ...baseInput, assetId: 2, assetName: '车站', assetType: 'scene' }, deps)

    expect(deps.generationApi.generateSingleScene).toHaveBeenCalledWith(
      10,
      2,
      expect.objectContaining({ aspectRatio: '1:1', model: DEFAULT_MODELS.scene }),
    )
    expect(deps.addLocalImageHistory).toHaveBeenCalledWith(
      'scene',
      2,
      expect.objectContaining({ prompt: '黑色短发侦探', url: 'https://example.com/scene.png' }),
      undefined,
    )
    expect(deps.registerGenerationJob).toHaveBeenCalledWith(123, 'scene', [2])
  })

  it('writes local history for prop generation', async () => {
    const deps = createGenerationDeps()
    deps.jobApi.getJobStatus = vi.fn().mockResolvedValue({
      allImageUrls: ['https://example.com/prop.png'],
      status: 'SUCCEEDED',
    })

    await runAssetGeneration({ ...baseInput, assetId: 3, assetName: '怀表', assetType: 'prop' }, deps)

    expect(deps.generationApi.generateSingleProp).toHaveBeenCalledWith(
      10,
      3,
      expect.objectContaining({ aspectRatio: '1:1', model: DEFAULT_MODELS.prop }),
    )
    expect(deps.addLocalImageHistory).toHaveBeenCalledWith(
      'prop',
      3,
      expect.objectContaining({ prompt: '黑色短发侦探', url: 'https://example.com/prop.png' }),
      undefined,
    )
    expect(deps.registerGenerationJob).toHaveBeenCalledWith(123, 'prop', [3])
  })

  it('allows an empty prop description and uses the prop name in local history', async () => {
    const deps = createGenerationDeps()
    deps.jobApi.getJobStatus = vi.fn().mockResolvedValue({
      allImageUrls: ['https://example.com/prop.png'],
      status: 'SUCCEEDED',
    })

    await runAssetGeneration(
      { ...baseInput, aiDescription: '', assetId: 3, assetName: '玉佩', assetType: 'prop' },
      deps,
    )

    expect(deps.propApi.updateProp).toHaveBeenCalledWith(10, 3, {
      displayName: '玉佩',
      overrideDescription: '',
    })
    expect(deps.generationApi.generateSingleProp).toHaveBeenCalled()
    expect(deps.addLocalImageHistory).toHaveBeenCalledWith(
      'prop',
      3,
      expect.objectContaining({ prompt: '玉佩' }),
      undefined,
    )
  })
})

describe('useAssetGeneration failure handling', () => {
  it('sets error and stops generating when the API call fails', async () => {
    const deps = createGenerationDeps()
    deps.generationApi.generateSingleCharacter = vi
      .fn()
      .mockRejectedValue(new Error('网络错误'))

    await expect(runAssetGeneration(baseInput, deps)).rejects.toThrow('网络错误')
  })
})

describe('useAssetGeneration abort on assetId change', () => {
  it('stops polling and returns no url when aborted', async () => {
    const deps = createGenerationDeps()
    deps.jobApi.getJobStatus = vi.fn().mockResolvedValue({ status: 'PENDING' })
    const controller = new AbortController()
    controller.abort()

    const result = await runAssetGeneration(baseInput, deps, { signal: controller.signal })

    expect(result.generatedImageUrl).toBeNull()
    expect(result.historyRecordsAdded).toBe(0)
    expect(deps.jobApi.getJobStatus).not.toHaveBeenCalled()
  })
})

describe('useAssetThumbnailMutation blob URL path', () => {
  it('skips server update for blob URLs and notifies locally', async () => {
    const deps: ThumbnailMutationDeps = {
      api: { put: vi.fn() },
      characterApi: {
        createLibraryCharacter: vi.fn(),
        getCharacter: vi.fn(),
        updateLibraryCharacter: vi.fn(),
      },
      fetchCharacters: vi.fn().mockResolvedValue(undefined),
      fetchProps: vi.fn().mockResolvedValue(undefined),
      fetchScenes: vi.fn().mockResolvedValue(undefined),
      fetchShots: vi.fn().mockResolvedValue(undefined),
      notifier: {
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
      },
      propApi: {
        createLibraryProp: vi.fn(),
        getProp: vi.fn(),
        updateLibraryProp: vi.fn(),
      },
      sceneApi: {
        createLibraryScene: vi.fn(),
        getScene: vi.fn(),
        updateLibraryScene: vi.fn(),
      },
    }

    await runSelectImage(
      { assetId: 1, assetType: 'character', projectId: 10 },
      'blob:mock-url',
      {},
      deps,
    )

    expect(deps.notifier.success).toHaveBeenCalledWith('已选择本地图片')
    expect(deps.api.put).not.toHaveBeenCalled()
    expect(deps.characterApi.getCharacter).not.toHaveBeenCalled()
  })
})

describe('AssetLocalTab URL.revokeObjectURL', () => {
  it('revokes the blob URL after upload', async () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')

    const deps: LocalUploadDeps = {
      addLocalImageHistory: vi.fn(),
      api: { put: vi.fn().mockResolvedValue(undefined) },
      characterApi: {
        createCharacter: vi.fn().mockResolvedValue({ id: 1 }),
        createLibraryCharacter: vi.fn().mockResolvedValue({ id: 100 }),
        getCharacter: vi.fn().mockResolvedValue({
          description: '',
          displayName: '林默',
          libraryCharacterId: 100,
          thumbnailUrl: null,
        }),
        updateCharacter: vi.fn().mockResolvedValue({ id: 1 }),
        updateLibraryCharacter: vi.fn().mockResolvedValue(undefined),
      },
      fetchCharacters: vi.fn().mockResolvedValue(undefined),
      fetchProps: vi.fn().mockResolvedValue(undefined),
      fetchScenes: vi.fn().mockResolvedValue(undefined),
      fetchShots: vi.fn().mockResolvedValue(undefined),
      getLocalImageHistory: vi.fn().mockReturnValue([]),
      notifier: {
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
      },
      propApi: {
        addPropToProject: vi.fn(),
        createLibraryProp: vi.fn(),
        getProp: vi.fn(),
        updateLibraryProp: vi.fn(),
        updateProp: vi.fn(),
      },
      sceneApi: {
        createLibraryScene: vi.fn(),
        createScene: vi.fn(),
        getScene: vi.fn(),
        updateLibraryScene: vi.fn(),
        updateScene: vi.fn(),
      },
      shotApi: { createBinding: vi.fn() },
      uploadApi: { upload: vi.fn().mockResolvedValue({ url: 'https://example.com/upload.png' }) },
    }

    const file = new File([''], 'test.jpg', { type: 'image/jpeg' })

    await runLocalImageUpload(
      {
        aiDescription: '描述',
        assetId: 1,
        assetName: '林默',
        assetType: 'character',
        projectId: 10,
      },
      file,
      deps,
    )

    expect(createSpy).toHaveBeenCalledWith(file)
    expect(revokeSpy).toHaveBeenCalledWith('blob:local')

    createSpy.mockRestore()
    revokeSpy.mockRestore()
  })
})
