import { describe, expect, it, vi } from 'vitest'

import type { StoryboardShotVO } from '@/shared/types/api'

import { runAbortableParse, splitStoryboardFiles } from './storyboard-import-utils'
import {
  createStoryboardPollingController,
  hasGeneratingAssets,
} from './useStoryboardPolling'

const shotWithStatus = (status: 'GENERATING' | 'NONE'): StoryboardShotVO =>
  ({
    createdAt: '',
    id: 1,
    props: [],
    scene: null,
    characters: [],
    scriptText: '',
    shotNo: 1,
    shotImage: { status },
    updatedAt: '',
    video: { status: 'NONE' },
  }) as unknown as StoryboardShotVO

describe('storyboard table hooks', () => {
  it('detects generating assets', () => {
    expect(hasGeneratingAssets([shotWithStatus('NONE')])).toBe(false)
    expect(hasGeneratingAssets([shotWithStatus('GENERATING')])).toBe(true)
  })

  it('starts polling once, prevents overlapping fetches and stops cleanly', async () => {
    vi.useFakeTimers()
    let resolveFetch: (() => void) | undefined
    const fetchShots = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const polling = createStoryboardPollingController(fetchShots, 100)
    polling.start()
    polling.start()
    await vi.advanceTimersByTimeAsync(250)
    expect(fetchShots).toHaveBeenCalledTimes(1)
    resolveFetch?.()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(100)
    expect(fetchShots).toHaveBeenCalledTimes(2)
    polling.stop()
    await vi.advanceTimersByTimeAsync(300)
    expect(fetchShots).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('auto-stops after the safety cap so a stuck GENERATING job cannot poll forever', async () => {
    vi.useFakeTimers()
    const fetchShots = vi.fn(async () => undefined)
    const polling = createStoryboardPollingController(fetchShots, 100, 3)
    polling.start()
    // Far more time than 3 ticks worth — a stuck job would otherwise poll endlessly.
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetchShots).toHaveBeenCalledTimes(3)
    expect(polling.isRunning()).toBe(false)
    vi.useRealTimers()
  })

  it('keeps polling failures bounded and reports the error once', async () => {
    vi.useFakeTimers()
    const error = new Error('network unavailable')
    const fetchShots = vi.fn(async () => {
      throw error
    })
    const onError = vi.fn()
    const polling = createStoryboardPollingController(fetchShots, 100, 10, onError)
    polling.start()
    await vi.advanceTimersByTimeAsync(500)
    expect(fetchShots).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(error)
    expect(polling.isRunning()).toBe(false)
    vi.useRealTimers()
  })

  it('resets the safety cap each time polling is restarted', async () => {
    vi.useFakeTimers()
    const fetchShots = vi.fn(async () => undefined)
    const polling = createStoryboardPollingController(fetchShots, 100, 2)
    polling.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchShots).toHaveBeenCalledTimes(2)
    polling.start() // new generation begins → fresh budget
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchShots).toHaveBeenCalledTimes(4)
    vi.useRealTimers()
  })

  it('aborts parsing and always clears its timer', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const session = runAbortableParse({
      onSecond: vi.fn(),
      parse: async (nextSignal) => {
        signal = nextSignal
      },
    })
    session.cancel()
    expect(signal?.aborted).toBe(true)
    await expect(session.promise).resolves.toBe('cancelled')
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('separates one spreadsheet from image assets', () => {
    const files = [
      { name: 'story.xlsx', type: '' },
      { name: '001_角色.png', type: 'image/png' },
      { name: 'readme.txt', type: 'text/plain' },
    ] as File[]
    const result = splitStoryboardFiles(files)
    expect(result.spreadsheet?.name).toBe('story.xlsx')
    expect(result.assetFiles.map(({ name }) => name)).toEqual(['001_角色.png'])
  })
})
