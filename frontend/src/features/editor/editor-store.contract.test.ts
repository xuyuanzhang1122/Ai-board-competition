import { describe, expect, it, vi } from 'vitest'

import type { AssetStatusVO, StoryboardShotVO } from '@/shared/types/api'

import { assetApi, characterApi, generationApi, jobApi, propApi, sceneApi, shotApi } from './api'
import {
  createEditorStore,
  type EditorData,
  type EditorStoreDependencies,
} from './store'

vi.mock('@/shared/api/client', () => ({
  default: { delete: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

const emptyAsset = (): AssetStatusVO => ({
  assetId: null,
  currentUrl: null,
  currentVersionId: null,
  status: 'NONE',
  totalVersions: 0,
})

const makeShot = (id: number, shotNo: number, scriptText: string): StoryboardShotVO => ({
  characters: [],
  createdAt: '2026-06-28T00:00:00Z',
  id,
  props: [],
  scene: null,
  scriptText,
  shotImage: emptyAsset(),
  shotNo,
  updatedAt: '2026-06-28T00:00:00Z',
  video: emptyAsset(),
})

const shots = [
  makeShot(11, 1, '第一幕'),
  makeShot(22, 2, '第二幕'),
  makeShot(33, 3, '第三幕'),
]

const createDependencies = () => {
  const dependencies: EditorStoreDependencies = {
    assetApi: { ...assetApi },
    characterApi: { ...characterApi },
    generationApi: { ...generationApi },
    jobApi: { ...jobApi },
    notifier: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    propApi: { ...propApi },
    sceneApi: { ...sceneApi },
    shotApi: {
      ...shotApi,
      deleteShot: vi.fn(async () => undefined),
      getProjectShots: vi.fn(async () => shots),
      reorderShots: vi.fn(async () => undefined),
      updateShot: vi.fn(async () => undefined),
    },
  }
  return dependencies
}

const createStore = (
  initialState: Partial<EditorData> = {},
  dependencies = createDependencies(),
) => createEditorStore(dependencies, { projectId: 1, ...initialState })

describe('editor Zustand store contract: selection', () => {
  it('toggles ids, notifies Set subscribers and derives selectedShots in shot order', () => {
    const store = createStore({ shots })
    const selectionReferences: Set<number>[] = []
    const unsubscribe = store.subscribe((state, previousState) => {
      if (state.selectedShotIds !== previousState.selectedShotIds)
        selectionReferences.push(state.selectedShotIds)
    })

    store.getState().toggleShotSelection(22)
    store.getState().toggleShotSelection(11)

    expect(store.getState().selectedShots.map((shot) => shot.id)).toEqual([11, 22])
    expect(store.getState().hasSelection).toBe(true)
    expect(selectionReferences).toHaveLength(2)

    store.getState().toggleShotSelection(22)
    expect([...store.getState().selectedShotIds]).toEqual([11])
    unsubscribe()
  })

  it('selects all and replaces a stale selection set', () => {
    const store = createStore({ selectedShotIds: new Set([999]), shots })

    store.getState().selectAll()

    expect([...store.getState().selectedShotIds]).toEqual([11, 22, 33])
    expect(store.getState().allSelected).toBe(true)
  })

  it('deselects all through a new Set so Zustand subscribers are notified', () => {
    const store = createStore({ selectedShotIds: new Set([11, 22]), shots })
    const previousSelection = store.getState().selectedShotIds

    store.getState().deselectAll()

    expect(store.getState().selectedShotIds).not.toBe(previousSelection)
    expect(store.getState().hasSelection).toBe(false)
  })

  it('inverts only ids belonging to current shots and discards stale ids', () => {
    const store = createStore({ selectedShotIds: new Set([22, 999]), shots })

    store.getState().invertSelection()

    expect([...store.getState().selectedShotIds]).toEqual([11, 33])
  })

  it('keeps the legacy allSelected cardinality boundary', () => {
    expect(createStore().getState().allSelected).toBe(false)

    const store = createStore({ selectedShotIds: new Set([11, 999]), shots: shots.slice(0, 2) })
    expect(store.getState().allSelected).toBe(true)
  })
})

describe('editor Zustand store contract: undo and redo', () => {
  it('starts at the empty-stack boundary', () => {
    const state = createStore().getState()

    expect(state.history).toEqual([])
    expect(state.historyIndex).toBe(-1)
    expect(state.canUndo).toBe(false)
    expect(state.canRedo).toBe(false)
  })

  it('saveHistory pushes a deep snapshot and advances historyIndex', () => {
    const store = createStore({ shots: [{ ...shots[0] }] })

    store.getState().saveHistory()
    store.getState().shots[0].scriptText = '已修改'

    expect(store.getState().historyIndex).toBe(0)
    expect(store.getState().history[0][0].scriptText).toBe('第一幕')
    expect(store.getState().canUndo).toBe(false)
    expect(store.getState().canRedo).toBe(false)
  })

  it('moves between stack bottom and top without crossing either boundary', async () => {
    const store = createStore()
    for (const shot of shots) {
      store.setState({ shots: [shot] })
      store.getState().saveHistory()
    }

    expect(store.getState()).toMatchObject({ canRedo: false, canUndo: true, historyIndex: 2 })

    await store.getState().undo()
    await store.getState().undo()
    await store.getState().undo()
    expect(store.getState().historyIndex).toBe(0)
    expect(store.getState().shots[0].id).toBe(11)
    expect(store.getState()).toMatchObject({ canRedo: true, canUndo: false })

    await store.getState().redo()
    await store.getState().redo()
    await store.getState().redo()
    expect(store.getState().historyIndex).toBe(2)
    expect(store.getState().shots[0].id).toBe(33)
    expect(store.getState()).toMatchObject({ canRedo: false, canUndo: true })
  })

  it('truncates redo history when a new operation follows undo', async () => {
    const store = createStore()
    for (const shot of shots) {
      store.setState({ shots: [shot] })
      store.getState().saveHistory()
    }

    await store.getState().undo()
    store.setState({ shots: [makeShot(44, 4, '新分支')] })
    store.getState().saveHistory()

    expect(store.getState().history.map((snapshot) => snapshot[0].id)).toEqual([11, 22, 44])
    expect(store.getState().historyIndex).toBe(2)
    expect(store.getState().canRedo).toBe(false)
  })

  it('trims history to maxHistorySize=20 and keeps the index at the new top', () => {
    const store = createStore()
    for (let index = 1; index <= 21; index += 1) {
      store.setState({ shots: [makeShot(index, index, `分镜 ${index}`)] })
      store.getState().saveHistory()
    }

    expect(store.getState().history).toHaveLength(20)
    expect(store.getState().historyIndex).toBe(19)
    expect(store.getState().history[0][0].id).toBe(2)
    expect(store.getState().history[19][0].id).toBe(21)
    expect(store.getState()).toMatchObject({ canRedo: false, canUndo: true })
  })

  it('rolls historyIndex back when undo or redo reorder synchronization fails', async () => {
    const undoDependencies = createDependencies()
    undoDependencies.shotApi.reorderShots = vi.fn(async () => {
      throw new Error('offline')
    })
    const undoStore = createStore(
      { history: [[shots[0]], [shots[1]], [shots[2]]], historyIndex: 2, shots: [shots[2]] },
      undoDependencies,
    )

    await undoStore.getState().undo()
    expect(undoStore.getState().historyIndex).toBe(2)

    const redoDependencies = createDependencies()
    redoDependencies.shotApi.reorderShots = vi.fn(async () => {
      throw new Error('offline')
    })
    const redoStore = createStore(
      { history: [[shots[0]], [shots[1]]], historyIndex: 0, shots: [shots[0]] },
      redoDependencies,
    )

    await redoStore.getState().redo()
    expect(redoStore.getState().historyIndex).toBe(0)
  })
})

describe('editor Zustand store contract: merge and delete', () => {
  it('does not merge fewer than two requested ids', async () => {
    const dependencies = createDependencies()
    const store = createStore({ shots }, dependencies)

    await store.getState().mergeShots([11])

    expect(dependencies.shotApi.updateShot).not.toHaveBeenCalled()
    expect(dependencies.shotApi.deleteShot).not.toHaveBeenCalled()
    expect(dependencies.shotApi.getProjectShots).not.toHaveBeenCalled()
  })

  it('warns and stops when fewer than two requested ids exist', async () => {
    const dependencies = createDependencies()
    const store = createStore({ shots }, dependencies)

    await store.getState().mergeShots([11, 999])

    expect(dependencies.notifier.warning).toHaveBeenCalledWith('请至少选择两条分镜进行合并')
    expect(dependencies.shotApi.updateShot).not.toHaveBeenCalled()
  })

  it('merges by shotNo, separates text with a blank line, deletes the rest and clears selection', async () => {
    const dependencies = createDependencies()
    const store = createStore(
      { selectedShotIds: new Set([11, 22, 33]), shots: [shots[2], shots[0], shots[1]] },
      dependencies,
    )

    await store.getState().mergeShots([33, 11, 22])

    expect(dependencies.shotApi.updateShot).toHaveBeenCalledWith(
      1,
      11,
      '第一幕\n\n第二幕\n\n第三幕',
    )
    expect(dependencies.shotApi.deleteShot).toHaveBeenNthCalledWith(1, 1, 22)
    expect(dependencies.shotApi.deleteShot).toHaveBeenNthCalledWith(2, 1, 33)
    expect(dependencies.shotApi.getProjectShots).toHaveBeenCalledOnce()
    expect(store.getState().hasSelection).toBe(false)
    expect(store.getState().historyIndex).toBe(0)
  })

  it('deleteShot removes the deleted id from selection after refresh', async () => {
    const dependencies = createDependencies()
    const store = createStore({ selectedShotIds: new Set([11, 22]), shots }, dependencies)

    await store.getState().deleteShot(22)

    expect(dependencies.shotApi.deleteShot).toHaveBeenCalledWith(1, 22)
    expect(dependencies.shotApi.getProjectShots).toHaveBeenCalledOnce()
    expect([...store.getState().selectedShotIds]).toEqual([11])
    expect(store.getState().historyIndex).toBe(0)
  })
})
