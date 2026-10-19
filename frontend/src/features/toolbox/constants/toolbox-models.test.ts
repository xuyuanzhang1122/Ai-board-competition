import { describe, expect, it } from 'vitest'

import {
  calculateEstimatedCost,
  getModelAspectRatios,
  getVideoDurations,
  getVideoResolutions,
} from './toolbox-models'

describe('model capability constraints', () => {
  it('does not quote wallet points for competition generation', () => {
    expect(calculateEstimatedCost('TEXT', 'deepseek-flash', { promptLength: 1000 })).toBe(0)
    expect(calculateEstimatedCost('IMAGE', 'gemini-3-pro-image-preview')).toBe(0)
    expect(calculateEstimatedCost('VIDEO', 'sd-api-2-fast-720p', { duration: 15 })).toBe(0)
  })
  it('does not advertise capabilities for retired image and video models', () => {
    expect(getModelAspectRatios('IMAGE', 'gemini-3-pro-image-preview')).toEqual([])
    expect(getModelAspectRatios('VIDEO', 'sd-api-2-fast-720p')).toEqual([])
    expect(getVideoDurations('sd-api-2-fast-720p')).toEqual([])
    expect(getVideoResolutions('sd-api-2-1080p')).toEqual([])
  })

  it('falls back conservatively for an unknown backend model', () => {
    expect(getModelAspectRatios('IMAGE', 'future-image-model')).toEqual([])
    expect(getVideoDurations('future-video-model')).toEqual([])
    expect(getVideoResolutions('future-video-model')).toEqual([])
  })
})
