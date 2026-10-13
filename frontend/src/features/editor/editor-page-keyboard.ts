import { useEffect } from 'react'

import { confirmAction } from '@/shared/feedback/feedback'
import type { StoryboardShotVO } from '@/shared/types/api'

import { selectedShotIdsInOrder } from './components/storyboard/asset-binding-utils'

export interface KeyboardEventLike {
  ctrlKey: boolean
  key: string
  metaKey: boolean
  shiftKey: boolean
}

export interface ShortcutContext {
  canRedo: boolean
  canUndo: boolean
  inputFocused: boolean
  selectedShotIds: number[]
}

export type ShortcutAction =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select-all' }
  | { type: 'delete-selected'; shotIds: number[] }

export function resolveKeyboardAction(
  event: KeyboardEventLike,
  context: ShortcutContext,
): ShortcutAction | null {
  if (context.inputFocused) return null

  const modifier = event.ctrlKey || event.metaKey

  // 旧实现只接受大写 Z 作为 redo,这里保持 Shift+Z 优先于普通 Ctrl+Z 的判断顺序。
  if (modifier && event.shiftKey && event.key.toLowerCase() === 'z') {
    if (context.canRedo) return { type: 'redo' }
    return null
  }

  if (modifier && event.key.toLowerCase() === 'z') {
    if (context.canUndo) return { type: 'undo' }
    return null
  }

  if (modifier && event.key.toLowerCase() === 'a') {
    return { type: 'select-all' }
  }

  if (event.key === 'Delete' && context.selectedShotIds.length > 0) {
    return { type: 'delete-selected', shotIds: context.selectedShotIds }
  }

  return null
}

export interface UseEditorKeyboardShortcutsOptions {
  canRedo: boolean
  canUndo: boolean
  deleteShot: (shotId: number) => Promise<void>
  deselectAll: () => void
  onRedo: () => Promise<void>
  onSelectAll: () => void
  onUndo: () => Promise<void>
  selectedShotIds: Set<number>
  shots: StoryboardShotVO[]
}

export function useEditorKeyboardShortcuts({
  canRedo,
  canUndo,
  deleteShot,
  deselectAll,
  onRedo,
  onSelectAll,
  onUndo,
  selectedShotIds,
  shots,
}: UseEditorKeyboardShortcutsOptions) {
  useEffect(() => {
    const handler = async (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const inputFocused =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      const snapshot = selectedShotIdsInOrder(shots, selectedShotIds)
      const action = resolveKeyboardAction(event, {
        canRedo,
        canUndo,
        inputFocused,
        selectedShotIds: snapshot,
      })

      if (!action) return
      event.preventDefault()

      if (action.type === 'undo') {
        await onUndo()
        return
      }

      if (action.type === 'redo') {
        await onRedo()
        return
      }

      if (action.type === 'select-all') {
        onSelectAll()
        return
      }

      if (action.type === 'delete-selected') {
        if (!(await confirmAction(`确定删除选中的 ${action.shotIds.length} 条分镜吗？`, {
          confirmLabel: '删除分镜', danger: true, title: '批量删除',
        }))) return
        for (const shotId of action.shotIds) {
          await deleteShot(shotId)
        }
        deselectAll()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [canRedo, canUndo, deleteShot, deselectAll, onRedo, onSelectAll, onUndo, selectedShotIds, shots])
}
