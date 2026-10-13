import type {
  CharacterLibraryVO,
  PropLibraryVO,
  SceneLibraryVO,
} from '@/shared/types/api'

import type { AssetEditPanelData } from '../../../panel-manager-store'

export type EditableAssetType = 'character' | 'scene' | 'prop'

export type AssetEditTab = 'custom' | 'local'

// Re-export the canonical panel payload so consumers stay in sync with the panel manager.
export type { AssetEditPanelData }

export interface AssetEditBase {
  assetId?: number
  assetName: string
  assetType: EditableAssetType
  projectId: number | null
  shotId?: number
}

export type LibraryAsset =
  | { type: 'character'; data: CharacterLibraryVO }
  | { type: 'scene'; data: SceneLibraryVO }
  | { type: 'prop'; data: PropLibraryVO }

export interface CombinedHistoryItem {
  createdAt: string
  id: number
  prompt: string | null
  source: 'local' | 'server'
  url: string
  versionNo: number
}
