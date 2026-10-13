import { Clapperboard } from 'lucide-react'

import { AssetTab, type AssetTabProps } from './AssetTab'
import type { ScenePanelAsset } from './default-panel-assets'

type SceneTabProps = Omit<
  AssetTabProps<ScenePanelAsset>,
  | 'createLabel'
  | 'emptyDescription'
  | 'fallbackIcon'
  | 'libraryLabel'
  | 'searchPlaceholder'
>

export function SceneTab(props: SceneTabProps) {
  return (
    <AssetTab
      {...props}
      createLabel="创建场景"
      emptyDescription="暂无场景，点击“创建场景”开始"
      fallbackIcon={Clapperboard}
      libraryLabel="从库添加"
      searchPlaceholder="搜索场景..."
    />
  )
}
