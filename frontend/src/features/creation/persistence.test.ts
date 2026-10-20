import { describe, expect, it } from 'vitest'

import { readRecovery, writeRecovery } from './persistence'
import type { PendingRequest } from './types'

const pending: PendingRequest = {
  kind: 'project',
  draftId: 7,
  payload: { requestId: 'persisted-uuid', revision: 4 },
}
function memory() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}
describe('creation local recovery', () => {
  it('restores exact pending input after reload, isolated by account and route', () => {
    const storage = memory()
    writeRecovery(storage, 1, '7', { pending, edit: null })
    expect(readRecovery(storage, 1, '7')?.pending).toEqual(pending)
    expect(readRecovery(storage, 2, '7')).toBeNull()
    expect(readRecovery(storage, 1, '8')).toBeNull()
  })
  it('does not silently drop the original request when storage cannot persist it', () => {
    const storage = {
      ...memory(),
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(() => writeRecovery(storage, 1, '7', { pending, edit: null })).toThrow('quota')
  })
})
