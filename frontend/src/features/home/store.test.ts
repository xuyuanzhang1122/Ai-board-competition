import { beforeEach, describe, expect, it } from 'vitest'

import { useHomeUiStore } from './store'

describe('home UI store', () => {
  beforeEach(() => {
    useHomeUiStore.getState().reset()
  })

  it('opens a folder in the project tab and resets pagination', () => {
    useHomeUiStore.getState().setCurrentPage(3, 5)
    useHomeUiStore.getState().selectFolder(12, '短片项目')

    expect(useHomeUiStore.getState()).toMatchObject({
      activeTab: 'projects',
      currentPage: 1,
      selectedFolderId: 12,
      selectedFolderName: '短片项目',
    })
  })

  it('clears the folder filter when switching to folders', () => {
    useHomeUiStore.getState().selectFolder(12, '短片项目')
    useHomeUiStore.getState().setActiveTab('folders')

    expect(useHomeUiStore.getState()).toMatchObject({
      activeTab: 'folders',
      currentPage: 1,
      selectedFolderId: null,
      selectedFolderName: '',
    })
  })

  it('keeps pagination inside the available range', () => {
    useHomeUiStore.getState().setCurrentPage(0, 4)
    expect(useHomeUiStore.getState().currentPage).toBe(1)

    useHomeUiStore.getState().setCurrentPage(9, 4)
    expect(useHomeUiStore.getState().currentPage).toBe(4)
  })
})
