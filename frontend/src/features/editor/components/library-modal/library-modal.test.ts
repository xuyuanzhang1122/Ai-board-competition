import { describe, expect, it, vi } from 'vitest'

import type {
  CharacterLibraryVO,
  PropLibraryVO,
  SceneLibraryVO,
} from '@/shared/types/api'

import type { LibraryAsset, LibraryAssetData, LibraryAssetType, LibraryCategory } from './types'
import {
  createLibraryModalLogic,
  filterLibraryAssets,
  typeLabel,
} from './useLibraryModal'

const mockConfirmResponse = (value: boolean) => vi.fn(async () => value)

function createNotifier() {
  return {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  }
}

function makeCharacter(id: number, name: string, categoryId: number | null = null): CharacterLibraryVO {
  return {
    id,
    categoryId,
    name,
    description: `${name}描述`,
    thumbnailUrl: null,
    createdAt: '2026-06-28T00:00:00Z',
  }
}

function makeScene(id: number, name: string, categoryId: number | null = null): SceneLibraryVO {
  return {
    id,
    categoryId,
    name,
    description: `${name}描述`,
    thumbnailUrl: null,
    createdAt: '2026-06-28T00:00:00Z',
  }
}

function makeProp(id: number, name: string, categoryId: number | null = null): PropLibraryVO {
  return {
    id,
    categoryId,
    categoryName: null,
    name,
    description: `${name}描述`,
    thumbnailUrl: null,
    referenceCount: 0,
    createdAt: '2026-06-28T00:00:00Z',
    updatedAt: '2026-06-28T00:00:00Z',
  }
}

function toLibraryAsset<T extends LibraryAssetType>(
  type: T,
  data: LibraryAssetData<T>,
): LibraryAsset<T> {
  return { type, data } as LibraryAsset<T>
}

describe('library modal helpers', () => {
  it('labels asset types in Chinese', () => {
    expect(typeLabel('character')).toBe('角色')
    expect(typeLabel('scene')).toBe('场景')
    expect(typeLabel('prop')).toBe('道具')
  })

  it('filters assets by category and query', () => {
    const assets: LibraryAsset[] = [
      toLibraryAsset('character', makeCharacter(1, '林默', 1)),
      toLibraryAsset('character', makeCharacter(2, '苏晚', 2)),
      toLibraryAsset('character', makeCharacter(3, '车站', null)),
    ]

    expect(filterLibraryAssets(assets, '', null)).toHaveLength(3)
    expect(filterLibraryAssets(assets, '', 1)).toHaveLength(1)
    expect(filterLibraryAssets(assets, '林', null)).toHaveLength(1)
    expect(filterLibraryAssets(assets, '描述', null)).toHaveLength(3)
    expect(filterLibraryAssets(assets, 'none', null)).toHaveLength(0)
  })
})

