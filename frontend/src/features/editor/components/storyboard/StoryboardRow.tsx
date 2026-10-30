import { Checkbox, Tag } from '@lobehub/ui'
import { memo } from 'react'

import { confirmAction, notify } from '@/shared/feedback/feedback'
import type { AssetStatusVO, StoryboardShotVO } from '@/shared/types/api'

import { shotApi } from '../../api'
import { usePanelManagerStore } from '../../panel-manager-store'
import { useEditorStore } from '../../store'
import { getVideoFallbackThumbnail } from '../panels/video-generation'
import { CharacterBindingsCell } from './CharacterBindingsCell'
import { PropBindingsCell } from './PropBindingsCell'
import { SceneBindingCell } from './SceneBindingCell'
import { ShotMediaCell, type ShotMediaType } from './ShotMediaCell'
import { ShotRowActions } from './ShotRowActions'
import { ShotScriptCell } from './ShotScriptCell'
import { STORYBOARD_GRID_TEMPLATE } from './storyboard-layout'
import { useShotAssetBindings } from './useShotAssetBindings'

export interface AssetVersionDialogRequest {
  assetId: number
  assetType: ShotMediaType
  currentUrl: string | null
  shotId: number
}

export interface AssetGenerateDialogRequest {
  assetType: ShotMediaType
  shotId: number
  shotNo: number
}

export interface StoryboardRowProps {
  assetDialogs?: {
    openVersions: (request: AssetVersionDialogRequest) => void
  }
  isFirst: boolean
  isLast: boolean
  onDelete: () => void
  onMergeDown: () => void
  onMergeUp: () => void
  onToggleSelect: () => void
  onUpdateScript: (scriptText: string) => Promise<void> | void
  selected: boolean
  shot: StoryboardShotVO
}

function StoryboardRowImpl({
  assetDialogs,
  isFirst,
  isLast,
  onDelete,
  onMergeDown,
  onMergeUp,
  onToggleSelect,
  onUpdateScript,
  selected,
  shot,
}: StoryboardRowProps) {
  const projectId = useEditorStore((state) => state.projectId)
  const refreshShots = useEditorStore((state) => state.refreshShots)
  const openPanel = usePanelManagerStore((state) => state.openPanel)
  const bindings = useShotAssetBindings(shot)

  const openGeneration = (assetType: ShotMediaType) => {
    const panelType = assetType === 'shot-image' ? 'shot-image-generate' : 'video-generate'
    openPanel(panelType, { shotId: shot.id, shotNo: shot.shotNo })
  }
  const openVersions = (assetType: ShotMediaType, asset: AssetStatusVO) => {
    if (!asset.assetId) return
    if (assetDialogs) {
      assetDialogs.openVersions({
        assetId: asset.assetId,
        assetType,
        currentUrl: asset.currentUrl,
        shotId: shot.id,
      })
    } else if (asset.currentUrl) {
      window.open(asset.currentUrl, '_blank', 'noopener,noreferrer')
    }
  }
  const deleteAsset = async (assetType: ShotMediaType, label: string) => {
    if (!projectId) return
    if (!(await confirmAction(`删除后${label}将变为“待生成”状态，是否继续？`, {
      confirmLabel: `删除${label}`, danger: true, title: `删除${label}`,
    }))) return
    try {
      await shotApi.deleteShotAsset(projectId, shot.id, assetType)
      await refreshShots([shot.id])
    } catch (error) {
      notify.error(error instanceof Error ? error.message : `删除${label}失败`)
    }
  }

  return (
    <div
      style={{ gridTemplateColumns: STORYBOARD_GRID_TEMPLATE }}
      className={`group/shot grid h-full overflow-hidden border-b border-slate-100 transition-colors ${
        selected ? 'bg-blue-50' : 'hover:bg-slate-50/70'
      }`}
    >
      <div className="overflow-hidden px-3 py-3">
        <Checkbox checked={selected} onChange={onToggleSelect} />
      </div>
      <div className="overflow-hidden px-3 py-3">
        <Tag>{shot.shotNo}</Tag>
      </div>
      <div className="overflow-hidden px-3 py-3">
        <ShotScriptCell shot={shot} onSave={onUpdateScript} />
      </div>
      <div className="overflow-hidden px-3 py-3">
        <CharacterBindingsCell bindings={bindings} shot={shot} />
      </div>
      <div className="overflow-hidden px-3 py-3">
        <SceneBindingCell bindings={bindings} shot={shot} />
      </div>
      <div className="overflow-hidden px-3 py-3">
        <PropBindingsCell bindings={bindings} shot={shot} />
      </div>
      <div className="overflow-hidden px-3 py-3">
        <ShotMediaCell
          asset={shot.shotImage}
          label="分镜图"
          mediaType="shot-image"
          onDelete={() => void deleteAsset('shot-image', '分镜图')}
          onGenerate={() => openGeneration('shot-image')}
          onOpenVersions={() => openVersions('shot-image', shot.shotImage)}
        />
      </div>
      <div className="overflow-hidden px-3 py-3">
        <ShotMediaCell
          asset={shot.video}
          label="视频"
          mediaType="video"
          posterUrl={getVideoFallbackThumbnail(shot)}
          onDelete={() => void deleteAsset('video', '视频')}
          onGenerate={() => openGeneration('video')}
          onOpenVersions={() => openVersions('video', shot.video)}
        />
      </div>
      <div className="overflow-hidden px-3 py-3">
        <ShotRowActions
          isFirst={isFirst}
          isLast={isLast}
          onDelete={onDelete}
          onMergeDown={onMergeDown}
          onMergeUp={onMergeUp}
        />
      </div>
    </div>
  )
}

// Compare only the data props. `shot` keeps a stable reference across polls
// (see reconcileShots), and the inline callbacks from StoryboardTable key on the
// stable `shot.id`, so ignoring their identity is safe and lets unchanged rows
// skip re-rendering when the table re-renders for selection or polling updates.
export const StoryboardRow = memo(
  StoryboardRowImpl,
  (prev, next) =>
    prev.shot === next.shot &&
    prev.selected === next.selected &&
    prev.isFirst === next.isFirst &&
    prev.isLast === next.isLast &&
    prev.assetDialogs === next.assetDialogs,
)
