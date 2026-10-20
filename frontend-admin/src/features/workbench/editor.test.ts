import { describe, expect, it } from 'vitest'

import { edit, failed, initialEditor, saved } from './editor'

describe('workbench editor state', () => {
  it('failed save preserves input and exposes the error until explicit successful save', () => {
    const state = failed(
      edit(initialEditor({ revision: 2, content: 'old' }), { revision: 2, content: 'human' }),
      '版本冲突',
    )
    expect(state).toMatchObject({
      value: { revision: 2, content: 'human' },
      dirty: true,
      error: '版本冲突',
    })
    expect(saved(state, { revision: 3, content: 'human' })).toMatchObject({
      dirty: false,
      error: '',
      value: { revision: 3 },
    })
  })
})
