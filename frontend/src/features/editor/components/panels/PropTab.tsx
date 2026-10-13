import { Package } from 'lucide-react'

import { AssetTab, type AssetTabProps } from './AssetTab'
import type { PropPanelAsset } from './default-panel-assets'

type PropTabProps = Omit<
  AssetTabProps<PropPanelAsset>,
  | 'createLabel'
  | 'emptyDescription'
  | 'fallbackIcon'
  | 'libraryLabel'
  | 'searchPlaceholder'
>

export function PropTab(props: PropTabProps) {
  return (
    <AssetTab
      {...props}
      createLabel="创建道具"
      emptyDescription="暂无道具，点击“创建道具”开始"
      fallbackIcon={Package}
      libraryLabel="从库添加"
      searchPlaceholder="搜索道具..."
    />
  )
}
