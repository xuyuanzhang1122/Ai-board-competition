import type {
  CharacterLibraryVO,
  PropLibraryVO,
  SceneLibraryVO,
} from '@/shared/types/api'

export interface LibraryAssetMap {
  character: CharacterLibraryVO
  prop: PropLibraryVO
  scene: SceneLibraryVO
}

export type LibraryAssetType = keyof LibraryAssetMap

export type LibraryAssetData<T extends LibraryAssetType> = LibraryAssetMap[T]

export type LibraryAsset<T extends LibraryAssetType = LibraryAssetType> = {
  type: T
  data: LibraryAssetData<T>
}

export interface LibraryCategory {
  id: number
  name: string
}

export interface LibraryModalState<T extends LibraryAssetType> {
  addingId: number | null
  assets: LibraryAsset<T>[]
  categories: LibraryCategory[]
  changingCategoryId: number | null
  creatingCategory: boolean
  deletingId: number | null
  deletingThumbnailId: number | null
  loading: boolean
  newCategoryName: string
  searchQuery: string
  selectedCategoryId: number | null
  showCategorySelect: number | null
  showCreateCategory: boolean
}

export interface LibraryApiSet<T extends LibraryAssetType> {
  createCategory: (data: { name: string }) => Promise<LibraryCategory>
  createFromLibrary: (projectId: number, libraryId: number) => Promise<unknown>
  deleteLibraryAsset: (libraryId: number) => Promise<unknown>
  getAssets: (categoryId?: number) => Promise<LibraryAssetData<T>[]>
  getCategories: () => Promise<LibraryCategory[]>
  updateLibraryAsset: (
    libraryId: number,
    data: {
      name?: string
      description?: string
      categoryId?: number | null
      thumbnailUrl?: string | null
    },
  ) => Promise<unknown>
}

export interface LibraryModalOperations<T extends LibraryAssetType> {
  addToProject: (asset: LibraryAssetData<T>) => Promise<void>
  changeCategory: (asset: LibraryAssetData<T>, categoryId: number | null) => Promise<void>
  createCategory: () => Promise<void>
  deleteAsset: (asset: LibraryAssetData<T>) => Promise<void>
  deleteThumbnail?: (asset: LibraryAssetData<T>) => Promise<void>
  load: () => Promise<void>
  setNewCategoryName: (name: string) => void
  setSearchQuery: (query: string) => void
  setSelectedCategoryId: (id: number | null) => void
  setShowCategorySelect: (id: number | null) => void
  setShowCreateCategory: (show: boolean) => void
}

export interface EditorNotifier {
  error: (message: string) => void
  success: (message: string) => void
  warning: (message: string) => void
}

export interface UseLibraryModalOptions<T extends LibraryAssetType> {
  api: LibraryApiSet<T>
  /**
   * 若返回非空字符串，则阻止删除并提示该错误信息。
   * 由适配组件注入分镜绑定检查。
   */
  canDelete?: (asset: LibraryAssetData<T>) => string | undefined
  clearLocalImageHistoryByName: (name: string) => void
  /** Testable confirmation seam; production defaults to the shared centered dialog. */
  confirm?: (message: string) => Promise<boolean>
  /**
   * Character 适配片专用：删除缩略图的具体实现。
   */
  deleteThumbnail?: (asset: LibraryAssetData<T>) => Promise<void>
  fetchProjectAssets: () => Promise<void>
  notifier: EditorNotifier
  onAdded: () => void
  onClose: () => void
  projectId: number
  type: T
}
