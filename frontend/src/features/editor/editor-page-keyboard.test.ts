import { describe, expect, it } from 'vitest'

import { resolveKeyboardAction, type ShortcutContext } from './editor-page-keyboard'

const baseContext = (overrides?: Partial<ShortcutContext>): ShortcutContext => ({
  canRedo: true,
  canUndo: true,
  inputFocused: false,
  selectedShotIds: [10, 20, 30],
  ...overrides,
})

const event = (
  key: string,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
) => ({
  ctrlKey: modifiers.ctrlKey ?? false,
  key,
  metaKey: modifiers.metaKey ?? false,
  shiftKey: modifiers.shiftKey ?? false,
})

describe('resolveKeyboardAction', () => {
  it('ignores all shortcuts while an input/textarea/contenteditable is focused', () => {
    const context = baseContext({ inputFocused: true })

    expect(resolveKeyboardAction(event('z', { ctrlKey: true }), context)).toBeNull()
    expect(resolveKeyboardAction(event('Z', { ctrlKey: true, shiftKey: true }), context)).toBeNull()
    expect(resolveKeyboardAction(event('a', { ctrlKey: true }), context)).toBeNull()
    expect(resolveKeyboardAction(event('Delete'), context)).toBeNull()
  })

  it('prioritises Ctrl+Shift+Z as redo before Ctrl+Z as undo', () => {
    const context = baseContext({ canUndo: true, canRedo: true })

    expect(resolveKeyboardAction(event('Z', { ctrlKey: true, shiftKey: true }), context)).toEqual({
      type: 'redo',
    })
  })

  it('treats lowercase z with shift as redo as well', () => {
    const context = baseContext({ canRedo: true })

    expect(resolveKeyboardAction(event('z', { ctrlKey: true, shiftKey: true }), context)).toEqual({
      type: 'redo',
    })
  })

  it('does not fall back to undo when redo is unavailable but Shift is held', () => {
    const context = baseContext({ canUndo: true, canRedo: false })

    expect(
      resolveKeyboardAction(event('z', { ctrlKey: true, shiftKey: true }), context),
    ).toBeNull()
  })

  it('returns undo for Ctrl+Z when undo is available', () => {
    const context = baseContext({ canUndo: true, canRedo: false })

    expect(resolveKeyboardAction(event('z', { ctrlKey: true }), context)).toEqual({ type: 'undo' })
    expect(resolveKeyboardAction(event('Z', { ctrlKey: true }), context)).toEqual({ type: 'undo' })
  })

  it('returns null for Ctrl+Z when undo is unavailable', () => {
    const context = baseContext({ canUndo: false })

    expect(resolveKeyboardAction(event('z', { ctrlKey: true }), context)).toBeNull()
  })

  it('returns select-all for Ctrl+A', () => {
    const context = baseContext()

    expect(resolveKeyboardAction(event('a', { ctrlKey: true }), context)).toEqual({
      type: 'select-all',
    })
    expect(resolveKeyboardAction(event('a', { metaKey: true }), context)).toEqual({
      type: 'select-all',
    })
  })

  it('returns delete-selected with the exact selection snapshot', () => {
    const context = baseContext({ selectedShotIds: [5, 9, 2] })

    expect(resolveKeyboardAction(event('Delete'), context)).toEqual({
      shotIds: [5, 9, 2],
      type: 'delete-selected',
    })
  })

  it('ignores Delete when nothing is selected', () => {
    const context = baseContext({ selectedShotIds: [] })

    expect(resolveKeyboardAction(event('Delete'), context)).toBeNull()
  })

  it('ignores unrelated keys', () => {
    const context = baseContext()

    expect(resolveKeyboardAction(event('b', { ctrlKey: true }), context)).toBeNull()
    expect(resolveKeyboardAction(event('Escape'), context)).toBeNull()
  })
})
