import { create } from 'zustand'

export type HomeTab = 'projects' | 'folders'

interface HomeUiState {
  activeTab: HomeTab
  clearFolderFilter: () => void
  currentPage: number
  reset: () => void
  selectedFolderId: number | null
  selectedFolderName: string
  selectFolder: (id: number, name: string) => void
  setActiveTab: (tab: HomeTab) => void
  setCurrentPage: (page: number, totalPages: number) => void
}

const initialState = {
  activeTab: 'projects' as const,
  currentPage: 1,
  selectedFolderId: null,
  selectedFolderName: '',
}

export const useHomeUiStore = create<HomeUiState>((set) => ({
  ...initialState,

  clearFolderFilter() {
    set({ currentPage: 1, selectedFolderId: null, selectedFolderName: '' })
  },

  reset() {
    set(initialState)
  },

  selectFolder(id, name) {
    set({
      activeTab: 'projects',
      currentPage: 1,
      selectedFolderId: id,
      selectedFolderName: name,
    })
  },

  setActiveTab(tab) {
    set({
      activeTab: tab,
      currentPage: 1,
      ...(tab === 'folders' ? { selectedFolderId: null, selectedFolderName: '' } : {}),
    })
  },

  setCurrentPage(page, totalPages) {
    set({ currentPage: Math.min(Math.max(page, 1), Math.max(totalPages, 1)) })
  },
}))
