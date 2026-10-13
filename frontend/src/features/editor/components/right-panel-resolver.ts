import { type ComponentType, createElement, type ReactElement } from 'react'

import type {
  PanelDataByType,
  PanelManagerStore,
  PanelType,
} from '../panel-manager-store'

export interface ManagedPanelProps<TData> {
  data: TData
  onClose: () => void
}

export type RightPanelComponents = {
  [TType in keyof PanelDataByType]: ComponentType<ManagedPanelProps<PanelDataByType[TType]>>
}

export interface RightPanelSnapshot {
  currentPanelType: PanelType
  panelData: PanelManagerStore['panelData']
  panelKey: number
}

export const createRightPanelElement = (
  snapshot: RightPanelSnapshot,
  onClose: () => void,
  components: RightPanelComponents,
): ReactElement | null => {
  const { currentPanelType, panelData, panelKey } = snapshot
  if (currentPanelType === null) return null
  const key = `${currentPanelType}:${panelKey}`

  switch (currentPanelType) {
    case 'asset-edit': {
      return createElement(components['asset-edit'], {
        data: panelData as PanelDataByType['asset-edit'],
        key,
        onClose,
      })
    }
    case 'default': {
      return createElement(components.default, {
        data: panelData as PanelDataByType['default'],
        key,
        onClose,
      })
    }
    case 'history': {
      return createElement(components.history, {
        data: panelData as PanelDataByType['history'],
        key,
        onClose,
      })
    }
    case 'shot-image-generate': {
      return createElement(components['shot-image-generate'], {
        data: panelData as PanelDataByType['shot-image-generate'],
        key,
        onClose,
      })
    }
    case 'video-generate': {
      return createElement(components['video-generate'], {
        data: panelData as PanelDataByType['video-generate'],
        key,
        onClose,
      })
    }
  }
}
