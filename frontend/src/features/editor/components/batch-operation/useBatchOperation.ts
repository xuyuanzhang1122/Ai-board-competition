import { useEffect, useReducer, useRef } from 'react'

import type { BatchGenerateResponse } from '@/shared/types/api'

import {
  type BatchAspectRatio,
  batchGenerationReducer,
  type BatchGenerationState,
  type BatchOperationDependencies,
  type BatchOperationType,
  buildBatchRequest,
  createInitialBatchState,
  pollBatchJob,
} from './batch-operation-state'

export interface UseBatchOperationResult {
  cancelBackground: () => void
  close: () => void
  open: (type: BatchOperationType, aspectRatio?: BatchAspectRatio) => void
  setAspectRatio: (aspectRatio: BatchAspectRatio) => void
  setCount: (count: number) => void
  setMode: (mode: 'ALL' | 'MISSING') => void
  state: BatchGenerationState
  submit: (targetIds: number[]) => void
}

export function useBatchOperation(
  dependencies: BatchOperationDependencies & {
    resolveModel?: (type: BatchOperationType) => string | undefined
  },
): UseBatchOperationResult {
  const [state, dispatch] = useReducer(batchGenerationReducer, createInitialBatchState())
  const abortControllerRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const abortCurrent = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }

  useEffect(() => {
    if (!state.submitting || !state.open) {
      clearTimer()
      return
    }
    timerRef.current = setInterval(() => dispatch({ type: 'tick' }), 1000)
    return () => clearTimer()
  }, [state.submitting, state.open])

  useEffect(() => {
    return () => {
      clearTimer()
      abortCurrent()
    }
  }, [])

  const submit = (targetIds: number[]) => {
    if (state.submitting || targetIds.length === 0) return

    abortCurrent()
    const controller = new AbortController()
    abortControllerRef.current = controller

    dispatch({ type: 'submit-start' })

    const request = buildBatchRequest(state, targetIds, dependencies.resolveModel?.(state.type))
    const submitter =
      state.type === 'image'
        ? dependencies.batchGenerateShots
        : dependencies.batchGenerateVideos

    const run = async () => {
      let response: BatchGenerateResponse
      try {
        response = await submitter(request)
      } catch (error) {
        const message = error instanceof Error ? error.message : '批量生成任务提交失败'
        dispatch({ error: message, type: 'finish-error' })
        dependencies.notifyError?.(message)
        return
      }

      if (controller.signal.aborted) return

      // 提交成功即关闭弹窗（等价于自动"后台运行"）：任务已进入 store.activeJobs
      // 后台轮询，不再把用户卡在"生成中…Ns"直到整批生成结束。
      dispatch({ type: 'close-or-background' })
      dependencies.onSuccess?.()

      if (response.jobId) {
        try {
          await pollBatchJob(
            response.jobId,
            state.type,
            { fetchShots: dependencies.fetchShots, notifySuccess: dependencies.notifySuccess },
            controller.signal,
          )
          if (!controller.signal.aborted) dispatch({ type: 'finish-success' })
        } catch (error) {
          if (controller.signal.aborted) return
          dependencies.notifyError?.(error instanceof Error ? error.message : '批量生成失败')
          dispatch({ type: 'finish-success' })
        }
      } else {
        // No job to poll; still refresh once.
        await dependencies.fetchShots()
        dispatch({ type: 'finish-success' })
      }
    }

    void run()
  }

  return {
    cancelBackground: () => {
      dependencies.notifyInfo?.('后台任务已取消')
      abortCurrent()
      dispatch({ error: '已取消', type: 'finish-error' })
    },
    close: () => dispatch({ type: 'close-or-background' }),
    open: (type, aspectRatio) => {
      abortCurrent()
      dispatch({ aspectRatio, operationType: type, type: 'open' })
    },
    setAspectRatio: (aspectRatio) => dispatch({ aspectRatio, type: 'set-aspect-ratio' }),
    setCount: (count) => dispatch({ count, type: 'set-count' }),
    setMode: (mode) => dispatch({ mode, type: 'set-mode' }),
    state,
    submit,
  }
}
