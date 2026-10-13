import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { JobVO, StoryboardShotVO } from '@/shared/types/api'

import { jobApi } from '../../api'
import {
  buildExportRequest,
  buildScriptContent,
  collectReadyAssets,
  createInitialExportFormState,
  downloadAssetsSequentially,
  type DownloadEnvironment,
  downloadScriptFile,
  exportFormReducer,
  extractExtension,
  hasExportSelection,
  pollExportJob,
} from './export-state'

vi.mock('../../api', () => ({
  exportApi: {
    downloadExportFile: vi.fn(),
    getDownloadUrl: vi.fn(),
    submitExportTask: vi.fn(),
  },
  jobApi: {
    getJobStatus: vi.fn(),
  },
}))

const reduce = (
  state: ReturnType<typeof createInitialExportFormState>,
  ...actions: Parameters<typeof exportFormReducer>[1][]
) => actions.reduce(exportFormReducer, state)

const shot = (
  id: number,
  overrides?: Partial<StoryboardShotVO>,
): StoryboardShotVO => ({
  characters: [],
  createdAt: '2026-06-28T00:00:00Z',
  id,
  props: [],
  scene: null,
  scriptText: `script-${id}`,
  shotImage: {
    assetId: null,
    currentUrl: null,
    currentVersionId: null,
    status: 'NONE',
    totalVersions: 0,
  },
  shotNo: id,
  updatedAt: '2026-06-28T00:00:00Z',
  video: {
    assetId: null,
    currentUrl: null,
    currentVersionId: null,
    status: 'NONE',
    totalVersions: 0,
  },
  ...overrides,
})

const readyImageShot = (id: number): StoryboardShotVO =>
  shot(id, {
    shotImage: {
      assetId: 1,
      currentUrl: 'https://oss.example.com/shot.jpg?x=1',
      currentVersionId: 1,
      status: 'READY',
      totalVersions: 1,
    },
  })

const readyVideoShot = (id: number): StoryboardShotVO =>
  shot(id, {
    video: {
      assetId: 2,
      currentUrl: 'https://oss.example.com/shot.mp4',
      currentVersionId: 1,
      status: 'READY',
      totalVersions: 1,
    },
  })

describe('export form state', () => {
  it('toggles content selections', () => {
    const state = reduce(createInitialExportFormState(), { field: 'exportVideos', type: 'toggle' })
    expect(state.exportVideos).toBe(false)
    expect(state.exportCharacters).toBe(true)
  })

  it('switches version mode', () => {
    const state = reduce(createInitialExportFormState(), { mode: 'ALL', type: 'set-mode' })
    expect(state.mode).toBe('ALL')
  })

  it('resets to defaults', () => {
    const state = reduce(
      createInitialExportFormState(),
      { field: 'exportCharacters', type: 'toggle' },
      { mode: 'ALL', type: 'set-mode' },
      { type: 'reset' },
    )
    expect(state).toEqual(createInitialExportFormState())
  })

  it('detects whether any content is selected', () => {
    expect(hasExportSelection(createInitialExportFormState())).toBe(true)
    expect(
      hasExportSelection(
        reduce(
          createInitialExportFormState(),
          { field: 'exportCharacters', type: 'toggle' },
          { field: 'exportScenes', type: 'toggle' },
          { field: 'exportShotImages', type: 'toggle' },
          { field: 'exportVideos', type: 'toggle' },
        ),
      ),
    ).toBe(false)
  })

  it('builds a backend-compatible ExportRequest payload', () => {
    const state = reduce(
      createInitialExportFormState(),
      { field: 'exportCharacters', type: 'toggle' },
      { field: 'exportVideos', type: 'toggle' },
      { mode: 'ALL', type: 'set-mode' },
    )
    expect(buildExportRequest(state)).toEqual({
      exportCharacters: false,
      exportScenes: true,
      exportShotImages: true,
      exportVideos: false,
      mode: 'ALL',
    })
  })
})

