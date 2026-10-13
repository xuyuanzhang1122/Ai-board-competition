import type { BatchGenerateResponse, JobVO, StoryboardShotVO } from '@/shared/types/api'

import type { ShotGenerationParams } from '../../api'
import {
  collectShotReferenceImageUrls,
  mergeReferenceImages,
  pollGenerationJob,
} from './generation-helpers'

export const SHOT_IMAGE_ASPECT_RATIOS = ['16:9', '1:1', '9:16', '21:9'] as const
export type ShotImageAspectRatio = NonNullable<ShotGenerationParams['aspectRatio']>

const SHOT_IMAGE_PROMPT_PREFIX =
  '请根据以下分镜剧本生成单张画面。保持参考图中角色、场景和道具的外观一致，构图清晰，不要添加字幕、水印或画外文字。分镜剧本：'

export const shotImageHistoryKey = (shotId: number) => `shot_generation_history_${shotId}`

export function buildShotImagePrompt(scriptText: string): string {
  return `${SHOT_IMAGE_PROMPT_PREFIX}${scriptText.trim() || '（无剧本内容）'}`
}

export interface GenerateShotImagesInput {
  additionalReferenceUrls?: Array<string | null | undefined>
  aspectRatio: ShotImageAspectRatio
  model?: string
  projectId: number
  quantity: number
  shot: StoryboardShotVO
}

export interface ShotImageGenerationResult {
  imageUrls: string[]
  jobId: number
  prompt: string
}

export interface ShotImageGenerationDeps {
  generateSingleShot: (
    projectId: number,
    shotId: number,
    params: ShotGenerationParams,
  ) => Promise<BatchGenerateResponse>
  getJobStatus: (jobId: number) => Promise<JobVO>
  mergeImages: (urls: string[]) => Promise<{ mergedImageUrl: string }>
  onProgress?: (job: JobVO) => void
  signal?: AbortSignal
  sleep?: (ms: number) => Promise<void>
}

export async function generateShotImages(
  input: GenerateShotImagesInput,
  deps: ShotImageGenerationDeps,
): Promise<ShotImageGenerationResult[]> {
  const prompt = buildShotImagePrompt(input.shot.scriptText)
  const sourceUrls = collectShotReferenceImageUrls(input.shot, {
    additionalUrls: input.additionalReferenceUrls,
  })
  const referenceImageUrl = await mergeReferenceImages(sourceUrls, {
    mergeImages: deps.mergeImages,
  })

  const results: ShotImageGenerationResult[] = []
  const count = Math.max(1, Math.min(10, Math.trunc(input.quantity)))

  for (let index = 0; index < count; index += 1) {
    if (deps.signal?.aborted) break
    const response = await deps.generateSingleShot(input.projectId, input.shot.id, {
      aspectRatio: input.aspectRatio,
      customPrompt: prompt,
      model: input.model || 'gemini-3-pro-image-preview',
      referenceImageUrl: referenceImageUrl ?? undefined,
    })
    if (!response.jobId) throw new Error('生成任务缺少 jobId')

    const job = await pollGenerationJob(response.jobId, {
      getJobStatus: deps.getJobStatus,
      onProgress: deps.onProgress,
      signal: deps.signal,
      sleep: deps.sleep,
    })
    if (!job) break

    const imageUrls = [...new Set([...(job.allImageUrls ?? []), job.resultUrl].filter(Boolean))] as string[]
    if (imageUrls.length === 0) throw new Error('生成完成但未返回图片地址')
    results.push({ imageUrls, jobId: response.jobId, prompt })
  }

  return results
}
