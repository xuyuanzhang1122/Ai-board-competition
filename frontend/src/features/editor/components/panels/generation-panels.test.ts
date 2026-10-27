import { describe, expect, it, vi } from 'vitest'

import type { JobVO, StoryboardShotVO } from '@/shared/types/api'

import {
  hydrateMissingJobUrls,
  type JobBackedHistoryItem,
  loadExpiringHistory,
} from './generation-helpers'
import {
  classifyGenerationJob,
  selectGenerationHistoryJobs,
} from './generation-history'
import { generateShotImages } from './shot-image-generation'
import {
  buildVideoGenerationRequest,
  getVideoSceneAssetError,
  mapVideoSizeToAspectRatio,
  VIDEO_DURATIONS,
  VIDEO_SCENE_ASSET_REQUIRED_MESSAGE,
} from './video-generation'

const shot: StoryboardShotVO = {
  characters: [
    {
      bindingId: 11,
      characterId: 21,
      characterName: '阿青',
      thumbnailUrl: 'https://cdn.test/character.png',
    },
  ],
  createdAt: '2026-06-28T08:00:00Z',
  id: 7,
  props: [
    {
      bindingId: 13,
      propId: 23,
      propName: '纸伞',
      thumbnailUrl: 'https://cdn.test/prop.png',
    },
  ],
  scene: {
    bindingId: 12,
    sceneId: 22,
    sceneName: '雨巷',
    thumbnailUrl: 'https://cdn.test/scene.png',
  },
  scriptText: '阿青撑伞走过雨巷。',
  shotImage: {
    assetId: 31,
    currentUrl: 'https://cdn.test/shot.png',
    currentVersionId: 41,
    status: 'READY',
    totalVersions: 1,
  },
  shotNo: 2,
  updatedAt: '2026-06-28T08:00:00Z',
  video: {
    assetId: null,
    currentUrl: null,
    currentVersionId: null,
    status: 'NONE',
    totalVersions: 0,
  },
}

const completedJob = (overrides: Partial<JobVO> = {}): JobVO => ({
  allImageUrls: ['https://cdn.test/generated.png'],
  costPoints: 2,
  createdAt: '2026-06-28T08:00:00Z',
  doneItems: 1,
  errorMessage: null,
  id: 101,
  jobType: 'GEN_SHOT_IMG',
  progress: 100,
  resultUrl: 'https://cdn.test/generated.png',
  status: 'SUCCEEDED',
  totalItems: 1,
  ...overrides,
})

describe('ShotImageGeneratePanel generation', () => {
  it('merges all bound assets and the uploaded reference into one generation reference', async () => {
    const mergeImages = vi.fn().mockResolvedValue({ mergedImageUrl: 'https://cdn.test/merged.png' })
    const generateSingleShot = vi.fn().mockResolvedValue({ jobId: 101 })

    const result = await generateShotImages(
      {
        additionalReferenceUrls: ['https://cdn.test/manual.png'],
        aspectRatio: '21:9',
        projectId: 3,
        quantity: 1,
        shot,
      },
      {
        generateSingleShot,
        getJobStatus: vi.fn().mockResolvedValue(completedJob()),
        mergeImages,
        sleep: async () => undefined,
      },
    )

    expect(mergeImages).toHaveBeenCalledWith([
      'https://cdn.test/manual.png',
      'https://cdn.test/character.png',
      'https://cdn.test/scene.png',
      'https://cdn.test/prop.png',
    ])
    expect(generateSingleShot).toHaveBeenCalledWith(
      3,
      7,
      expect.objectContaining({
        aspectRatio: '21:9',
        referenceImageUrl: 'https://cdn.test/merged.png',
      }),
    )
    expect(result[0]?.imageUrls).toEqual(['https://cdn.test/generated.png'])
    expect(generateSingleShot.mock.calls[0]?.[2]).not.toHaveProperty('customPrompt')
  })
})

