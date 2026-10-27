import { describe, expect, it, vi } from 'vitest'

import type {
  ProjectCharacterVO,
  ProjectPropVO,
  ProjectSceneVO,
} from '@/shared/types/api'

import type { LocalImageHistoryRecord } from '../../../store'
import {
  buildDescriptionRequest,
  defaultDescription,
  type DescriptionParserDeps,
  type DescriptionParserInput,
  runDescriptionParse,
} from './useAssetDescriptionParser'
import {
  buildHistoryItems,
  buildServerHistoryItem,
  isValidThumbnailUrl,
  selectAssetHistory,
} from './useAssetHistory'
import { aggregateSameNameAssetIds } from './useAssetLibraryAssets'

const apiMocks = vi.hoisted(() => ({
  defaults: { baseURL: '/api' },
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({ default: apiMocks }))

const formatDay = (id: number) => String(id + 1).padStart(2, '0')

const makeCharacter = (
  id: number,
  displayName: string,
  name?: string,
  thumbnailUrl: string | null = null,
): ProjectCharacterVO => ({
  createdAt: `2026-06-${formatDay(id)}T00:00:00Z`,
  description: `${displayName}描述`,
  displayName,
  finalDescription: `${displayName}最终描述`,
  id,
  libraryCharacterId: null,
  name,
  thumbnailUrl,
})

const makeScene = (
  id: number,
  displayName: string,
  thumbnailUrl: string | null = null,
): ProjectSceneVO => ({
  createdAt: `2026-06-${formatDay(id)}T00:00:00Z`,
  displayName,
  finalDescription: `${displayName}最终描述`,
  id,
  librarySceneId: null,
  librarySceneName: displayName,
  overrideDescription: null,
  projectId: 1,
  thumbnailUrl,
})

const makeProp = (
  id: number,
  displayName: string | null,
  name: string,
  thumbnailUrl: string | null = null,
): ProjectPropVO => ({
  createdAt: `2026-06-${formatDay(id)}T00:00:00Z`,
  description: `${name}描述`,
  displayName,
  id,
  libraryPropId: 100 + id,
  name,
  thumbnailUrl,
})

const makeLocalRecord = (
  id: number,
  url: string,
  createdAt: string,
  prompt: string | null = null,
): LocalImageHistoryRecord => ({
  createdAt,
  id,
  prompt,
  url,
  versionNo: id,
})

describe('asset description parser', () => {
  it('does not dispatch a canceled effect when StrictMode immediately replays setup', async () => {
    const deps: DescriptionParserDeps = {
      cacheCharacterDescription: vi.fn(),
      generateText: vi.fn().mockResolvedValue({ text: '场景描述' }),
      getCachedCharacterDescription: vi.fn(),
    }
    const input: DescriptionParserInput = {
      assetName: '蓬莱阁', assetType: 'scene', projectId: 1, scriptText: '海边的阁楼',
    }
    const firstEffect = new AbortController()
    const first = runDescriptionParse(input, deps, firstEffect.signal)
    firstEffect.abort()
    const second = runDescriptionParse(input, deps, new AbortController().signal)
    await Promise.all([first, second])
    expect(deps.generateText).toHaveBeenCalledTimes(1)
  })
  it('returns existing description directly without calling the API', async () => {
    const deps: DescriptionParserDeps = {
      cacheCharacterDescription: vi.fn(),
      generateText: vi.fn(),
      getCachedCharacterDescription: vi.fn(),
    }
    const input: DescriptionParserInput = {
      assetName: '林默',
      assetType: 'character',
      existingDescription: '黑发侦探',
      prefillDescription: '剧本内容',
      projectId: 1,
      scriptText: '剧本内容',
    }

    const result = await runDescriptionParse(input, deps)

    expect(result).toEqual({ description: '黑发侦探', parseError: false })
    expect(deps.generateText).not.toHaveBeenCalled()
    expect(deps.getCachedCharacterDescription).not.toHaveBeenCalled()
  })

  it('keeps a prop description empty instead of parsing the storyboard text', async () => {
    const deps: DescriptionParserDeps = {
      cacheCharacterDescription: vi.fn(),
      generateText: vi.fn(),
      getCachedCharacterDescription: vi.fn(),
    }
    const input: DescriptionParserInput = {
      assetName: '玉佩',
      assetType: 'prop',
      existingDescription: '',
      prefillDescription: '人物：黎呦呦\n道具：玉佩\n超写实真人实拍质感',
      projectId: 1,
      scriptText: '人物：黎呦呦\n道具：玉佩\n超写实真人实拍质感',
    }

    const result = await runDescriptionParse(input, deps)

    expect(result).toEqual({ description: '', parseError: false })
    expect(deps.generateText).not.toHaveBeenCalled()
  })

  it('returns cached character description without calling the API', async () => {
    const deps: DescriptionParserDeps = {
      cacheCharacterDescription: vi.fn(),
      generateText: vi.fn(),
      getCachedCharacterDescription: vi.fn().mockReturnValue('缓存外貌'),
    }
    const input: DescriptionParserInput = {
      assetName: '林默',
      assetType: 'character',
      prefillDescription: '剧本内容',
      projectId: 1,
      scriptText: '剧本内容',
    }

    const result = await runDescriptionParse(input, deps)

    expect(result).toEqual({ description: '缓存外貌', parseError: false })
    expect(deps.generateText).not.toHaveBeenCalled()
    expect(deps.cacheCharacterDescription).not.toHaveBeenCalled()
  })

  it('caches a successful character parse and returns it', async () => {
    const deps: DescriptionParserDeps = {
      cacheCharacterDescription: vi.fn(),
      generateText: vi.fn().mockResolvedValue({ text: '  解析结果  ' }),
      getCachedCharacterDescription: vi.fn().mockReturnValue(undefined),
    }
    const input: DescriptionParserInput = {
      assetName: '林默',
      assetType: 'character',
      prefillDescription: '剧本内容',
      projectId: 1,
      scriptText: '剧本内容',
    }

    const result = await runDescriptionParse(input, deps)

    expect(result).toEqual({ description: '解析结果', parseError: false })
    expect(deps.cacheCharacterDescription).toHaveBeenCalledWith('林默', '解析结果')
    expect(deps.generateText).toHaveBeenCalledWith({ assetType: 'character', assetName: '林默', sourceText: '剧本内容' }, 1, { model: undefined })
  })

  it('does not replay a failed provider request and offers a fallback description', async () => {
    const deps: DescriptionParserDeps = {
      cacheCharacterDescription: vi.fn(),
      generateText: vi.fn().mockRejectedValue(new Error('provider down')),
      getCachedCharacterDescription: vi.fn().mockReturnValue(undefined),
    }
    const input: DescriptionParserInput = {
      assetName: '林默',
      assetType: 'character',
      prefillDescription: '剧本内容',
      projectId: 1,
      scriptText: '剧本内容',
    }

    const result = await runDescriptionParse(input, deps)

    expect(deps.generateText).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      description: '林默，一个角色',
      parseError: true,
    })
  })

  it('falls back when projectId is null without calling the API', async () => {
    const deps: DescriptionParserDeps = {
      cacheCharacterDescription: vi.fn(),
      generateText: vi.fn(),
      getCachedCharacterDescription: vi.fn(),
    }
    const input: DescriptionParserInput = {
      assetName: '林默',
      assetType: 'character',
      prefillDescription: '剧本内容',
      projectId: null,
      scriptText: '剧本内容',
    }

    const result = await runDescriptionParse(input, deps)

    expect(result).toEqual({ description: '林默，一个角色', parseError: true })
    expect(deps.generateText).not.toHaveBeenCalled()
  })

  it('aborts an in-flight parse and returns the default description', async () => {
    const deps: DescriptionParserDeps = {
      cacheCharacterDescription: vi.fn(),
      generateText: vi.fn(
        () => new Promise<{ text: string }>((resolve) => setTimeout(() => resolve({ text: 'late' }), 100)),
      ),
      getCachedCharacterDescription: vi.fn().mockReturnValue(undefined),
    }
    const input: DescriptionParserInput = {
      assetName: '林默',
      assetType: 'character',
      prefillDescription: '剧本内容',
      projectId: 1,
      scriptText: '剧本内容',
    }
    const controller = new AbortController()
    controller.abort()

    const result = await runDescriptionParse(input, deps, controller.signal)

    expect(deps.generateText).not.toHaveBeenCalled()
    expect(result).toEqual({ description: '林默，一个角色', parseError: false })
  })

  it('sends asset type and source as data without embedding system rules', () => {
    expect(buildDescriptionRequest('character', '林默', '剧本')).toEqual({ assetType: 'character', assetName: '林默', sourceText: '剧本' })
  })

  it('preserves the complete source text as user data', () => {
    const sourceText = '剧'.repeat(3000)
    expect(buildDescriptionRequest('scene', '车站', sourceText).sourceText).toBe(sourceText)
  })

  it('falls back gracefully when assetName is empty', () => {
    expect(defaultDescription('', 'character')).toBe('角色')
    expect(defaultDescription('车站', 'scene')).toBe('车站，一个场景')
  })
})

