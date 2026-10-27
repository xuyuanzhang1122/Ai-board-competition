import { describe, expect, it } from 'vitest'

import { partialTargets } from './partial-state'
import type { Board } from './types'

const board = { shots: [{ id: 'a', no: 1 }, { id: 'b', no: 2 }] } as Board

describe('partial target freezing', () => {
  it('preserves board order, removes duplicates and excludes locked or missing shots', () => {
    expect(partialTargets(board, ['b', 'a', 'a', 'unknown'], ['b'])).toEqual(['a'])
    expect(partialTargets(null, ['a'], [])).toEqual([])
  })
})
