import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { OutlineEditor } from './OutlineEditor'
import type { Outline } from './types'

const outline: Outline = { directions: ['a', 'b'].map((id) => ({ id, title: id, angle: '传说', keyMessage: '故事', beats: ['开场', '收束'], emotion: '好奇', callToAction: '了解蓬莱', sourceIds: ['knowledge-1-v2'], reviewNotes: ['待核授权'] })), selectedId: 'b', selectionReason: '人工选择' }
describe('brainstorm outline editor', () => {
  it('exposes every direction, stable selection, source references and manual selection reason', () => {
    const html = renderToStaticMarkup(<OutlineEditor outline={outline} onChange={vi.fn()} />)
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html).toMatch(/type="radio"[^>]*checked/)
    for (const label of ['采用与放弃理由', '引用来源 ID', '待核实项', '故事节点', '切入点', '核心信息']) expect(html).toContain(label)
    expect(html).toContain('knowledge-1-v2')
    expect(html).toContain('人工选择')
  })
})
