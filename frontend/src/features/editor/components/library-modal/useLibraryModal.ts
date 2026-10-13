import { useEffect, useReducer, useRef } from 'react'

import { confirmAction } from '@/shared/feedback/feedback'

import type {
  LibraryAsset,
  LibraryAssetData,
  LibraryAssetType,
  LibraryModalOperations,
  LibraryModalState,
  UseLibraryModalOptions,
} from './types'

export function typeLabel(type: LibraryAssetType): string {
  switch (type) {
    case 'character': {
      return '角色'
    }
    case 'scene': {
      return '场景'
    }
    case 'prop': {
      return '道具'
    }
    default: {
      return '资产'
    }
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function createInitialState<T extends LibraryAssetType>(): LibraryModalState<T> {
  return {
    assets: [],
    categories: [],
    loading: false,
    selectedCategoryId: null,
    searchQuery: '',
    addingId: null,
    deletingId: null,
    changingCategoryId: null,
    deletingThumbnailId: null,
    showCreateCategory: false,
    newCategoryName: '',
    creatingCategory: false,
    showCategorySelect: null,
  }
}

export function filterLibraryAssets<T extends LibraryAssetType>(
  assets: LibraryAsset<T>[],
  query: string,
  categoryId: number | null,
): LibraryAsset<T>[] {
  let result = assets

  if (categoryId !== null) {
    result = result.filter((asset) => asset.data.categoryId === categoryId)
  }

  const trimmed = query.trim().toLowerCase()
  if (trimmed) {
    result = result.filter((asset) => {
      const name = asset.data.name.toLowerCase()
      const description = String(asset.data.description ?? '').toLowerCase()
      return name.includes(trimmed) || description.includes(trimmed)
    })
  }

  return result
}

export interface LibraryModalLogic<T extends LibraryAssetType> {
  getState: () => LibraryModalState<T>
  operations: LibraryModalOperations<T>
  subscribe: (listener: () => void) => () => void
}

export function createLibraryModalLogic<T extends LibraryAssetType>(
  options: UseLibraryModalOptions<T>,
): LibraryModalLogic<T> {
  const {
    type,
    projectId,
    api,
    fetchProjectAssets,
    clearLocalImageHistoryByName,
    onAdded,
    notifier,
    canDelete,
    deleteThumbnail: deleteThumbnailImpl,
  } = options

  const state = createInitialState<T>()
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  const setState = (updater: (draft: LibraryModalState<T>) => void) => {
    updater(state)
    emit()
  }

  const getState = () => state

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const load = async () => {
    setState((draft) => {
      draft.loading = true
    })
    try {
      const [categories, assets] = await Promise.all([
        api.getCategories(),
        api.getAssets(),
      ])
      setState((draft) => {
        draft.categories = categories
        draft.assets = assets.map(
          (data) =>
            ({
              type,
              data,
            }) as LibraryAsset<T>,
        )
        draft.loading = false
      })
    } catch (error) {
      notifier.error(errorMessage(error, `加载${typeLabel(type)}库失败`))
      setState((draft) => {
        draft.loading = false
      })
    }
  }

  const setSelectedCategoryId = (id: number | null) => {
    setState((draft) => {
      draft.selectedCategoryId = id
    })
  }

  const setSearchQuery = (query: string) => {
    setState((draft) => {
      draft.searchQuery = query
    })
  }

  const setNewCategoryName = (name: string) => {
    setState((draft) => {
      draft.newCategoryName = name
    })
  }

  const setShowCreateCategory = (show: boolean) => {
    setState((draft) => {
      draft.showCreateCategory = show
      if (!show) draft.newCategoryName = ''
    })
  }

  const setShowCategorySelect = (id: number | null) => {
    setState((draft) => {
      draft.showCategorySelect = id
    })
  }

  const createCategory = async () => {
    const name = state.newCategoryName.trim()
    if (!name) {
      notifier.warning('请输入分类名称')
      return
    }
    setState((draft) => {
      draft.creatingCategory = true
    })
    try {
      const category = await api.createCategory({ name })
      setState((draft) => {
        draft.categories.push(category)
        draft.newCategoryName = ''
        draft.showCreateCategory = false
        draft.creatingCategory = false
      })
      notifier.success('分类创建成功')
    } catch (error) {
      notifier.error(errorMessage(error, '创建分类失败'))
      setState((draft) => {
        draft.creatingCategory = false
      })
    }
  }

  const changeCategory = async (asset: LibraryAssetData<T>, categoryId: number | null) => {
    setState((draft) => {
      draft.changingCategoryId = asset.id
    })
    try {
      await api.updateLibraryAsset(asset.id, { categoryId })
      setState((draft) => {
        const index = draft.assets.findIndex((item) => item.data.id === asset.id)
        if (index !== -1) {
          draft.assets[index] = {
            ...draft.assets[index],
            data: { ...draft.assets[index].data, categoryId },
          }
        }
        draft.changingCategoryId = null
        draft.showCategorySelect = null
      })
      notifier.success('分类修改成功')
    } catch (error) {
      notifier.error(errorMessage(error, '修改分类失败'))
      setState((draft) => {
        draft.changingCategoryId = null
      })
    }
  }

  const addToProject = async (asset: LibraryAssetData<T>) => {
    setState((draft) => {
      draft.addingId = asset.id
    })
    try {
      await api.createFromLibrary(projectId, asset.id)
      await fetchProjectAssets()
      onAdded()
      notifier.success(`已添加${typeLabel(type)}：${asset.name}`)
    } catch (error) {
      notifier.error(errorMessage(error, `添加${typeLabel(type)}失败`))
    } finally {
      setState((draft) => {
        draft.addingId = null
      })
    }
  }

  const deleteAsset = async (asset: LibraryAssetData<T>) => {
    const blockMessage = canDelete?.(asset)
    if (blockMessage) {
      notifier.error(blockMessage)
      return
    }

    const message = `确定要删除${typeLabel(type)}「${asset.name}」吗？此操作不可恢复。`
    const confirmed = options.confirm
      ? await options.confirm(message)
      : await confirmAction(message, {
        confirmLabel: `删除${typeLabel(type)}`,
        danger: true,
        title: `删除${typeLabel(type)}`,
      })
    if (!confirmed) return

    setState((draft) => {
      draft.deletingId = asset.id
    })
    try {
      await api.deleteLibraryAsset(asset.id)
      setState((draft) => {
        draft.assets = draft.assets.filter((item) => item.data.id !== asset.id)
      })
      clearLocalImageHistoryByName(asset.name)
      await fetchProjectAssets()
      notifier.success(`${typeLabel(type)}删除成功`)
    } catch (error) {
      notifier.error(errorMessage(error, `删除${typeLabel(type)}失败`))
      setState((draft) => {
        draft.deletingId = null
      })
    }
  }

  const deleteThumbnail = deleteThumbnailImpl
    ? async (asset: LibraryAssetData<T>) => {
        setState((draft) => {
          draft.deletingThumbnailId = asset.id
        })
        try {
          await deleteThumbnailImpl(asset)
          setState((draft) => {
            const index = draft.assets.findIndex((item) => item.data.id === asset.id)
            if (index !== -1) {
              draft.assets[index] = {
                ...draft.assets[index],
                data: { ...draft.assets[index].data, thumbnailUrl: null },
              }
            }
            draft.deletingThumbnailId = null
          })
          notifier.success('图片删除成功')
        } catch (error) {
          notifier.error(errorMessage(error, '删除图片失败'))
          setState((draft) => {
            draft.deletingThumbnailId = null
          })
        }
      }
    : undefined

  const operations: LibraryModalOperations<T> = {
    addToProject,
    changeCategory,
    createCategory,
    deleteAsset,
    deleteThumbnail,
    load,
    setNewCategoryName,
    setSearchQuery,
    setSelectedCategoryId,
    setShowCategorySelect,
    setShowCreateCategory,
  }

  return { getState, operations, subscribe }
}

export function useLibraryModal<T extends LibraryAssetType>(
  options: UseLibraryModalOptions<T>,
): {
  operations: LibraryModalOperations<T>
  state: LibraryModalState<T>
} {
  const logicRef = useRef<LibraryModalLogic<T> | null>(null)
  if (!logicRef.current) {
    logicRef.current = createLibraryModalLogic(options)
  }
  const logic = logicRef.current

  const [, forceRender] = useReducer((count: number) => count + 1, 0)

  useEffect(() => logic.subscribe(forceRender), [logic])

  useEffect(() => {
    void logic.operations.load()
    // logic 实例生命周期与弹窗打开周期一致，只加载一次。
  }, [logic])

  return { operations: logic.operations, state: logic.getState() }
}
