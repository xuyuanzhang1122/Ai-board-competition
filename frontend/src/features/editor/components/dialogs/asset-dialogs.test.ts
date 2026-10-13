import { describe, expect, it } from 'vitest'

import type { AssetVersionVO } from '@/shared/types/api'

import {
  assetGenerationFormReducer,
  assetVersionModalReducer,
  buildAssetGenerationRequest,
  calculateAssetGenerationCost,
  createAssetGenerationFormState,
  createAssetVersionModalState,
  sortAssetVersions,
} from './asset-dialog-state'

const version = (id: number, versionNo: number, isCurrent = false): AssetVersionVO => ({
  assetId: 9,
  createdAt: `2026-06-${20 + versionNo}T10:00:00Z`,
  createdBy: null,
  id,
  isCurrent,
  objectKey: null,
  paramsJson: null,
  prompt: null,
  provider: 'OSS',
  source: 'AI',
  status: 'READY',
  url: `https://example.com/${id}.jpg`,
  versionNo,
})

describe('asset generation modal state', () => {
  it('keeps legacy composer billing proportional to generation count', () => {
    expect(calculateAssetGenerationCost('shot-image', 3)).toBe(150)
    expect(calculateAssetGenerationCost('video', 3)).toBe(300)
  })

  it('builds a single-row batch request with count, ratio and model', () => {
    const request = buildAssetGenerationRequest(
      { assetType: 'shot-image', shotId: 12, shotNo: 4 },
      { aspectRatio: '16:9', count: 3, duration: 10, model: 'gpt-image-2-vip' },
    )

    expect(request).toEqual({
      aspectRatio: '16:9',
      countPerItem: 3,
      mode: 'ALL',
      model: 'gpt-image-2-vip',
      targetIds: [12],
    })
  })

  it('includes the selected duration only for video generation', () => {
    const request = buildAssetGenerationRequest(
      { assetType: 'video', shotId: 12, shotNo: 4 },
      { aspectRatio: '16:9', count: 1, duration: 10, model: 'sd-api-2-fast-720p' },
    )

    expect(request.duration).toBe(10)
  })

  it('resets temporary generation parameters when the modal closes', () => {
    let state = createAssetGenerationFormState('shot-image')
    state = assetGenerationFormReducer(state, { count: 7, type: 'set-count' })
    state = assetGenerationFormReducer(state, { model: 'custom-model', type: 'set-model' })

    expect(assetGenerationFormReducer(state, { assetType: 'video', type: 'reset' })).toEqual({
      aspectRatio: '16:9',
      count: 1,
      duration: 5,
      model: '',
    })
  })
})

describe('asset version modal state', () => {
  it('sorts newest versions first without mutating API data', () => {
    const input = [version(1, 1), version(3, 3, true), version(2, 2)]
    expect(sortAssetVersions(input).map((item) => item.versionNo)).toEqual([3, 2, 1])
    expect(input.map((item) => item.versionNo)).toEqual([1, 3, 2])
  })

  it('clears selected version and loaded records when the modal closes', () => {
    let state = createAssetVersionModalState()
    state = assetVersionModalReducer(state, {
      type: 'versions-loaded',
      versions: [version(3, 3, true), version(2, 2)],
    })
    state = assetVersionModalReducer(state, { type: 'switch-start', versionId: 2 })

    expect(assetVersionModalReducer(state, { type: 'reset' })).toEqual(
      createAssetVersionModalState(),
    )
  })

  it('clears the temporary selection when a version switch fails', () => {
    let state = assetVersionModalReducer(createAssetVersionModalState(), {
      type: 'switch-start',
      versionId: 2,
    })
    state = assetVersionModalReducer(state, { message: '切换失败', type: 'load-error' })

    expect(state).toMatchObject({
      error: '切换失败',
      selectedVersionId: null,
      switching: false,
    })
  })
})
