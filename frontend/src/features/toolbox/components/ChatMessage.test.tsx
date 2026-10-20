import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import type { ChatMessage } from '../api'
import { ConversationMessage } from './ChatMessage'

vi.mock('@/shared/api/client', () => ({ default: {} }))
vi.mock('@lobehub/ui', () => ({
  Markdown: ({ children }: { children: string }) => children,
}))

const message: ChatMessage = {
  id: 1,
  role: 'ASSISTANT',
  type: 'TEXT',
  content: '',
  model: null,
  jobId: 1,
  status: 'PENDING',
  resultUrl: null,
  errorMessage: null,
  createdAt: '',
}
it.each(['PENDING', 'RUNNING'] as const)(
  'uses an accessible animated dot during %s without submission text',
  (status) => {
    const html = renderToStaticMarkup(
      <ConversationMessage message={{ ...message, status }} onCancel={vi.fn()} />,
    )
    expect(html).toContain('toolbox-thinking-dot')
    expect(html).toContain('aria-label="正在生成回复"')
    expect(html).not.toMatch(/已提交|等待处理|正在思考|提交任务/)
    expect(html).toContain('aria-label="停止生成"')
  },
)
it('replaces loading with the actual failure instead of hiding errors', () => {
  const html = renderToStaticMarkup(
    <ConversationMessage
      message={{ ...message, status: 'FAILED', errorMessage: '上游连接失败' }}
      onCancel={vi.fn()}
    />,
  )
  expect(html).toContain('上游连接失败')
  expect(html).not.toContain('toolbox-thinking-dot')
})
