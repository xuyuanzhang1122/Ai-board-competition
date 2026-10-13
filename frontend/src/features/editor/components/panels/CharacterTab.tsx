import { UserRound } from 'lucide-react'

import { AssetTab, type AssetTabProps } from './AssetTab'
import type { CharacterPanelAsset } from './default-panel-assets'

type CharacterTabProps = Omit<
  AssetTabProps<CharacterPanelAsset>,
  | 'createLabel'
  | 'emptyDescription'
  | 'fallbackIcon'
  | 'libraryLabel'
  | 'searchPlaceholder'
>

export function CharacterTab(props: CharacterTabProps) {
  return (
    <AssetTab
      {...props}
      createLabel="创建角色"
      emptyDescription="暂无角色，点击“创建角色”开始"
      fallbackIcon={UserRound}
      libraryLabel="从库添加"
      searchPlaceholder="搜索角色..."
    />
  )
}
