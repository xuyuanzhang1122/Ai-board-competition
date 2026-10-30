import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { StoryboardShotVO } from '@/shared/types/api'

import { usePanelManagerStore } from '../../panel-manager-store'
import { StoryboardRow } from '../storyboard/StoryboardRow'

vi.mock('@lobehub/ui', () => ({ Checkbox: () => null, Tag: () => null }))
vi.mock('../storyboard/useShotAssetBindings', () => ({ useShotAssetBindings: () => ({}) }))
vi.mock('../storyboard/CharacterBindingsCell', () => ({ CharacterBindingsCell: () => null }))
vi.mock('../storyboard/SceneBindingCell', () => ({ SceneBindingCell: () => null }))
vi.mock('../storyboard/PropBindingsCell', () => ({ PropBindingsCell: () => null }))
vi.mock('../storyboard/ShotRowActions', () => ({ ShotRowActions: () => null }))
vi.mock('../storyboard/ShotScriptCell', () => ({ ShotScriptCell: () => null }))
const clicks = vi.hoisted(() => ({ selected: 'shot-image' }))
vi.mock('../storyboard/ShotMediaCell', () => ({ ShotMediaCell: ({ mediaType, onGenerate }: { mediaType: string; onGenerate: () => void }) => {
  if (mediaType === clicks.selected) onGenerate()
  return null
} }))

const emptyAsset = { assetId: null, currentUrl: null, currentVersionId: null, status: 'NONE', totalVersions: 0 } as const
const shot: StoryboardShotVO = { id: 7, shotNo: 3, scriptText: '', characters: [], props: [], scene: null, shotImage: emptyAsset, video: emptyAsset, createdAt: '', updatedAt: '' }

describe('storyboard row single generation routing', () => {
  it.each([['shot-image', 'shot-image-generate'], ['video', 'video-generate']])('opens the managed %s panel while preserving the versions dialog', (media, panel) => {
    clicks.selected = media
    const openVersions = vi.fn()
    renderToStaticMarkup(<StoryboardRow isFirst isLast assetDialogs={{ openVersions }} selected={false} shot={shot} onDelete={() => {}} onMergeDown={() => {}} onMergeUp={() => {}} onToggleSelect={() => {}} onUpdateScript={() => {}} />)
    expect(usePanelManagerStore.getState().currentPanelType).toBe(panel)
    expect(usePanelManagerStore.getState().panelData).toEqual({ shotId: 7, shotNo: 3 })
    expect(openVersions).not.toHaveBeenCalled()
  })
})
