import { describe, expect, it, vi } from 'vitest'

import type { AssetStatusVO } from '@/shared/types/api'

import { highlightScript } from '../../utils/script-highlight'
import { canRegenerateAsset, getAssetClickIntent } from './asset-state'
import { calculateHoverPosition, createHoverPreviewController } from './hover-preview'
import { MAX_SHOT_SCRIPT_LENGTH, normalizeShotScriptDraft } from './shot-script-utils'

const asset = (status: AssetStatusVO['status']): AssetStatusVO => ({
  assetId: null,
  currentUrl: null,
  currentVersionId: null,
  status,
  totalVersions: 0,
})

describe('storyboard leaf behavior', () => {
  it('maps every asset status to the correct interaction', () => {
    expect(getAssetClickIntent(asset('NONE'))).toBe('generate')
    expect(getAssetClickIntent(asset('FAILED'))).toBe('generate')
    expect(getAssetClickIntent(asset('GENERATING'))).toBe('none')
    expect(getAssetClickIntent(asset('READY'))).toBe('versions')
    expect(canRegenerateAsset(asset('READY'))).toBe(true)
    expect(canRegenerateAsset(asset('FAILED'))).toBe(true)
    expect(canRegenerateAsset(asset('GENERATING'))).toBe(false)
  })

  it('delays hover, tracks the cursor, cancels stale previews and cleans up', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const controller = createHoverPreviewController(onChange, 680)

    controller.show({ key: 'first', name: '角色一', x: 10, y: 20 })
    controller.move(30, 40)
    controller.show({ key: 'second', name: '角色二', x: 50, y: 60 })
    vi.advanceTimersByTime(679)
    expect(onChange.mock.lastCall?.[0].visible).toBe(false)
    vi.advanceTimersByTime(1)
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ key: 'second', visible: true })

    controller.dispose()
    controller.show({ key: 'third', name: '角色三', x: 0, y: 0 })
    vi.runAllTimers()
    expect(onChange.mock.lastCall?.[0].key).toBe('second')
    vi.useRealTimers()
  })

  it('reactivates after the StrictMode setup-cleanup-setup cycle', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const controller = createHoverPreviewController(onChange, 680)

    controller.activate()
    controller.dispose()
    controller.activate()
    controller.show({ key: 'strict-mode', name: '黎呦呦', x: 20, y: 30 })
    vi.advanceTimersByTime(680)

    expect(onChange.mock.lastCall?.[0]).toMatchObject({
      key: 'strict-mode',
      visible: true,
    })
    controller.dispose()
    vi.useRealTimers()
  })

  it('clears the pending sweep immediately when the pointer leaves', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const controller = createHoverPreviewController(onChange, 680)

    controller.show({ key: 'character-1', name: '黎呦呦', x: 20, y: 30 })
    controller.hide()
    vi.runAllTimers()

    expect(onChange.mock.lastCall?.[0]).toMatchObject({ key: '', visible: false })
    controller.dispose()
    vi.useRealTimers()
  })

  it('keeps the preview inside the viewport', () => {
    expect(
      calculateHoverPosition({
        estimatedHeight: 500,
        viewportHeight: 720,
        viewportWidth: 1280,
        width: 620,
        x: 1200,
        y: 700,
      }),
    ).toEqual({ left: 648, top: 208 })
    expect(
      calculateHoverPosition({
        estimatedHeight: 560,
        offset: 0,
        viewportHeight: 900,
        viewportWidth: 1600,
        width: 760,
        x: 400,
        y: 24,
      }),
    ).toEqual({ left: 400, top: 24 })
  })

  it('normalizes script edits at the 4000 character boundary', () => {
    const normalized = normalizeShotScriptDraft(`  ${'剧'.repeat(4100)}  `)
    expect(normalized).toHaveLength(MAX_SHOT_SCRIPT_LENGTH)
  })

  it('escapes script HTML and highlights labels plus longest unique assets', () => {
    const result = highlightScript(
      '<img src=x> 画面构图：百里通拿起剑，运镜1[推进] [声纹特征:低沉]',
      ['百里', '百里通', '百里通'],
      [],
      ['剑'],
    )

    expect(result).toContain('&lt;img src=x&gt;')
    expect(result).not.toContain('<img src=x>')
    expect(result).toContain(`${HIGHLIGHT_MARKERS.character}">百里通</span>`)
    expect(result).toContain(`${HIGHLIGHT_MARKERS.prop}">剑</span>`)
    expect(result).toContain('font-style:italic')
    expect(result).toContain('运镜1[推进]</span>')
  })
})

const HIGHLIGHT_MARKERS = {
  character: 'color:#0891b2;font-weight:500',
  prop: 'color:#9333ea;font-weight:500',
}
