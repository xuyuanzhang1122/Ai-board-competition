import { describe, expect, it, vi } from 'vitest'

import type { ProjectCharacterVO, StoryboardShotVO } from '@/shared/types/api'

import {
  buildAssetEditPanelData,
  editablePropDescription,
  extractCharacterNames,
  extractPropNames,
  extractSceneName,
  findCharacterByName,
  replaceSceneBinding,
  selectedShotIdsInOrder,
} from './asset-binding-utils'

const character = (id: number, displayName: string): ProjectCharacterVO => ({
  createdAt: '',
  displayName,
  id,
  libraryCharacterId: null,
  thumbnailUrl: null,
})

describe('shot asset binding helpers', () => {
  it('extracts unique concrete character names and filters vague names', () => {
    expect(
      extractCharacterNames('出场人物：百里通、舍友甲、路人、百里通，阿离（少年）\n画面构图：'),
    ).toEqual(['百里通', '阿离'])
  })

  it('also matches the shorter "人物：" label used by current AI-generated shots', () => {
    expect(extractCharacterNames('人物：黎呦呦、打头太监\n场景：安乐宫院落-黑夜')).toEqual([
      '黎呦呦',
      '打头太监',
    ])
  })

  it('extracts a single scene name and tolerates a trailing time suffix', () => {
    expect(extractSceneName('人物：黎呦呦\n场景：安乐宫院落-黑夜\n时间：黑夜')).toBe(
      '安乐宫院落-黑夜',
    )
    expect(extractSceneName('人物：黎呦呦')).toBeNull()
  })

  it('extracts unique prop names from the "道具：" label', () => {
    expect(extractPropNames('场景：安乐宫院落-黑夜\n道具：新制的锦被、玉佩、玉佩')).toEqual([
      '新制的锦被',
      '玉佩',
    ])
    expect(extractPropNames('人物：黎呦呦')).toEqual([])
  })

  it('does not let empty asset labels consume the following storyboard text', () => {
    const script = [
      '人物：   ',
      '场景：\t',
      '道具：',
      '超写实真人实拍质感，主视角与仰拍为主',
    ].join('\r\n')

    expect(extractCharacterNames(script)).toEqual([])
    expect(extractSceneName(script)).toBeNull()
    expect(extractPropNames(script)).toEqual([])
  })

  it('only recognizes asset labels at the start of a line', () => {
    const script = '分镜词：画面字幕写着“道具：玉佩”，角色继续前行'

    expect(extractCharacterNames('对白：他提到了人物：黎呦呦')).toEqual([])
    expect(extractSceneName('描述：远处场景：安乐宫')).toBeNull()
    expect(extractPropNames(script)).toEqual([])
  })

  it('hides a legacy prop description that is the complete storyboard text', () => {
    const script = '人物：黎呦呦\n道具：玉佩\n超写实真人实拍质感'

    expect(editablePropDescription(script, script)).toBe('')
    expect(editablePropDescription('白玉雕成的玉佩', script)).toBe('白玉雕成的玉佩')
  })

  it('prefers an exact same-name character before a fuzzy match', () => {
    const characters = [character(1, '小明（少年）'), character(2, '小明')]
    expect(findCharacterByName(characters, '小明')?.id).toBe(2)
  })

  it('freezes the create-panel contract and limits source script', () => {
    const data = buildAssetEditPanelData({
      assetType: 'scene',
      name: '新场景',
      scriptText: 'a'.repeat(2100),
      shotId: 8,
    })
    expect(data).toMatchObject({
      assetType: 'scene',
      name: '新场景',
      sceneName: '新场景',
      shotId: 8,
    })
    expect(data.scriptText).toHaveLength(2003)
  })

  it('unbinds the old scene before binding the replacement', async () => {
    const order: string[] = []
    await replaceSceneBinding({
      bind: async (sceneId) => {
        order.push(`bind:${sceneId}`)
      },
      currentBindingId: 41,
      sceneId: 9,
      unbind: async (bindingId) => {
        order.push(`unbind:${bindingId}`)
      },
    })
    expect(order).toEqual(['unbind:41', 'bind:9'])

    const bind = vi.fn()
    await expect(
      replaceSceneBinding({
        bind,
        currentBindingId: 41,
        sceneId: 9,
        unbind: async () => { throw new Error('unbind failed'); },
      }),
    ).rejects.toThrow('unbind failed')
    expect(bind).not.toHaveBeenCalled()
  })

  it('orders destructive batch operations by current shot order', () => {
    const shots = [{ id: 3 }, { id: 1 }, { id: 2 }] as StoryboardShotVO[]
    expect(selectedShotIdsInOrder(shots, new Set([2, 3]))).toEqual([3, 2])
  })
})
