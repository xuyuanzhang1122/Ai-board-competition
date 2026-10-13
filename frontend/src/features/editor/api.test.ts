import { beforeEach, describe, expect, it, vi } from 'vitest'

import { homeApi } from '@/features/home/api'

import {
  characterApi,
  exportApi,
  generationApi,
  importApi,
  jobApi,
  propApi,
  sceneApi,
  shotApi,
  textGenerationApi,
} from './api'

const apiMocks = vi.hoisted(() => ({
  defaults: { baseURL: '/api' },
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({ default: apiMocks }))

describe('editor API adapters', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preserves shot CRUD payloads and parse timeout/signal', async () => {
    const signal = new AbortController().signal

    await shotApi.createShot(7, '开场')
    await shotApi.deleteShotAsset(7, 3, 'shot-image')
    await shotApi.reorderShots(7, [3, 1, 2])
    await shotApi.parseAndCreateShots(7, '完整剧本', signal)

    expect(apiMocks.post).toHaveBeenNthCalledWith(1, '/projects/7/shots', { scriptText: '开场' })
    expect(apiMocks.delete).toHaveBeenCalledWith('/projects/7/shots/3/assets/shot-image')
    expect(apiMocks.put).toHaveBeenCalledWith('/projects/7/shots/reorder', { shotIds: [3, 1, 2] })
    expect(apiMocks.post).toHaveBeenNthCalledWith(
      2,
      '/projects/7/shots/parse-script',
      { fullScript: '完整剧本' },
      { signal, timeout: 120_000 },
    )
  })

  it('forwards plain text generation with optional temperature and topP', async () => {
    await textGenerationApi.generateText('描述角色', 5, { temperature: 0.7, topP: 0.9 })

    expect(apiMocks.post).toHaveBeenCalledWith(
      '/generate/text',
      { prompt: '描述角色', temperature: 0.7, topP: 0.9, projectId: 5 },
      { timeout: 120_000 },
    )
  })

  it('keeps single-generation query and video body contracts', async () => {
    await generationApi.generateSingleShot(4, 9, {
      aspectRatio: '16:9',
      customPrompt: '电影感',
      model: 'image-v1',
      referenceImageUrl: 'https://example.com/ref.png',
    })
    await generationApi.generateSingleVideo(4, 9, { aspectRatio: '16:9', model: 'video-v1' })

    expect(apiMocks.post).toHaveBeenNthCalledWith(
      1,
      '/projects/4/generate/shot/9?aspectRatio=16%3A9&model=image-v1&customPrompt=%E7%94%B5%E5%BD%B1%E6%84%9F&referenceImageUrl=https%3A%2F%2Fexample.com%2Fref.png',
    )
    expect(apiMocks.post).toHaveBeenNthCalledWith(2, '/projects/4/generate/video/9', {
      aspectRatio: '16:9',
      model: 'video-v1',
    })
  })

  it('keeps library category endpoint differences across asset types', async () => {
    await characterApi.createCategory({ name: '主角' })
    await sceneApi.createCategory({ name: '室内' })
    await propApi.createCategory({ name: '武器' })

    expect(apiMocks.post).toHaveBeenNthCalledWith(1, '/character-categories', { name: '主角' })
    expect(apiMocks.post).toHaveBeenNthCalledWith(2, '/scene-categories', { name: '室内' })
    expect(apiMocks.post).toHaveBeenNthCalledWith(3, '/library/props/categories', {
      name: '武器',
    })
  })

  it('maps single scene and prop reads to the item endpoints', async () => {
    await sceneApi.getScene(14, 219)
    await propApi.getProp(14, 253)

    expect(apiMocks.get).toHaveBeenNthCalledWith(1, '/projects/14/scenes/219')
    expect(apiMocks.get).toHaveBeenNthCalledWith(2, '/projects/14/props/253')
  })

  it('passes an optional category filter without changing the response promise', async () => {
    const expected = [{ id: 1 }]
    apiMocks.get.mockResolvedValueOnce(expected)

    await expect(characterApi.getLibraryCharacters(8)).resolves.toBe(expected)
    expect(apiMocks.get).toHaveBeenCalledWith('/library/characters', {
      params: { categoryId: 8 },
    })
  })

  it('builds storyboard import multipart data and keeps the five-minute timeout', async () => {
    const workbook = new File(['sheet'], 'storyboard.xlsx')
    const image = new File(['image'], 'hero.png')

    await importApi.importStoryboardExcel(5, workbook, [image])

    const [, formData, config] = apiMocks.post.mock.calls[0]
    expect(apiMocks.post.mock.calls[0][0]).toBe('/projects/5/import/excel')
    expect(formData).toBeInstanceOf(FormData)
    expect((formData as FormData).get('file')).toBe(workbook)
    expect((formData as FormData).getAll('assetFiles')).toEqual([image])
    expect(config).toEqual({
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300_000,
    })
  })

  it('maps job and export requests to their legacy endpoints', async () => {
    const request = {
      exportCharacters: true,
      exportScenes: true,
      exportShotImages: true,
      exportVideos: false,
      mode: 'ALL' as const,
    }

    await jobApi.getJobStatus(12)
    await jobApi.getUserJobs({ page: 1, projectId: 3, size: 100 })
    await exportApi.submitExportTask(3, request)

    expect(apiMocks.get).toHaveBeenCalledWith('/jobs/12')
    expect(apiMocks.get).toHaveBeenCalledWith('/jobs', {
      params: { page: 1, projectId: 3, size: 100 },
    })
    expect(apiMocks.post).toHaveBeenCalledWith('/projects/3/export', request)
  })

  it('keeps project detail and update on the shared home API fact source', async () => {
    await homeApi.getProject(6)
    await homeApi.updateProject(6, { name: '新片名' })

    expect(apiMocks.get).toHaveBeenCalledWith('/projects/6')
    expect(apiMocks.put).toHaveBeenCalledWith('/projects/6', { name: '新片名' })
  })

  it('does not swallow errors from the shared client', async () => {
    const failure = new Error('network down')
    apiMocks.delete.mockRejectedValueOnce(failure)

    await expect(shotApi.deleteShot(1, 2)).rejects.toBe(failure)
  })
})
