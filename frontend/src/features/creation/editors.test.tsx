import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DEFAULT_BRIEF } from './defaults'
import { BriefEditor, StoryboardEditor } from './editors'
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
  it('labels the default brief as fiction and exposes source maintenance without claiming review', () => {
    const html = renderToStaticMarkup(<BriefEditor brief={DEFAULT_BRIEF} onChange={() => {}} />)
    expect(html).toContain('纯虚构')
    expect(html).toContain('来源')
    expect(html).toContain('未经审核')
    expect(html).toContain('受众')
    expect(html).toContain('传播目标')
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
