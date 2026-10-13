import type { BatchGenerateRequest, BatchGenerateResponse, JobVO } from '@/shared/types/api'

import { jobApi } from '../../api'

export type BatchOperationType = 'image' | 'video'
export type BatchAspectRatio = NonNullable<BatchGenerateRequest['aspectRatio']>

export interface BatchGenerationState {
  aspectRatio: BatchAspectRatio
  count: number
  error: string | null
  mode: 'ALL' | 'MISSING'
  open: boolean
  seconds: number
  submitting: boolean
  type: BatchOperationType
}

export type BatchGenerationAction =
  | { aspectRatio: BatchAspectRatio; type: 'set-aspect-ratio' }
  | { count: number; type: 'set-count' }
  | { mode: 'ALL' | 'MISSING'; type: 'set-mode' }
  | { type: 'close-or-background' }
  | { error: string; type: 'finish-error' }
  | { type: 'finish-success' }
  | { aspectRatio?: BatchAspectRatio; type: 'open'; operationType: BatchOperationType }
  | { type: 'tick' }
  | { type: 'submit-start' }

const maxCountFor = (operationType: BatchOperationType) => (operationType === 'image' ? 4 : 3)

const aspectRatioFor = (_operationType: BatchOperationType): BatchAspectRatio => '16:9'

export const createInitialBatchState = (
  operationType: BatchOperationType = 'image',
): BatchGenerationState => ({
  aspectRatio: aspectRatioFor(operationType),
  count: 1,
  error: null,
  mode: 'MISSING',
  open: false,
  seconds: 0,
  submitting: false,
  type: operationType,
})

export function batchGenerationReducer(
  state: BatchGenerationState,
  action: BatchGenerationAction,
): BatchGenerationState {
  switch (action.type) {
    case 'open': {
      return {
        ...createInitialBatchState(action.operationType),
        ...(action.aspectRatio ? { aspectRatio: action.aspectRatio } : {}),
        open: true,
      }
    }
    case 'set-aspect-ratio': {
      return { ...state, aspectRatio: action.aspectRatio }
    }
    case 'close-or-background': {
      // If a job is running, keep polling in the background (close modal but stay submitting).
      return state.submitting
        ? { ...state, open: false }
        : { ...state, open: false, seconds: 0 }
    }
    case 'set-mode': {
      return { ...state, mode: action.mode }
    }
    case 'set-count': {
      const max = maxCountFor(state.type)
      const count = Math.max(1, Math.min(max, Math.trunc(action.count || 1)))
      return { ...state, count }
    }
    case 'submit-start': {
      return { ...state, error: null, seconds: 0, submitting: true }
    }
    case 'tick': {
      return { ...state, seconds: state.seconds + 1 }
    }
    case 'finish-success': {
      return { ...state, open: false, submitting: false, seconds: 0 }
    }
    case 'finish-error': {
      return { ...state, error: action.error, submitting: false }
    }
    default: {
      return state
    }
  }
}

export interface BatchOperationDependencies {
  batchGenerateShots: (request: BatchGenerateRequest) => Promise<BatchGenerateResponse>
  batchGenerateVideos: (request: BatchGenerateRequest) => Promise<BatchGenerateResponse>
  fetchShots: () => Promise<void>
  notifyError?: (message: string) => void
  notifyInfo?: (message: string) => void
  notifySuccess?: (message: string) => void
  onSuccess?: () => void
}

const pollIntervalFor = (operationType: BatchOperationType) => (operationType === 'image' ? 3000 : 5000)

const terminalError = (job: JobVO) => job.errorMessage || '批量生成任务失败'

export async function pollBatchJob(
  jobId: number,
  operationType: BatchOperationType,
  dependencies: Pick<BatchOperationDependencies, 'fetchShots' | 'notifySuccess'>,
  signal: AbortSignal,
): Promise<void> {
  const { fetchShots, notifySuccess } = dependencies
  const interval = pollIntervalFor(operationType)
  const label = operationType === 'image' ? '分镜图' : '视频'

   
  while (true) {
    if (signal.aborted) return
    await new Promise<void>((resolve) => {
      setTimeout(resolve, interval)
    })
    if (signal.aborted) return

    const job = await jobApi.getJobStatus(jobId)

    if (job.status === 'FAILED') {
      throw new Error(terminalError(job))
    }
    if (job.status === 'SUCCEEDED' || job.status === 'COMPLETED') {
      await fetchShots()
      notifySuccess?.(`批量生成${label}完成`)
      return
    }
  }
}

export function buildBatchRequest(
  state: BatchGenerationState,
  targetIds: number[],
  model?: string,
): BatchGenerateRequest {
  return {
    aspectRatio: state.aspectRatio,
    countPerItem: state.count,
    mode: state.mode,
    model,
    targetIds,
  }
}
