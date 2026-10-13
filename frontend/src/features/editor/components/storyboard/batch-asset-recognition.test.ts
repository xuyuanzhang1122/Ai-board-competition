import { describe, expect, it, vi } from 'vitest'

import type { StoryboardShotVO } from '@/shared/types/api'

import {
  type RecognitionContext,
  type RecognitionDeps,
  recognizeAssetsForColumn,
} from './batch-asset-recognition'

// 只测注入 deps 的纯逻辑；mock 掉真实 api 以免拉起依赖 localStorage 的 store 链(仓库无 jsdom)。
// vi.mock 会被 vitest 提升到 import 之前执行，放这里不影响生效。
vi.mock('../../api', () => ({ characterApi: {}, propApi: {}, sceneApi: {}, shotApi: {} }))

const shot = (id: number, scriptText: string, extra: Partial<StoryboardShotVO> = {}) =>
  ({ characters: [], id, props: [], scene: null, scriptText, ...extra }) as unknown as StoryboardShotVO

const makeDeps = () => {
  let nextLibraryId = 100
  let nextProjectId = 200
  const deps: RecognitionDeps = {
    characterApi: {
      createCharacter: vi.fn(async () => ({ id: ++nextProjectId }) as never),
      createLibraryCharacter: vi.fn(async () => ({ id: ++nextLibraryId }) as never),
    },
    propApi: {
      addPropToProject: vi.fn(async () => ({ id: ++nextProjectId }) as never),
      createLibraryProp: vi.fn(async () => ({ id: ++nextLibraryId }) as never),
    },
    sceneApi: {
      createLibraryScene: vi.fn(async () => ({ id: ++nextLibraryId }) as never),
      createScene: vi.fn(async () => ({ id: ++nextProjectId }) as never),
    },
    shotApi: { createBinding: vi.fn(async () => undefined) },
  }
  return deps
}

const ctx = (shots: StoryboardShotVO[], over: Partial<RecognitionContext> = {}): RecognitionContext => ({
  characters: [],
  projectId: 1,
  props: [],
  scenes: [],
  shots,
  ...over,
})

describe('recognizeAssetsForColumn', () => {
  it('creates a character once across shots and binds it to each mentioning shot', async () => {
    const deps = makeDeps()
    const shots = [
      shot(10, '人物：黎呦呦、打头太监'),
      shot(11, '人物：黎呦呦'),
    ]
    const count = await recognizeAssetsForColumn('character', ctx(shots), deps)

    // 黎呦呦 built once (shared), 打头太监 once → 2 creations, 3 bindings.
    expect(deps.characterApi.createCharacter).toHaveBeenCalledTimes(2)
    expect(deps.shotApi.createBinding).toHaveBeenCalledTimes(3)
    expect(count).toBe(3)
  })

  it('binds an existing same-name asset instead of creating a new one', async () => {
    const deps = makeDeps()
    const context = ctx([shot(10, '人物：黎呦呦')], {
      characters: [{ displayName: '黎呦呦', id: 7 } as never],
    })
    const count = await recognizeAssetsForColumn('character', context, deps)

    expect(deps.characterApi.createCharacter).not.toHaveBeenCalled()
    expect(deps.shotApi.createBinding).toHaveBeenCalledWith(1, 10, 'PCHAR', 7)
    expect(count).toBe(1)
  })

  it('skips characters already bound to the shot', async () => {
    const deps = makeDeps()
    const shots = [
      shot(10, '人物：黎呦呦、打头太监', {
        characters: [{ bindingId: 1, characterId: 7, characterName: '黎呦呦' }] as never,
      }),
    ]
    const count = await recognizeAssetsForColumn('character', ctx(shots), deps)

    expect(count).toBe(1) // only 打头太监
    expect(deps.characterApi.createCharacter).toHaveBeenCalledTimes(1)
  })

  it('skips shots that already have a scene bound and returns 0 when nothing to do', async () => {
    const deps = makeDeps()
    const shots = [shot(10, '场景：安乐宫院落-黑夜', { scene: { sceneId: 5 } as never })]
    const count = await recognizeAssetsForColumn('scene', ctx(shots), deps)

    expect(count).toBe(0)
    expect(deps.sceneApi.createScene).not.toHaveBeenCalled()
    expect(deps.shotApi.createBinding).not.toHaveBeenCalled()
  })

  it('recognizes props with PPROP binding', async () => {
    const deps = makeDeps()
    const count = await recognizeAssetsForColumn(
      'prop',
      ctx([shot(10, '道具：新制的锦被、玉佩')]),
      deps,
    )

    expect(count).toBe(2)
    expect(deps.propApi.addPropToProject).toHaveBeenCalledTimes(2)
    expect(deps.propApi.createLibraryProp).toHaveBeenCalledWith({
      description: '',
      name: '新制的锦被',
    })
    expect(deps.propApi.addPropToProject).toHaveBeenCalledWith(1, {
      displayName: '新制的锦被',
      libraryPropId: expect.any(Number),
      overrideDescription: '',
    })
    expect(deps.shotApi.createBinding).toHaveBeenCalledWith(1, 10, 'PPROP', expect.any(Number))
  })

  it('does not create or bind a prop when the prop label is empty', async () => {
    const deps = makeDeps()
    const count = await recognizeAssetsForColumn(
      'prop',
      ctx([shot(10, '人物：黎呦呦\n场景：寝殿-白天\n时间：白天\n道具：\n超写实真人实拍质感')]),
      deps,
    )

    expect(count).toBe(0)
    expect(deps.propApi.createLibraryProp).not.toHaveBeenCalled()
    expect(deps.propApi.addPropToProject).not.toHaveBeenCalled()
    expect(deps.shotApi.createBinding).not.toHaveBeenCalled()
  })
})
