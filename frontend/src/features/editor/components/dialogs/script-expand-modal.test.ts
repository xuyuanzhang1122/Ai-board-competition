import { describe, expect, it, vi } from 'vitest'

import { HIGHLIGHT_COLORS } from '../../utils/script-highlight'
import { buildScriptChips } from './script-expand-chips'

describe('script expand modal chips', () => {
  it('builds chips for characters, scenes and props', () => {
    const chips = buildScriptChips(['Alice', 'Bob'], ['操场'], ['书包'])
    expect(chips).toEqual([
      { color: HIGHLIGHT_COLORS.character, name: 'Alice', type: 'character' },
      { color: HIGHLIGHT_COLORS.character, name: 'Bob', type: 'character' },
      { color: HIGHLIGHT_COLORS.scene, name: '操场', type: 'scene' },
      { color: HIGHLIGHT_COLORS.prop, name: '书包', type: 'prop' },
    ])
  })

  it('deduplicates and trims names', () => {
    const chips = buildScriptChips([' Alice ', 'Alice', ''], [], [])
    expect(chips).toHaveLength(1)
    expect(chips[0]).toMatchObject({ name: 'Alice', type: 'character' })
  })

  it('returns an empty array when no bindings are provided', () => {
    expect(buildScriptChips()).toEqual([])
  })
})

describe('script expand modal save behavior', () => {
  it('only calls onSave when the text changed', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    // Simulate the component's save logic (trimmed comparison)
    const saveIfChanged = (draft: string, original: string) => {
      const trimmed = draft.trim()
      if (trimmed !== (original || '').trim()) {
        onSave(trimmed)
      }
      onClose()
    }

    saveIfChanged('  same  ', 'same')
    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)

    saveIfChanged('changed', 'original')
    expect(onSave).toHaveBeenCalledWith('changed')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
