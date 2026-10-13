import type { JobVO, StoryboardShotVO } from '@/shared/types/api'

export const PANEL_HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface ExpiringHistoryItem {
  expiresAt: number
}

export class GenerationJobTimeoutError extends Error {
  constructor() {
    super('生成超时，请稍后在历史记录中查看')
    this.name = 'GenerationJobTimeoutError'
  }
}

const getBrowserStorage = (): StorageLike | null =>
  typeof window === 'undefined' ? null : window.localStorage

export function loadExpiringHistory<T extends ExpiringHistoryItem>(
  key: string,
  options?: { now?: number; storage?: StorageLike | null },
): T[] {
  const storage = options?.storage === undefined ? getBrowserStorage() : options.storage
  if (!storage) return []

  try {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    const now = options?.now ?? Date.now()
    const active = parsed.filter(
      (item): item is T =>
        typeof item === 'object' &&
        item !== null &&
        'expiresAt' in item &&
        typeof item.expiresAt === 'number' &&
        item.expiresAt > now,
    )

    if (active.length !== parsed.length) saveExpiringHistory(key, active, storage)
    return active
  } catch {
    return []
  }
}

export function saveExpiringHistory<T extends ExpiringHistoryItem>(
  key: string,
  records: T[],
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(records))
  } catch {
    // localStorage 满额或被浏览器策略禁用时，不阻断生成主流程。
  }
}

const validReferenceUrl = (url: string | null | undefined): url is string =>
  Boolean(url?.trim()) && !url?.includes('via.placeholder.com')

export function collectShotReferenceImageUrls(
  shot: StoryboardShotVO | undefined,
  options?: { additionalUrls?: Array<string | null | undefined>; includeShotImage?: boolean },
): string[] {
  if (!shot) return []

  const urls: Array<string | null | undefined> = [...(options?.additionalUrls ?? [])]
  if (options?.includeShotImage) urls.push(shot.shotImage.currentUrl)
  urls.push(
    ...shot.characters.map((character) => character.thumbnailUrl),
    shot.scene?.thumbnailUrl,
    ...shot.props.map((prop) => prop.thumbnailUrl),
  )

  return [...new Set(urls.filter(validReferenceUrl))]
}

export async function mergeReferenceImages(
  imageUrls: string[],
  deps?: { mergeImages: (urls: string[]) => Promise<{ mergedImageUrl: string }> },
): Promise<string | null> {
  const urls = [...new Set(imageUrls.filter(validReferenceUrl))]
  if (urls.length === 0) return null
  if (urls.length === 1) return urls[0]

  try {
    const mergeImages = deps?.mergeImages ?? (await import('../../api')).imageUtilApi.mergeImages
    const response = await mergeImages(urls)
    return response.mergedImageUrl || urls[0]
  } catch {
    return urls[0]
  }
}

export async function uploadReferenceImage(
  file: File,
  deps?: { upload: (file: File, type: 'image') => Promise<{ url: string }> },
): Promise<string> {
  const upload = deps?.upload ?? (await import('@/shared/api/upload')).uploadApi.upload
  const result = await upload(file, 'image')
  if (!result.url) throw new Error('上传结果缺少图片地址')
  return result.url
}

export interface PollGenerationJobOptions {
  getJobStatus: (jobId: number) => Promise<JobVO>
  interval?: number
  maxAttempts?: number
  onProgress?: (job: JobVO) => void
  onQueryError?: (error: unknown) => void
  signal?: AbortSignal
  sleep?: (ms: number) => Promise<void>
}

export async function pollGenerationJob(
  jobId: number,
  options: PollGenerationJobOptions,
): Promise<JobVO | null> {
  const {
    getJobStatus,
    interval = 3000,
    maxAttempts = 60,
    onProgress,
    onQueryError,
    signal,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = options

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) return null
    await sleep(interval)
    if (signal?.aborted) return null

    let job: JobVO
    try {
      job = await getJobStatus(jobId)
    } catch (error) {
      onQueryError?.(error)
      continue
    }

    onProgress?.(job)
    if (job.status === 'COMPLETED' || job.status === 'SUCCEEDED') return job
    if (job.status === 'FAILED' || job.status === 'CANCELED') {
      throw new Error(
        job.errorMessage || (job.status === 'CANCELED' ? '生成任务已取消' : '生成失败'),
      )
    }
  }

  throw new GenerationJobTimeoutError()
}

export interface JobBackedHistoryItem extends ExpiringHistoryItem {
  id: number
  resultUrl: string
}

export async function hydrateMissingJobUrls<T extends JobBackedHistoryItem>(
  records: T[],
  getJobStatus: (jobId: number) => Promise<JobVO>,
): Promise<T[]> {
  return Promise.all(
    records.map(async (record) => {
      if (record.resultUrl) return record
      try {
        const job = await getJobStatus(record.id)
        return job.resultUrl ? { ...record, resultUrl: job.resultUrl } : record
      } catch {
        return record
      }
    }),
  )
}
