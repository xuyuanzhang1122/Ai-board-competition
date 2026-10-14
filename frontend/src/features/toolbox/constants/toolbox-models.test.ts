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
  it('uses the Seedance 2.0 capability shared by all six sudashuiapi models', () => {
    expect(getVideoDurations('sd-api-2-fast-720p')).toEqual([5, 10, 15])
    expect(getVideoDurations('sd-2-fast-720p')).toEqual([5, 10, 15])
    expect(getVideoResolutions('sd-2-720p')).toContain('1280x720')
    expect(getVideoResolutions('sd-api-2-1080p')).toContain('1920x1080')
  })

  it('keeps the existing aspect-ratio chain for the Seedance image-reference model', () => {
    expect(getModelAspectRatios('VIDEO', 'sd-api-2-fast-720p')).toEqual([
      '16:9',
      '9:16',
      '1:1',
      '4:3',
      '3:4',
      '21:9',
    ])
  })

  it('offers the native Gemini imageConfig ratios documented by GeekNow', () => {
    expect(getModelAspectRatios('IMAGE', 'gemini-3-pro-image-preview')).toEqual([
      '1:1',
      '16:9',
      '9:16',
      '4:3',
      '3:4',
      '3:2',
      '2:3',
      '21:9',
    ])
  })

  it('exposes the current documented Seedream image ratios', () => {
    expect(getModelAspectRatios('IMAGE', 'doubao-seedream-4-5-251128')).toEqual([
      '1:1',
      '4:3',
      '3:4',
      '3:2',
      '2:3',
      '16:9',
      '9:16',
      '21:9',
    ])
  })

  it('falls back conservatively for an unknown backend model', () => {
    expect(getModelAspectRatios('IMAGE', 'future-image-model')).toEqual(['1:1'])
    expect(getVideoDurations('future-video-model')).toEqual([5])
    expect(getVideoResolutions('future-video-model')).toEqual(['854x480'])
  })
})
