import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ChatComposer } from './ChatComposer'

const props = {
  content: 'hello',
  onContentChange: vi.fn(),
  model: '',
  onModelChange: vi.fn(),
  models: [],
  type: 'TEXT' as const,
  onTypeChange: vi.fn(),
  busy: false,
  locked: false,
  onSend: vi.fn(),
}
describe('conversation composer', () => {
  it('disables sending when no server model is available', () => {
    const html = renderToStaticMarkup(<ChatComposer {...props} />)
    expect(html).toContain('暂无可用文字模型')
    expect(html).toMatch(/<button[^>]*aria-label="发送消息"[^>]*disabled/)
  })
  it('makes unimplemented media visibly unavailable without a submit path', () => {
    const html = renderToStaticMarkup(<ChatComposer {...props} type="IMAGE" />)
    expect(html).toContain('图片生成暂未开放')
    expect(html).toMatch(/<button[^>]*aria-label="发送消息"[^>]*disabled/)
  })
})