describe('asset library same-name aggregation', () => {
  it('returns all IDs when multiple assets share the same displayName', () => {
    const characters = [
      makeCharacter(1, '林默'),
      makeCharacter(2, '林默'),
      makeCharacter(3, '苏晚'),
    ]

    expect(
      aggregateSameNameAssetIds('character', '林默', undefined, characters, [], []),
    ).toEqual([1, 2])
  })

  it('matches by name when displayName is empty for characters and props', () => {
    const characters = [makeCharacter(1, '', '林默')]
    const props = [makeProp(10, null, '怀表')]

    expect(
      aggregateSameNameAssetIds('character', '林默', undefined, characters, [], []),
    ).toEqual([1])
    expect(
      aggregateSameNameAssetIds('prop', '怀表', undefined, [], [], props),
    ).toEqual([10])
  })

  it('matches scenes by displayName or librarySceneName', () => {
    const scenes = [
      { ...makeScene(1, '旧车站'), displayName: '', librarySceneName: '车站' },
      makeScene(2, '车站'),
    ] as ProjectSceneVO[]

    expect(aggregateSameNameAssetIds('scene', '车站', undefined, [], scenes, [])).toEqual([1, 2])
  })

  it('falls back to assetId when assetName is empty', () => {
    expect(
      aggregateSameNameAssetIds('character', '', 7, [], [], []),
    ).toEqual([7])
    expect(
      aggregateSameNameAssetIds('prop', '  ', undefined, [], [], []),
    ).toEqual([])
  })
})