describe('VideoGeneratePanel request mapping', () => {
  it('maps supported aspect ratios and exposes conservative Seedance duration tiers', () => {
    expect(mapVideoSizeToAspectRatio('1280x720')).toBe('16:9')
    expect(mapVideoSizeToAspectRatio('854x480')).toBe('16:9')
    expect(mapVideoSizeToAspectRatio('720x1280')).toBe('9:16')
    expect(mapVideoSizeToAspectRatio('480x854')).toBe('9:16')
    expect(mapVideoSizeToAspectRatio('1024x1024')).toBe('1:1')
    expect(VIDEO_DURATIONS).toEqual([5, 10, 15])
  })

  it('uses bound asset resources as multi-reference and the shot image as storyboard reference', () => {
    const request = buildVideoGenerationRequest(shot, {
      duration: 8,
      size: '720x1280',
    })

    expect(request.prompt).toBe(shot.scriptText)
    expect(request).toMatchObject({
      aspectRatio: '9:16',
      characters: [{ id: 21, thumbnailUrl: 'https://cdn.test/character.png' }],
      duration: 8,
      props: [{ id: 23, thumbnailUrl: 'https://cdn.test/prop.png' }],
      referenceImageUrl: 'https://cdn.test/shot.png',
      scene: { id: 22, thumbnailUrl: 'https://cdn.test/scene.png' },
      size: '720x1280',
    })
  })

  it('refuses to build a request when the mandatory scene asset image is missing', () => {
    const shotWithoutScene: StoryboardShotVO = { ...shot, scene: null }
    expect(() => buildVideoGenerationRequest(shotWithoutScene, { duration: 8, size: '720x1280' }))
      .toThrowError(VIDEO_SCENE_ASSET_REQUIRED_MESSAGE)
    expect(getVideoSceneAssetError(shotWithoutScene)).toBe(VIDEO_SCENE_ASSET_REQUIRED_MESSAGE)
    expect(getVideoSceneAssetError(shot)).toBeNull()
  })

  it('hydrates a missing local-history URL from its real job record', async () => {
    const pending: JobBackedHistoryItem = { expiresAt: Date.now() + 1000, id: 101, resultUrl: '' }
    const result = await hydrateMissingJobUrls(
      [pending],
      vi.fn().mockResolvedValue(completedJob({ resultUrl: 'https://cdn.test/video.mp4' })),
    )

    expect(result[0]?.resultUrl).toBe('https://cdn.test/video.mp4')
  })
})

describe('HistoryPanel real job data source selection', () => {
  it('keeps only current-project shot image/video jobs and supports type filtering', () => {
    const jobs = [
      completedJob({ id: 1, jobType: 'GEN_SHOT_IMG', projectId: 3 }),
      completedJob({ id: 2, jobType: 'GEN_VIDEO', projectId: 3 }),
      completedJob({ id: 3, jobType: 'GEN_CHAR_IMG', projectId: 3 }),
      completedJob({ id: 4, jobType: 'GEN_VIDEO', projectId: 4 }),
    ]

    expect(classifyGenerationJob('GEN_SHOT_IMG')).toBe('shot_image')
    expect(classifyGenerationJob('GEN_VIDEO')).toBe('video')
    expect(selectGenerationHistoryJobs(jobs, { filter: 'all', projectId: 3, sort: 'date' }).map((job) => job.id)).toEqual([1, 2])
    expect(selectGenerationHistoryJobs(jobs, { filter: 'video', projectId: 3, sort: 'date' }).map((job) => job.id)).toEqual([2])
  })

  it('drops expired local panel history while preserving active records', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify([
        { expiresAt: 99, id: 1 },
        { expiresAt: 101, id: 2 },
      ])),
      setItem: vi.fn(),
    }

    const result = loadExpiringHistory<{ expiresAt: number; id: number }>('history', {
      now: 100,
      storage,
    })

    expect(result).toEqual([{ expiresAt: 101, id: 2 }])
    expect(storage.setItem).toHaveBeenCalledWith('history', JSON.stringify(result))
  })
})
