import { describe, expect, it, vi } from 'vitest'

import {
  type BatchGenerationAction,
  batchGenerationReducer,
  type BatchGenerationState,
  buildBatchRequest,
  createInitialBatchState,
} from './batch-operation-state'

vi.mock('@/shared/api/client', () => ({
  default: {
    defaults: { baseURL: '/api' },
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

const reduce = (
  state: BatchGenerationState,
  ...actions: BatchGenerationAction[]
): BatchGenerationState =>
  actions.reduce(batchGenerationReducer, state)

describe('batch operation state', () => {
  it('creates an initial image state', () => {
    const state = createInitialBatchState('image')
    expect(state.type).toBe('image')
    expect(state.aspectRatio).toBe('16:9')
    expect(state.count).toBe(1)
    expect(state.mode).toBe('MISSING')
    expect(state.open).toBe(false)
    expect(state.submitting).toBe(false)
  })

  it('creates an initial video state', () => {
    const state = createInitialBatchState('video')
    expect(state.type).toBe('video')
    expect(state.aspectRatio).toBe('16:9')
    expect(state.count).toBe(1)
  })

  it('opens with the requested type and resets transient fields', () => {
    let state = createInitialBatchState('image')
    state = reduce(state, { count: 4, type: 'set-count' }, { type: 'submit-start' })
    state = reduce(state, { type: 'open', operationType: 'video' })

    expect(state.type).toBe('video')
    expect(state.open).toBe(true)
    expect(state.count).toBe(1)
    expect(state.submitting).toBe(false)
    expect(state.seconds).toBe(0)
  })

  it('switches mode', () => {
    const state = reduce(createInitialBatchState('image'), {
      mode: 'ALL',
      type: 'set-mode',
    })
    expect(state.mode).toBe('ALL')
  })

  it('selects an aspect ratio supported by the configured model', () => {
    const state = reduce(createInitialBatchState('image'), {
      aspectRatio: '4:3',
      type: 'set-aspect-ratio',
    })
    expect(state.aspectRatio).toBe('4:3')
  })

  it('clamps count to the type-specific maximum', () => {
    const imageState = reduce(createInitialBatchState('image'), { count: 10, type: 'set-count' })
    expect(imageState.count).toBe(4)

    const videoState = reduce(createInitialBatchState('video'), { count: 0, type: 'set-count' })
    expect(videoState.count).toBe(1)
  })

  it('increments seconds on tick', () => {
    let state = reduce(createInitialBatchState('image'), { type: 'submit-start' })
    state = reduce(state, { type: 'tick' }, { type: 'tick' })
    expect(state.seconds).toBe(2)
  })

  it('closes to background while submitting', () => {
    const state = reduce(createInitialBatchState('image'), { type: 'submit-start' }, {
      type: 'close-or-background',
    })
    expect(state.open).toBe(false)
    expect(state.submitting).toBe(true)
  })

  it('closes and resets seconds when not submitting', () => {
    let state = reduce(createInitialBatchState('image'), { type: 'tick' })
    state = reduce(state, { type: 'close-or-background' })
    expect(state.open).toBe(false)
    expect(state.submitting).toBe(false)
    expect(state.seconds).toBe(0)
  })

  it('finishes successfully and resets transient state', () => {
    let state = reduce(createInitialBatchState('image'), { type: 'submit-start' }, { type: 'tick' })
    state = reduce(state, { type: 'finish-success' })
    expect(state.submitting).toBe(false)
    expect(state.open).toBe(false)
    expect(state.seconds).toBe(0)
  })

  it('records errors and stops submitting while keeping the modal open', () => {
    const state = reduce(
      createInitialBatchState('image'),
      { type: 'open', operationType: 'image' },
      { type: 'submit-start' },
      { error: 'network error', type: 'finish-error' },
    )
    expect(state.submitting).toBe(false)
    expect(state.error).toBe('network error')
    expect(state.open).toBe(true)
  })

  it('builds the batch request from state and ordered target ids', () => {
    const state = reduce(createInitialBatchState('image'), { mode: 'ALL', type: 'set-mode' })
    const request = buildBatchRequest(state, [3, 1, 4])
    expect(request).toEqual({
      aspectRatio: '16:9',
      countPerItem: 1,
      mode: 'ALL',
      targetIds: [3, 1, 4],
    })
  })
})
