import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { PanelDataByType } from '../panel-manager-store'
import {
  createRightPanelElement,
  type ManagedPanelProps,
  type RightPanelComponents,
} from './right-panel-resolver'

const Default = (_props: ManagedPanelProps<PanelDataByType['default']>) => null
const AssetEdit = (_props: ManagedPanelProps<PanelDataByType['asset-edit']>) => null
const History = (_props: ManagedPanelProps<PanelDataByType['history']>) => null
const ShotImage = (_props: ManagedPanelProps<PanelDataByType['shot-image-generate']>) => null
const Video = (_props: ManagedPanelProps<PanelDataByType['video-generate']>) => null

const components: RightPanelComponents = {
  'asset-edit': AssetEdit,
  'default': Default,
  'history': History,
  'shot-image-generate': ShotImage,
  'video-generate': Video,
}

describe('RightPanelManager mapping', () => {
  it.each([
    ['default', {}, Default],
    ['asset-edit', { assetType: 'character' }, AssetEdit],
    ['history', {}, History],
    ['shot-image-generate', { shotId: 3, shotNo: 2 }, ShotImage],
    ['video-generate', { shotId: 3, shotNo: 2 }, Video],
  ] as const)('maps %s to its managed component', (currentPanelType, panelData, expected) => {
    const element = createRightPanelElement(
      { currentPanelType, panelData, panelKey: 4 },
      vi.fn(),
      components,
    )

    expect(element?.type).toBe(expected)
    expect(element?.key).toBe(`${currentPanelType}:4`)
  })

  it('uses panelKey as a remount boundary and forwards close', () => {
    const onClose = vi.fn()
    const first = createRightPanelElement(
      { currentPanelType: 'default', panelData: {}, panelKey: 1 },
      onClose,
      components,
    ) as ReactElement<ManagedPanelProps<PanelDataByType['default']>>
    const refreshed = createRightPanelElement(
      { currentPanelType: 'default', panelData: {}, panelKey: 2 },
      onClose,
      components,
    ) as ReactElement<ManagedPanelProps<PanelDataByType['default']>>

    expect(first.key).toBe('default:1')
    expect(refreshed.key).toBe('default:2')
    refreshed.props.onClose()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders no panel when the store type is null', () => {
    expect(
      createRightPanelElement(
        { currentPanelType: null, panelData: {}, panelKey: 3 },
        vi.fn(),
        components,
      ),
    ).toBeNull()
  })
})
