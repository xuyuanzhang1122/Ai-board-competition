import { describe, expect, it } from 'vitest'

import { resolveInputModel } from './model-selection'

describe('model selection', () => {
  it('does not restore media choices from a stale server catalog', () => {
    expect(resolveInputModel('IMAGE', 'gpt-image-2', [{ code: 'gpt-image-2' }])).toBe('')
    expect(resolveInputModel('VIDEO', '', [{ code: 'sd-api-2-fast-720p' }])).toBe('')
  })
  it('never replaces an empty or disabled text preference with the first paid model', () => {
    const models = [{ code: 'deepseek-flash' }, { code: 'mimo-v2.6-pro' }]
    expect(resolveInputModel('TEXT', '', models)).toBe('')
    expect(resolveInputModel('TEXT', 'gemini-3.5-flash', models)).toBe('')
    expect(resolveInputModel('TEXT', 'mimo-v2.6-pro', models)).toBe(
      'mimo-v2.6-pro',
    )
    expect(resolveInputModel('TEXT', 'mimo-v2.6-pro', [])).toBe('')
  })
})
