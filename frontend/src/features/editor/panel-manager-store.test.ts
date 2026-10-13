import { describe, expect, it } from 'vitest'

import { createPanelManagerStore } from './panel-manager-store'

describe('panel manager Zustand store', () => {
  it('freezes typed panel data and only bumps panelKey when reopening the same panel', () => {
    const store = createPanelManagerStore()

    store.getState().openPanel('asset-edit', {
      assetId: 7,
      assetType: 'character',
      characterName: '小夏',
    })
    expect(store.getState()).toMatchObject({
      currentPanelType: 'asset-edit',
      panelKey: 0,
    })

    store.getState().openPanel('asset-edit', {
      assetId: 8,
      assetType: 'scene',
      sceneName: '雨夜街道',
    })
    expect(store.getState()).toMatchObject({
      currentPanelType: 'asset-edit',
      panelKey: 1,
    })

    store.getState().openPanel('shot-image-generate', { shotId: 11, shotNo: 2 })
    expect(store.getState()).toMatchObject({
      currentPanelType: 'shot-image-generate',
      panelData: { shotId: 11, shotNo: 2 },
      panelKey: 1,
    })
  })

  it('merges panel data and closePanel returns to a refreshed default panel', () => {
    const store = createPanelManagerStore()
    store.getState().openPanel('asset-edit', { assetId: 7, assetType: 'prop' })

    store.getState().updatePanelData({ existingThumbnailUrl: 'https://example.com/prop.png' })
    expect(store.getState().panelData).toEqual({
      assetId: 7,
      assetType: 'prop',
      existingThumbnailUrl: 'https://example.com/prop.png',
    })

    store.getState().closePanel()
    expect(store.getState()).toMatchObject({
      currentPanelType: 'default',
      panelData: {},
      panelKey: 1,
    })
  })
})
