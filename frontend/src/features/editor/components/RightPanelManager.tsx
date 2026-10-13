import type { PanelDataByType } from '../panel-manager-store'
import { usePanelManagerStore } from '../panel-manager-store'
import { AssetEditPanel } from './panels/asset-edit/AssetEditPanel'
import { DefaultPanel } from './panels/DefaultPanel'
import { HistoryPanel } from './panels/HistoryPanel'
import { ShotImageGeneratePanel } from './panels/ShotImageGeneratePanel'
import { VideoGeneratePanel } from './panels/VideoGeneratePanel'
import {
  createRightPanelElement,
  type ManagedPanelProps,
  type RightPanelComponents,
} from './right-panel-resolver'

function ManagedDefaultPanel({ data }: ManagedPanelProps<PanelDataByType['default']>) {
  return <DefaultPanel {...data} />
}

function ManagedAssetEditPanel({ data, onClose }: ManagedPanelProps<PanelDataByType['asset-edit']>) {
  return <AssetEditPanel {...data} onClose={onClose} />
}

function ManagedHistoryPanel({ onClose }: ManagedPanelProps<PanelDataByType['history']>) {
  return <HistoryPanel onClose={onClose} />
}

function ManagedShotImagePanel({
  data,
  onClose,
}: ManagedPanelProps<PanelDataByType['shot-image-generate']>) {
  return <ShotImageGeneratePanel {...data} onClose={onClose} />
}

function ManagedVideoPanel({ data, onClose }: ManagedPanelProps<PanelDataByType['video-generate']>) {
  return <VideoGeneratePanel {...data} onClose={onClose} />
}

const DEFAULT_RIGHT_PANEL_COMPONENTS: RightPanelComponents = {
  'asset-edit': ManagedAssetEditPanel,
  'default': ManagedDefaultPanel,
  'history': ManagedHistoryPanel,
  'shot-image-generate': ManagedShotImagePanel,
  'video-generate': ManagedVideoPanel,
}

export interface RightPanelManagerProps {
  components?: RightPanelComponents
}

export function RightPanelManager({
  components = DEFAULT_RIGHT_PANEL_COMPONENTS,
}: RightPanelManagerProps) {
  const currentPanelType = usePanelManagerStore((state) => state.currentPanelType)
  const panelData = usePanelManagerStore((state) => state.panelData)
  const panelKey = usePanelManagerStore((state) => state.panelKey)
  const closePanel = usePanelManagerStore((state) => state.closePanel)

  return createRightPanelElement(
    { currentPanelType, panelData, panelKey },
    closePanel,
    components,
  )
}
