import { Button, Input, Modal } from '@lobehub/ui'
import type { LucideIcon } from 'lucide-react'
import { Loader2, Plus } from 'lucide-react'
import { useMemo } from 'react'

import { confirmAction } from '@/shared/feedback/feedback'

import type {
  LibraryAsset,
  LibraryAssetType,
  LibraryModalOperations,
  LibraryModalState,
} from './types'
import { filterLibraryAssets, typeLabel } from './useLibraryModal'

interface LibraryModalShellProps<T extends LibraryAssetType> {
  addLabel: string
  deleteLabel: string
  emptyDescription: string
  onClose: () => void
  operations: LibraryModalOperations<T>
  placeholderIcon: LucideIcon
  searchPlaceholder: string
  state: LibraryModalState<T>
  title: string
  type: T
}

export function LibraryModalShell<T extends LibraryAssetType>({
  type,
  state,
  operations,
  title,
  placeholderIcon: PlaceholderIcon,
  searchPlaceholder,
  emptyDescription,
  addLabel,
  deleteLabel,
  onClose,
}: LibraryModalShellProps<T>) {
  const filteredAssets = useMemo(
    () => filterLibraryAssets(state.assets, state.searchQuery, state.selectedCategoryId),
    [state.assets, state.searchQuery, state.selectedCategoryId],
  )

  return (
    <Modal
      centered
      open
      title={title}
      width={900}
      footer={
        <Button loading={state.loading} onClick={onClose}>
          关闭
        </Button>
      }
      onCancel={onClose}
    >
      <div className="flex max-h-[80vh] overflow-hidden">
        <aside className="w-48 shrink-0 border-r border-slate-200 p-4">
          <h3 className="mb-3 text-xs font-bold text-slate-500">分类</h3>
          <div className="space-y-1">
            <CategoryButton
              active={state.selectedCategoryId === null}
              onClick={() => operations.setSelectedCategoryId(null)}
            >
              全部
            </CategoryButton>
            {state.categories.map((category) => (
              <CategoryButton
                active={state.selectedCategoryId === category.id}
                key={category.id}
                onClick={() => operations.setSelectedCategoryId(category.id)}
              >
                {category.name}
              </CategoryButton>
            ))}

            <div className="mt-3 border-t border-slate-200 pt-3">
              {state.showCreateCategory ? (
                <div className="space-y-2">
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                    placeholder="分类名称..."
                    type="text"
                    value={state.newCategoryName}
                    onChange={(event) => operations.setNewCategoryName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void operations.createCategory()
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      className="flex-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                      disabled={state.creatingCategory}
                      type="button"
                      onClick={() => void operations.createCategory()}
                    >
                      {state.creatingCategory ? '创建中...' : '确定'}
                    </button>
                    <button
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200"
                      type="button"
                      onClick={() => operations.setShowCreateCategory(false)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  type="button"
                  onClick={() => operations.setShowCreateCategory(true)}
                >
                  <Plus className="size-4" />
                  添加分类
                </button>
              )}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <Input
              allowClear
              placeholder={searchPlaceholder}
              value={state.searchQuery}
              onChange={(event) => operations.setSearchQuery(event.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {state.loading ? (
              <div className="flex h-64 items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-5 animate-spin" />
                正在加载{typeLabel(type)}库…
              </div>
            ) : filteredAssets.length > 0 ? (
              <div className="grid grid-cols-4 gap-4">
                {filteredAssets.map((asset) => (
                  <LibraryCard
                    addLabel={addLabel}
                    asset={asset as LibraryAsset<T>}
                    deleteLabel={deleteLabel}
                    key={asset.data.id}
                    operations={operations}
                    placeholderIcon={PlaceholderIcon}
                    state={state}
                    type={type}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center text-slate-400">
                <PlaceholderIcon className="mb-4 size-16" />
                <p className="text-sm">
                  {state.searchQuery ? `未找到匹配的${typeLabel(type)}` : emptyDescription}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function CategoryButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active
          ? 'bg-slate-100 font-medium text-slate-900'
          : 'text-slate-600 hover:bg-slate-50'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

interface LibraryCardProps<T extends LibraryAssetType> {
  addLabel: string
  asset: LibraryAsset<T>
  deleteLabel: string
  operations: LibraryModalOperations<T>
  placeholderIcon: LucideIcon
  state: LibraryModalState<T>
  type: T
}

function LibraryCard<T extends LibraryAssetType>({
  asset,
  state,
  operations,
  placeholderIcon: PlaceholderIcon,
  addLabel,
  deleteLabel,
}: LibraryCardProps<T>) {
  const data = asset.data
  const isAdding = state.addingId === data.id
  const isDeleting = state.deletingId === data.id
  const isChanging = state.changingCategoryId === data.id
  const isDeletingThumbnail = state.deletingThumbnailId === data.id
  const showingCategorySelect = state.showCategorySelect === data.id
  const handleDeleteThumbnail = operations.deleteThumbnail

  return (
    <article className="group rounded-lg border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm">
      <div className="relative mb-2 aspect-square overflow-hidden rounded-lg bg-slate-50">
        {data.thumbnailUrl ? (
          <img
            alt={data.name}
            className="size-full object-cover"
            src={data.thumbnailUrl}
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <PlaceholderIcon className="size-12 text-slate-300" />
          </div>
        )}

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 p-2 opacity-0 transition-opacity group-hover:opacity-100">
          {showingCategorySelect ? (
            <div className="w-full">
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-slate-100 p-2">
                <CategoryOptionButton
                  active={data.categoryId === null}
                  disabled={isChanging}
                  onClick={() => void operations.changeCategory(data, null)}
                >
                  未分类
                </CategoryOptionButton>
                {state.categories.map((category) => (
                  <CategoryOptionButton
                    active={data.categoryId === category.id}
                    disabled={isChanging}
                    key={category.id}
                    onClick={() => void operations.changeCategory(data, category.id)}
                  >
                    {category.name}
                  </CategoryOptionButton>
                ))}
              </div>
              <button
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                type="button"
                onClick={() => operations.setShowCategorySelect(null)}
              >
                取消
              </button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <ActionButton
                disabled={isAdding}
                onClick={() => void operations.addToProject(data)}
              >
                {isAdding ? '添加中...' : addLabel}
              </ActionButton>

              <ActionButton
                onClick={() => operations.setShowCategorySelect(data.id)}
              >
                {data.categoryId ? '修改分类' : '添加到分类'}
              </ActionButton>

              {handleDeleteThumbnail && data.thumbnailUrl ? (
                <ActionButton
                  disabled={isDeletingThumbnail}
                  onClick={() => {
                    void confirmAction('确定要删除这张图片吗？', {
                      confirmLabel: '删除图片', danger: true, title: '删除图片',
                    }).then((confirmed) => {
                      if (confirmed) void handleDeleteThumbnail(data)
                    })
                  }}
                >
                  {isDeletingThumbnail ? '删除中...' : '删除图片'}
                </ActionButton>
              ) : null}

              <button
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                disabled={isDeleting}
                type="button"
                onClick={() => void operations.deleteAsset(data)}
              >
                {isDeleting ? '删除中...' : deleteLabel}
              </button>
            </div>
          )}
        </div>
      </div>

      <h4 className="mb-1 truncate text-sm font-medium text-slate-800" title={data.name}>
        {data.name}
      </h4>
      <p className="line-clamp-2 h-8 text-xs text-slate-500">
        {data.description || '暂无描述'}
      </p>
    </article>
  )
}

function CategoryOptionButton({
  active,
  children,
  disabled,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      disabled={disabled}
      type="button"
      className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors ${
        active
          ? 'bg-slate-200 font-medium text-slate-900'
          : 'text-slate-600 hover:bg-slate-200'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  )
}
