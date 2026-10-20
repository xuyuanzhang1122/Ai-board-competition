import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DEFAULT_BRIEF } from './defaults'
import { BriefEditor, StoryboardEditor } from './editors'
import { briefFromTopic, STORY_TOPICS } from './topics'
import type { Board } from './types'

const board: Board = {
  version: 1,
  title: '灯塔',
  assets: [{ id: 'scene1', type: 'SCENE', name: '虚构灯塔', description: '海边' }],
  reviewNotes: [],
  shots: [
    {
      id: 's1',
      no: 1,
      duration: 30,
      visual: '海边灯塔',
      narration: '旁白',
      dialogue: '',
      shotSize: '远景',
      cameraMovement: '推进',
      characters: [],
      scene: 'scene1',
      props: [],
      imagePrompt: '',
      videoPrompt: '',
      sourceIds: [],
    },
  ],
}

describe('creation structured editors', () => {
  it('keeps edits to one selected topic out of other drafts and the reusable topic', () => {
    const first = briefFromTopic(STORY_TOPICS[0])
    const second = briefFromTopic(STORY_TOPICS[0])
    first.sources[0].title = '我的修改'
    first.sources.push({ id: 'extra', title: '补充资料', url: '', license: '' })
    expect(second.sources).toEqual(STORY_TOPICS[0].sources)
    expect(second.sources[0].title).not.toBe('我的修改')
    expect(DEFAULT_BRIEF.sources).toEqual(second.sources)
  })
  it('starts with a competition story and keeps audience and channel settings optional and collapsed', () => {
    const html = renderToStaticMarkup(<BriefEditor brief={DEFAULT_BRIEF} onChange={() => {}} />)
    expect(html).toContain('八仙过海')
    expect(html).toContain('戚继光')
    expect(html).toContain('苏轼')
    expect(html).toContain('民间传说')
    expect(html).toContain('来源')
    expect(html).toMatch(/<details><summary>补充设置（选填）<\/summary>/)
    expect(html).not.toContain('details open')
    expect(DEFAULT_BRIEF.audience).toBe('')
    expect(DEFAULT_BRIEF.channel).toBe('')
    expect(DEFAULT_BRIEF.sources.length).toBeGreaterThan(0)
  })
  it('offers structured fields and asset reference selectors for every shot', () => {
    const html = renderToStaticMarkup(<StoryboardEditor board={board} onChange={() => {}} />)
    for (const label of ['时长', '画面', '旁白', '对白', '景别', '运镜', '角色', '场景', '道具'])
      expect(html).toContain(label)
    expect(html).toContain('<select')
    expect(html).toContain('虚构灯塔')
    expect(html).toContain('scene1')
  })
})