describe('asset download helpers', () => {
  it('collects only READY assets and preserves shotNo in filename', () => {
    const shots = [
      readyImageShot(1),
      readyVideoShot(2),
      shot(3, {
        shotImage: {
          assetId: 3,
          currentUrl: 'https://oss.example.com/fail.png',
          currentVersionId: 1,
          status: 'FAILED',
          totalVersions: 0,
        },
      }),
    ]
    const assets = collectReadyAssets(shots)
    expect(assets).toHaveLength(2)
    expect(assets[0]).toMatchObject({
      filename: '分镜1_图片.jpg',
      type: '分镜图',
      url: 'https://oss.example.com/shot.jpg?x=1',
    })
    expect(assets[1]).toMatchObject({
      filename: '分镜2_视频.mp4',
      type: '视频',
      url: 'https://oss.example.com/shot.mp4',
    })
  })

  it('filters assets by selected shot ids', () => {
    const shots = [readyImageShot(1), readyImageShot(2), readyImageShot(3)]
    const assets = collectReadyAssets(shots, { shotIds: new Set([1, 3]) })
    expect(assets).toHaveLength(2)
    expect(assets.map((a) => a.filename)).toEqual(['分镜1_图片.jpg', '分镜3_图片.jpg'])
  })

  it('extracts extension from URL pathname, falling back by type', () => {
    expect(extractExtension('https://oss.example.com/img.PNG?token=abc', 'jpg')).toBe('PNG')
    expect(extractExtension('https://oss.example.com/video', 'mp4')).toBe('mp4')
    expect(extractExtension('not-a-url', 'jpg')).toBe('jpg')
  })

  it('downloads assets sequentially and revokes object URLs', async () => {
    const revoked: string[] = []
    const env: DownloadEnvironment = {
      clickDownloadLink: vi.fn(),
      createObjectURL: vi.fn(() => 'blob:1'),
      fetchBlob: vi.fn().mockResolvedValue(new Blob(['x'])),
      revokeObjectURL: vi.fn((url) => revoked.push(url)),
    }

    const items = [
      { filename: 'a.jpg', type: '分镜图', url: 'https://example.com/a.jpg' },
      { filename: 'b.mp4', type: '视频', url: 'https://example.com/b.mp4' },
    ]
    const result = await downloadAssetsSequentially(items, env, { delayMs: 0 })

    expect(result).toEqual({ success: 2, fail: 0 })
    expect(env.fetchBlob).toHaveBeenCalledTimes(2)
    expect(env.createObjectURL).toHaveBeenCalledTimes(2)
    expect(env.clickDownloadLink).toHaveBeenCalledTimes(2)
    expect(revoked).toEqual(['blob:1', 'blob:1'])
  })

  it('falls back to direct link when fetch fails and still counts success', async () => {
    const env: DownloadEnvironment = {
      clickDownloadLink: vi.fn(),
      createObjectURL: vi.fn(),
      fetchBlob: vi.fn().mockRejectedValue(new Error('CORS')),
      revokeObjectURL: vi.fn(),
    }

    const result = await downloadAssetsSequentially(
      [{ filename: 'a.jpg', type: '分镜图', url: 'https://example.com/a.jpg' }],
      env,
      { delayMs: 0 },
    )

    expect(result).toEqual({ success: 1, fail: 0 })
    expect(env.fetchBlob).toHaveBeenCalledTimes(1)
    expect(env.createObjectURL).not.toHaveBeenCalled()
    expect(env.clickDownloadLink).toHaveBeenCalledWith('https://example.com/a.jpg', 'a.jpg')
  })
})

describe('script export', () => {
  it('builds script content with project name, shots, characters and scene', () => {
    const shots: StoryboardShotVO[] = [
      shot(1, {
        characters: [
          { bindingId: 1, characterId: 1, characterName: 'Alice', thumbnailUrl: null },
        ],
        scene: { bindingId: 2, sceneId: 1, sceneName: '森林', thumbnailUrl: null },
        scriptText: ' Alice 走进森林。',
      }),
      shot(2, { scriptText: ' Bob 出场。' }),
    ]
    const content = buildScriptContent(shots, '测试项目')
    expect(content).toContain('项目名称：测试项目')
    expect(content).toContain('【分镜 #1】')
    expect(content).toContain('角色：Alice')
    expect(content).toContain('场景：森林')
    expect(content).toContain('【分镜 #2】')
  })

  it('revokes script object URL after download', () => {
    const revoked: string[] = []
    const env = {
      clickDownloadLink: vi.fn(),
      createObjectURL: vi.fn(() => 'blob:script'),
      revokeObjectURL: vi.fn((url: string) => revoked.push(url)),
    }
    downloadScriptFile('hello', 'script.txt', env)
    expect(env.createObjectURL).toHaveBeenCalledTimes(1)
    expect(env.clickDownloadLink).toHaveBeenCalledWith('blob:script', 'script.txt')
    expect(revoked).toEqual(['blob:script'])
  })
})

describe('export job polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  const mockJob = (status: JobVO['status'], overrides?: Partial<JobVO>): JobVO => ({
    allImageUrls: null,
    costPoints: null,
    createdAt: '2026-06-28T00:00:00Z',
    doneItems: 0,
    errorMessage: null,
    id: 42,
    jobType: 'EXPORT_ZIP',
    progress: 0,
    resultUrl: null,
    status,
    totalItems: 10,
    ...overrides,
  })

  it('resolves when job succeeds', async () => {
    const getJobStatus = vi.mocked(jobApi.getJobStatus)
    getJobStatus
      .mockResolvedValueOnce(mockJob('RUNNING', { progress: 50 }))
      .mockResolvedValueOnce(mockJob('SUCCEEDED', { progress: 100, doneItems: 10 }))

    const onProgress = vi.fn()
    const controller = new AbortController()
    const promise = pollExportJob(42, onProgress, controller.signal, 1000)
    await vi.advanceTimersByTimeAsync(2500)

    const finalJob = await promise
    expect(finalJob.status).toBe('SUCCEEDED')
    expect(onProgress).toHaveBeenCalledTimes(2)
  })

  it('rejects when job fails', async () => {
    const getJobStatus = vi.mocked(jobApi.getJobStatus)
    getJobStatus.mockResolvedValue(mockJob('FAILED', { errorMessage: '打包超时' }))

    const controller = new AbortController()
    const promise = pollExportJob(42, () => {}, controller.signal, 1000)
    const assertion = expect(promise).rejects.toThrow('打包超时')
    await vi.advanceTimersByTimeAsync(1000)

    await assertion
  })

  it('stops polling when aborted', async () => {
    const getJobStatus = vi.mocked(jobApi.getJobStatus)
    getJobStatus.mockResolvedValue(mockJob('RUNNING'))

    const controller = new AbortController()
    const promise = pollExportJob(42, () => {}, controller.signal, 1000)
    const assertion = expect(promise).rejects.toThrow('已取消')
    controller.abort()
    await vi.advanceTimersByTimeAsync(1000)

    await assertion
    expect(getJobStatus).not.toHaveBeenCalled()
  })
})
