import { describe, expect, it } from 'vitest'

import { preserveArrayIdentity } from './preserve-identity'

describe('preserveArrayIdentity', () => {
  it('returns the previous array when the new one is deep-equal', () => {
    const prev = [{ id: 1, name: 'a' }]
    const next = [{ id: 1, name: 'a' }] // equal content, fresh reference
    expect(preserveArrayIdentity(prev, next)).toBe(prev)
  })

  it('returns the new array when content differs', () => {
    const prev = [{ id: 1, name: 'a' }]
    const next = [{ id: 1, name: 'b' }]
    expect(preserveArrayIdentity(prev, next)).toBe(next)
  })

  it('returns the new array when length differs', () => {
    const prev = [{ id: 1 }]
    const next = [{ id: 1 }, { id: 2 }]
    expect(preserveArrayIdentity(prev, next)).toBe(next)
  })

  it('treats two empty arrays as equal and keeps the previous reference', () => {
    const prev: number[] = []
    const next: number[] = []
    expect(preserveArrayIdentity(prev, next)).toBe(prev)
  })
})
