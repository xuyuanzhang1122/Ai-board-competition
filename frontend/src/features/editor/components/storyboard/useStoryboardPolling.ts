import { useEffect, useMemo, useRef } from 'react'

import { notify } from '@/shared/feedback/feedback'
import type { StoryboardShotVO } from '@/shared/types/api'

export const hasGeneratingAssets = (shots: StoryboardShotVO[]) =>
  shots.some(
    ({ shotImage, video }) =>
      shotImage.status === 'GENERATING' || video.status === 'GENERATING',
  )

// Safety cap: a job stuck in GENERATING (e.g. backend never writes back a
// terminal READY/FAILED status) would otherwise poll forever, re-rendering the
// whole storyboard every interval and leaking memory into the GBs. After this
// many consecutive ticks the controller auto-stops; a new generation resets it.
export const DEFAULT_MAX_POLL_TICKS = 200

export const createStoryboardPollingController = (
  fetchShots: () => Promise<void>,
  interval = 3000,
  maxTicks = DEFAULT_MAX_POLL_TICKS,
  onError?: (error: unknown) => void,
) => {
  let fetching = false
  let ticks = 0
  let timer: ReturnType<typeof setInterval> | null = null

  const controller = {
    isRunning: () => timer !== null,
    start() {
      ticks = 0
      if (timer !== null) return
      timer = setInterval(() => void tick(), interval)
    },
    stop() {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    },
  }

  const tick = async () => {
    if (fetching) return
    ticks += 1
    if (ticks > maxTicks) {
      controller.stop()
      return
    }
    fetching = true
    try {
      await fetchShots()
    } catch (error) {
      controller.stop()
      onError?.(error)
    } finally {
      fetching = false
    }
  }

  return controller
}

export function useStoryboardPolling(
  shots: StoryboardShotVO[],
  activeJobCount: number,
  pollActiveJobs: () => Promise<void>,
  interval = 3000,
) {
  const previousStatuses = useRef(new Map<number, string>())
  const polling = useMemo(
    () =>
      createStoryboardPollingController(pollActiveJobs, interval, DEFAULT_MAX_POLL_TICKS, () => {
        notify.error('分镜状态刷新失败，已保留当前画面，请稍后重试生成')
      }),
    [pollActiveJobs, interval],
  )
  // We poll the cheap per-job status endpoint while jobs are in flight — not a
  // full-table shot refetch on a timer. A refetch happens at most once, when a
  // job finishes (see store.pollActiveJobs).
  const generating = activeJobCount > 0

  useEffect(() => {
    if (generating) polling.start()
    else polling.stop()
  }, [generating, polling])
  useEffect(() => {
    const nextStatuses = new Map<number, string>()
    for (const shot of shots) {
      for (const [suffix, asset] of [
        ['分镜图', shot.shotImage],
        ['视频', shot.video],
      ] as const) {
        const key = shot.id * 10 + (suffix === '视频' ? 1 : 0)
        if (previousStatuses.current.get(key) === 'GENERATING' && asset.status === 'FAILED') {
          notify.error(`分镜 ${shot.shotNo} 的${suffix}生成失败，可点击失败卡片重试`)
        }
        nextStatuses.set(key, asset.status)
      }
    }
    previousStatuses.current = nextStatuses
  }, [shots])
  useEffect(() => () => polling.stop(), [polling])

  return generating
}