describe('library modal logic', () => {
  it('loads categories and assets on initialization', async () => {
    const categories: LibraryCategory[] = [{ id: 1, name: '主角' }]
    const assets = [makeCharacter(1, '林默')]
    const api = {
      getCategories: vi.fn(async () => categories),
      getAssets: vi.fn(async () => assets),
      createFromLibrary: vi.fn(),
      updateLibraryAsset: vi.fn(),
      deleteLibraryAsset: vi.fn(),
      createCategory: vi.fn(),
    }
    const notifier = createNotifier()
    const logic = createLibraryModalLogic<'character'>({
      type: 'character',
      projectId: 7,
      api,
      fetchProjectAssets: vi.fn(),
      clearLocalImageHistoryByName: vi.fn(),
      onAdded: vi.fn(),
      onClose: vi.fn(),
      notifier,
    })

    expect(logic.getState().loading).toBe(false)
    await logic.operations.load()

    expect(api.getCategories).toHaveBeenCalledTimes(1)
    expect(api.getAssets).toHaveBeenCalledTimes(1)
    expect(logic.getState().categories).toEqual(categories)
    expect(logic.getState().assets).toHaveLength(1)
    expect(logic.getState().assets[0].data.id).toBe(1)
    expect(logic.getState().loading).toBe(false)
  })

  it('uses library IDs for add / change-category / delete', async () => {
    const confirm = mockConfirmResponse(true)
    const asset = makeCharacter(11, '林默')
    const api = {
      getCategories: vi.fn(async () => []),
      getAssets: vi.fn(async () => [asset]),
      createFromLibrary: vi.fn(async () => ({})),
      updateLibraryAsset: vi.fn(async () => undefined),
      deleteLibraryAsset: vi.fn(async () => undefined),
      createCategory: vi.fn(),
    }
    const fetchProjectAssets = vi.fn()
    const notifier = createNotifier()
    const logic = createLibraryModalLogic<'character'>({
      type: 'character',
      projectId: 7,
      api,
      fetchProjectAssets,
      clearLocalImageHistoryByName: vi.fn(),
      confirm,
      onAdded: vi.fn(),
      onClose: vi.fn(),
      notifier,
    })
    await logic.operations.load()

    await logic.operations.addToProject(asset)
    expect(api.createFromLibrary).toHaveBeenCalledWith(7, 11)

    await logic.operations.changeCategory(asset, 3)
    expect(api.updateLibraryAsset).toHaveBeenCalledWith(11, expect.objectContaining({ categoryId: 3 }))

    await logic.operations.deleteAsset(asset)
    expect(api.deleteLibraryAsset).toHaveBeenCalledWith(11)
  })

  it('refreshes project assets and notifies after adding', async () => {
    const asset = makeCharacter(5, '苏晚')
    const onAdded = vi.fn()
    const fetchProjectAssets = vi.fn(async () => undefined)
    const api = {
      getCategories: vi.fn(async () => []),
      getAssets: vi.fn(async () => [asset]),
      createFromLibrary: vi.fn(async () => ({})),
      updateLibraryAsset: vi.fn(),
      deleteLibraryAsset: vi.fn(),
      createCategory: vi.fn(),
    }
    const notifier = createNotifier()
    const logic = createLibraryModalLogic<'character'>({
      type: 'character',
      projectId: 7,
      api,
      fetchProjectAssets,
      clearLocalImageHistoryByName: vi.fn(),
      onAdded,
      onClose: vi.fn(),
      notifier,
    })

    await logic.operations.addToProject(asset)

    expect(fetchProjectAssets).toHaveBeenCalledTimes(1)
    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(notifier.success).toHaveBeenCalledWith('已添加角色：苏晚')
  })

  it('creates category and appends it to the list', async () => {
    const newCategory: LibraryCategory = { id: 9, name: '反派' }
    const api = {
      getCategories: vi.fn(async () => []),
      getAssets: vi.fn(async () => []),
      createFromLibrary: vi.fn(),
      updateLibraryAsset: vi.fn(),
      deleteLibraryAsset: vi.fn(),
      createCategory: vi.fn(async () => newCategory),
    }
    const notifier = createNotifier()
    const logic = createLibraryModalLogic<'character'>({
      type: 'character',
      projectId: 7,
      api,
      fetchProjectAssets: vi.fn(),
      clearLocalImageHistoryByName: vi.fn(),
      onAdded: vi.fn(),
      onClose: vi.fn(),
      notifier,
    })

    logic.operations.setNewCategoryName('反派')
    await logic.operations.createCategory()

    expect(api.createCategory).toHaveBeenCalledWith({ name: '反派' })
    expect(logic.getState().categories).toEqual([newCategory])
    expect(logic.getState().newCategoryName).toBe('')
    expect(logic.getState().showCreateCategory).toBe(false)
    expect(notifier.success).toHaveBeenCalledWith('分类创建成功')
  })

  it('warns when creating category with empty name', async () => {
    const api = {
      getCategories: vi.fn(async () => []),
      getAssets: vi.fn(async () => []),
      createFromLibrary: vi.fn(),
      updateLibraryAsset: vi.fn(),
      deleteLibraryAsset: vi.fn(),
      createCategory: vi.fn(),
    }
    const notifier = createNotifier()
    const logic = createLibraryModalLogic<'prop'>({
      type: 'prop',
      projectId: 7,
      api,
      fetchProjectAssets: vi.fn(),
      clearLocalImageHistoryByName: vi.fn(),
      onAdded: vi.fn(),
      onClose: vi.fn(),
      notifier,
    })

    logic.operations.setNewCategoryName('   ')
    await logic.operations.createCategory()

    expect(api.createCategory).not.toHaveBeenCalled()
    expect(notifier.warning).toHaveBeenCalledWith('请输入分类名称')
  })

  it('updates local categoryId after change-category succeeds', async () => {
    const asset = makeCharacter(7, '林默', 1)
    const api = {
      getCategories: vi.fn(async () => []),
      getAssets: vi.fn(async () => [asset]),
      createFromLibrary: vi.fn(),
      updateLibraryAsset: vi.fn(async () => undefined),
      deleteLibraryAsset: vi.fn(),
      createCategory: vi.fn(),
    }
    const notifier = createNotifier()
    const logic = createLibraryModalLogic<'character'>({
      type: 'character',
      projectId: 7,
      api,
      fetchProjectAssets: vi.fn(),
      clearLocalImageHistoryByName: vi.fn(),
      onAdded: vi.fn(),
      onClose: vi.fn(),
      notifier,
    })
    await logic.operations.load()

    await logic.operations.changeCategory(asset, 2)

    expect(api.updateLibraryAsset).toHaveBeenCalledWith(7, expect.objectContaining({ categoryId: 2 }))
    expect(logic.getState().assets[0].data.categoryId).toBe(2)
    expect(logic.getState().showCategorySelect).toBeNull()
  })

  it('blocks scene/prop deletion when bound to shots and does not call delete API', async () => {
    const asset = makeScene(4, '旧车站')
    const api = {
      getCategories: vi.fn(async () => []),
      getAssets: vi.fn(async () => [asset]),
      createFromLibrary: vi.fn(),
      updateLibraryAsset: vi.fn(),
      deleteLibraryAsset: vi.fn(),
      createCategory: vi.fn(),
    }
    const notifier = createNotifier()
    const logic = createLibraryModalLogic<'scene'>({
      type: 'scene',
      projectId: 7,
      api,
      fetchProjectAssets: vi.fn(),
      clearLocalImageHistoryByName: vi.fn(),
      onAdded: vi.fn(),
      onClose: vi.fn(),
      notifier,
      canDelete: () => '场景「旧车站」已被绑定到分镜1，请先在分镜表中解绑后再删除',
    })

    await logic.operations.deleteAsset(asset)

    expect(api.deleteLibraryAsset).not.toHaveBeenCalled()
    expect(notifier.error).toHaveBeenCalledWith(
      '场景「旧车站」已被绑定到分镜1，请先在分镜表中解绑后再删除',
    )
  })

  it('does not reduce asset list when delete API fails and resets deletingId', async () => {
    const confirm = mockConfirmResponse(true)
    const asset = makeProp(8, '怀表')
    const api = {
      getCategories: vi.fn(async () => []),
      getAssets: vi.fn(async () => [asset]),
      createFromLibrary: vi.fn(),
      updateLibraryAsset: vi.fn(),
      deleteLibraryAsset: vi.fn(async () => {
        throw new Error('network error')
      }),
      createCategory: vi.fn(),
    }
    const notifier = createNotifier()
    const logic = createLibraryModalLogic<'prop'>({
      type: 'prop',
      projectId: 7,
      api,
      fetchProjectAssets: vi.fn(),
      clearLocalImageHistoryByName: vi.fn(),
      confirm,
      onAdded: vi.fn(),
      onClose: vi.fn(),
      notifier,
    })
    await logic.operations.load()

    await logic.operations.deleteAsset(asset)

    expect(logic.getState().assets).toHaveLength(1)
    expect(logic.getState().deletingId).toBeNull()
    expect(notifier.error).toHaveBeenCalledWith('network error')
  })

  it('aborts deletion when user cancels the confirmation', async () => {
    const confirm = mockConfirmResponse(false)
    const asset = makeCharacter(2, '林默')
    const api = {
      getCategories: vi.fn(async () => []),
      getAssets: vi.fn(async () => [asset]),
      createFromLibrary: vi.fn(),
      updateLibraryAsset: vi.fn(),
      deleteLibraryAsset: vi.fn(),
      createCategory: vi.fn(),
    }
    const notifier = createNotifier()
    const logic = createLibraryModalLogic<'character'>({
      type: 'character',
      projectId: 7,
      api,
      fetchProjectAssets: vi.fn(),
      clearLocalImageHistoryByName: vi.fn(),
      confirm,
      onAdded: vi.fn(),
      onClose: vi.fn(),
      notifier,
    })

    await logic.operations.deleteAsset(asset)

    expect(api.deleteLibraryAsset).not.toHaveBeenCalled()
  })

  it('clears local image history and refreshes project assets after deletion', async () => {
    const confirm = mockConfirmResponse(true)
    const asset = makeCharacter(3, '苏晚')
    const api = {
      getCategories: vi.fn(async () => []),
      getAssets: vi.fn(async () => [asset]),
      createFromLibrary: vi.fn(),
      updateLibraryAsset: vi.fn(),
      deleteLibraryAsset: vi.fn(async () => undefined),
      createCategory: vi.fn(),
    }
    const fetchProjectAssets = vi.fn(async () => undefined)
    const clearLocalImageHistoryByName = vi.fn()
    const notifier = createNotifier()
    const logic = createLibraryModalLogic<'character'>({
      type: 'character',
      projectId: 7,
      api,
      fetchProjectAssets,
      clearLocalImageHistoryByName,
      confirm,
      onAdded: vi.fn(),
      onClose: vi.fn(),
      notifier,
    })
    await logic.operations.load()

    await logic.operations.deleteAsset(asset)

    expect(logic.getState().assets).toHaveLength(0)
    expect(clearLocalImageHistoryByName).toHaveBeenCalledWith('苏晚')
    expect(fetchProjectAssets).toHaveBeenCalledTimes(1)
  })
})
