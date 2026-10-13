import { describe, expect, it } from 'vitest'

import type { ProjectCharacterVO, ProjectPropVO, ProjectSceneVO } from '@/shared/types/api'

import {
  type CharacterPanelAsset,
  createAssetEditPanelData,
  filterDefaultPanelAssets,
  toDefaultPanelAssetGroups,
} from './default-panel-data'

const character: ProjectCharacterVO = {
  createdAt: '2026-06-28T00:00:00',
  displayName: '林默',
  finalDescription: '黑发侦探',
  id: 11,
  libraryCharacterId: 101,
  thumbnailUrl: null,
}

const scene: ProjectSceneVO = {
  createdAt: '2026-06-28T00:00:00',
  displayName: '旧车站',
  finalDescription: '雨夜中的废弃车站',
  id: 22,
  librarySceneId: 202,
  librarySceneName: '车站',
  overrideDescription: null,
  projectId: 1,
  thumbnailUrl: 'https://example.com/scene.png',
}

const prop: ProjectPropVO = {
  createdAt: '2026-06-28T00:00:00',
  description: '黄铜怀表',
  displayName: '怀表',
  id: 33,
  libraryPropId: 303,
  name: '怀表',
  thumbnailUrl: 'https://example.com/prop.png',
}

describe('default panel asset data', () => {
  it('normalizes all three project asset types without loose any branches', () => {
    const groups = toDefaultPanelAssetGroups([character], [scene], [prop], {
      characters: new Map([[101, 1]]),
      props: new Map([[303, 3]]),
      scenes: new Map([[202, 2]]),
    })

    expect(groups.characters[0]).toMatchObject({
      assetType: 'character',
      categoryId: 1,
      name: '林默',
    })
    expect(groups.scenes[0]).toMatchObject({ assetType: 'scene', categoryId: 2 })
    expect(groups.props[0]).toMatchObject({ assetType: 'prop', categoryId: 3 })
  })

  it('marks project assets that have active generation jobs', () => {
    const groups = toDefaultPanelAssetGroups(
      [character],
      [scene],
      [prop],
      undefined,
      {
        characters: new Set([11]),
        props: new Set([33]),
        scenes: new Set<number>(),
      },
    )

    expect(groups.characters[0].isGenerating).toBe(true)
    expect(groups.props[0].isGenerating).toBe(true)
    expect(groups.scenes[0].isGenerating).toBe(false)
  })

  it('filters by category and trimmed case-insensitive name', () => {
    const assets: CharacterPanelAsset[] = [
      {
        assetType: 'character',
        categoryId: 1,
        description: '',
        id: 1,
        imageUrl: null,
        isActive: false,
        isGenerating: false,
        name: 'Alice',
      },
      {
        assetType: 'character',
        categoryId: 2,
        description: '',
        id: 2,
        imageUrl: null,
        isActive: false,
        isGenerating: false,
        name: 'Bob',
      },
    ]

    expect(filterDefaultPanelAssets(assets, '  ALI ', 1).map((asset) => asset.id)).toEqual([1])
    expect(filterDefaultPanelAssets(assets, '', 2).map((asset) => asset.id)).toEqual([2])
  })

  it('prefills a thumbnail-less character from the bounded project script', () => {
    const [asset] = toDefaultPanelAssetGroups([character], [], []).characters
    const data = createAssetEditPanelData(asset, '剧'.repeat(2001))

    expect(data).toMatchObject({
      assetId: 11,
      assetType: 'character',
      characterName: '林默',
      existingDescription: '黑发侦探',
    })
    expect(data.existingThumbnailUrl).toBeUndefined()
    expect(data.prefillDescription).toHaveLength(2003)
    expect(data.prefillDescription?.endsWith('...')).toBe(true)
  })

  it('passes existing thumbnails for scene and prop editing', () => {
    const groups = toDefaultPanelAssetGroups([], [scene], [prop])

    expect(createAssetEditPanelData(groups.scenes[0], '')).toMatchObject({
      assetId: 22,
      assetType: 'scene',
      existingThumbnailUrl: 'https://example.com/scene.png',
      sceneName: '旧车站',
    })
    expect(createAssetEditPanelData(groups.props[0], '')).toMatchObject({
      assetId: 33,
      assetType: 'prop',
      existingThumbnailUrl: 'https://example.com/prop.png',
      propName: '怀表',
    })
  })
})
