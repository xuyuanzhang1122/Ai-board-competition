import { Button, Input, Select } from '@lobehub/ui'
import type { LucideIcon } from 'lucide-react'

import { AssetGrid } from './AssetGrid'
import type { CategoryOption, DefaultPanelAsset } from './default-panel-assets'

export interface AssetTabProps<T extends DefaultPanelAsset> {
  assets: readonly T[]
  categories: readonly CategoryOption[]
  createLabel: string
  emptyDescription: string
  fallbackIcon: LucideIcon
  libraryLabel: string
  onAssetClick: (asset: T) => void
  onCategoryChange: (categoryId: number | null) => void
  onCreate: () => void
  onOpenLibrary: () => void
  onQueryChange: (query: string) => void
  query: string
  searchPlaceholder: string
  selectedCategoryId: number | null
}

export function AssetTab<T extends DefaultPanelAsset>({
  assets,
  categories,
  createLabel,
  emptyDescription,
  fallbackIcon,
  libraryLabel,
  onAssetClick,
  onCategoryChange,
  onCreate,
  onOpenLibrary,
  onQueryChange,
  query,
  searchPlaceholder,
  selectedCategoryId,
}: AssetTabProps<T>) {
  const categoryOptions = [
    { label: '全部分类', value: 'all' },
    ...categories.map((category) => ({ label: category.name, value: String(category.id) })),
  ]

  return (
    <section aria-label={createLabel.replace('创建', '')}>
      <div className="border-b border-slate-200 p-4">
        <div className="flex gap-2">
          <Input
            allowClear
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <Select
            options={categoryOptions}
            style={{ minWidth: 112 }}
            value={selectedCategoryId === null ? 'all' : String(selectedCategoryId)}
            onChange={(value) =>
              onCategoryChange(value === 'all' ? null : Number.parseInt(String(value), 10))
            }
          />
        </div>
        <div className="mt-3 flex gap-2">
          <Button block onClick={onCreate}>
            {createLabel}
          </Button>
          <Button onClick={onOpenLibrary}>{libraryLabel}</Button>
        </div>
      </div>

      <AssetGrid
        assets={assets}
        emptyDescription={emptyDescription}
        fallbackIcon={fallbackIcon}
        onAssetClick={onAssetClick}
      />
    </section>
  )
}