describe('asset history merge', () => {
  it('merges server records and local records', () => {
    const character = makeCharacter(1, '林默', undefined, 'https://example.com/char.png')
    const localRecord = makeLocalRecord(2, 'https://example.com/local.png', '2026-06-28T00:00:00Z')
    const getLocalImageHistory = vi.fn().mockReturnValue([localRecord])

    const history = buildHistoryItems(
      'character',
      [1],
      undefined,
      getLocalImageHistory,
      [character],
      [],
      [],
    )

    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({
      source: 'local',
      url: 'https://example.com/local.png',
    })
    expect(history[1]).toMatchObject({
      prompt: '林默最终描述',
      source: 'server',
      url: 'https://example.com/char.png',
      versionNo: 1,
    })
  })

  it('deduplicates records with the same URL across assets', () => {
    const char1 = makeCharacter(1, '林默', undefined, 'https://example.com/shared.png')
    const char2 = makeCharacter(2, '林默')
    const localRecord = makeLocalRecord(2, 'https://example.com/shared.png', '2026-06-28T00:00:00Z')
    const getLocalImageHistory = vi
      .fn()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([localRecord])

    const history = buildHistoryItems(
      'character',
      [1, 2],
      undefined,
      getLocalImageHistory,
      [char1, char2],
      [],
      [],
    )

    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      source: 'server',
      url: 'https://example.com/shared.png',
    })
  })

  it('excludes a server record when its URL already exists in the same asset local history', () => {
    const character = makeCharacter(1, '林默', undefined, 'https://example.com/shared.png')
    const localRecord = makeLocalRecord(2, 'https://example.com/shared.png', '2026-06-28T00:00:00Z')
    const getLocalImageHistory = vi.fn().mockReturnValue([localRecord])

    const history = buildHistoryItems(
      'character',
      [1],
      undefined,
      getLocalImageHistory,
      [character],
      [],
      [],
    )

    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ source: 'local', url: 'https://example.com/shared.png' })
  })

   it('merges shot-specific and general local history sorted by createdAt desc', () => {
    const shotRecord = makeLocalRecord(1, 'https://example.com/shot.png', '2026-06-28T02:00:00Z')
    const generalRecord = makeLocalRecord(2, 'https://example.com/general.png', '2026-06-28T01:00:00Z')
    const character = makeCharacter(1, '林默')
    const getLocalImageHistory = vi.fn().mockReturnValue([shotRecord, generalRecord])

    const history = buildHistoryItems(
      'character',
      [1],
      11,
      getLocalImageHistory,
      [character],
      [],
      [],
    )

    expect(getLocalImageHistory).toHaveBeenCalledTimes(1)
    expect(getLocalImageHistory).toHaveBeenCalledWith('character', 1, 11)
    expect(history.map((item) => item.url)).toEqual([
      'https://example.com/shot.png',
      'https://example.com/general.png',
    ])
  })

  it('aggregates records across multiple same-name asset IDs', () => {
    const char1 = makeCharacter(1, '林默', undefined, 'https://example.com/char1.png')
    const char2 = makeCharacter(2, '林默', undefined, 'https://example.com/char2.png')
    const getLocalImageHistory = vi.fn().mockReturnValue([])

    const history = buildHistoryItems(
      'character',
      [1, 2],
      undefined,
      getLocalImageHistory,
      [char1, char2],
      [],
      [],
    )

    expect(history).toHaveLength(2)
    expect(history.map((item) => item.url).sort()).toEqual([
      'https://example.com/char1.png',
      'https://example.com/char2.png',
    ])
  })

  it('skips server records with invalid thumbnail URLs', () => {
    const character = makeCharacter(1, '林默', undefined, 'data:image/png;base64,abc')
    const getLocalImageHistory = vi.fn().mockReturnValue([])

    const history = buildHistoryItems(
      'character',
      [1],
      undefined,
      getLocalImageHistory,
      [character],
      [],
      [],
    )

    expect(history).toHaveLength(0)
  })

  it('builds server history items for scenes and props', () => {
    const scene = makeScene(1, '车站', 'https://example.com/scene.png')
    const prop = makeProp(10, '怀表', 'PocketWatch', 'https://example.com/prop.png')

    expect(
      buildServerHistoryItem('scene', scene, []),
    ).toMatchObject({ prompt: '车站最终描述', source: 'server', versionNo: 1 })
    expect(
      buildServerHistoryItem('prop', prop, []),
    ).toMatchObject({ prompt: 'PocketWatch描述', source: 'server', versionNo: 1 })
  })

  it('derives same-name ids from fresh state, then builds history (no external ids needed)', () => {
    const char1 = makeCharacter(1, '林默', undefined, 'https://example.com/char1.png')
    const char2 = makeCharacter(2, '林默', undefined, 'https://example.com/char2.png')
    const other = makeCharacter(3, '苏晚', undefined, 'https://example.com/other.png')
    const getLocalImageHistory = vi.fn().mockReturnValue([])

    const history = selectAssetHistory(
      { assetId: 1, assetName: '林默', assetType: 'character', shotId: undefined },
      { characters: [char1, char2, other], getLocalImageHistory, props: [], scenes: [] },
    )

    // Only the two 林默 assets contribute; 苏晚 is excluded.
    expect(history.map((item) => item.url).sort()).toEqual([
      'https://example.com/char1.png',
      'https://example.com/char2.png',
    ])
  })

  it('falls back to assetId when assetName is empty in selectAssetHistory', () => {
    const character = makeCharacter(7, '', '林默', 'https://example.com/char7.png')
    const getLocalImageHistory = vi.fn().mockReturnValue([])

    const history = selectAssetHistory(
      { assetId: 7, assetName: '', assetType: 'character', shotId: undefined },
      { characters: [character], getLocalImageHistory, props: [], scenes: [] },
    )

    expect(history.map((item) => item.url)).toEqual(['https://example.com/char7.png'])
  })

  it('validates thumbnail URL schemes', () => {
    expect(isValidThumbnailUrl('https://example.com/a.png')).toBe(true)
    expect(isValidThumbnailUrl('http://example.com/a.png')).toBe(true)
    expect(isValidThumbnailUrl('blob:uuid')).toBe(true)
    expect(isValidThumbnailUrl('data:image/png;base64,abc')).toBe(false)
    expect(isValidThumbnailUrl(null)).toBe(false)
  })
})
