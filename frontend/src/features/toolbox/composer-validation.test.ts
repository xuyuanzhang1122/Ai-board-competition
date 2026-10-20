import { describe, expect, it } from 'vitest'

import { getComposerError } from './composer-validation'

describe('composer input bounds', () => {
  it('accepts the server limit exactly and rejects longer text without changing the draft', () => {
    const draft = '字'.repeat(10001)
    expect(getComposerError('字'.repeat(10000))).toBe('')
    expect(getComposerError(draft)).toContain('10000')
    expect(draft.length).toBe(10001)
  })
})
