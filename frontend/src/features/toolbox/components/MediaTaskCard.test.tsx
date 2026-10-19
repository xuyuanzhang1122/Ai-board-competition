import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from '../api'
import { MediaTaskCard } from './MediaTaskCard'

const message: ChatMessage = {
  id: 18,
  role: 'ASSISTANT',
  type: 'IMAGE',
  content: '',
  model: null,
  jobId: 8,
  status: 'RUNNING',
  resultUrl: null,
  errorMessage: null,
  createdAt: '',
}
describe('media task presentation', () => {
  it('shows the server running state without inventing a percentage or completion estimate', () => {
    const html = renderToStaticMarkup(<MediaTaskCard message={message} onCancel={vi.fn()} />)
    expect(html).toContain('正在创建图像')
    expect(html).toContain('toolbox-media-canvas')
    expect(html).not.toContain('%')
    expect(html).not.toContain('即将完成')
    expect(html).toContain('停止任务')
  })
  it('shows a real optional progress measurement and derives near-completion only from it', () => {
    const html = renderToStaticMarkup(
      <MediaTaskCard message={message} progress={97} onCancel={vi.fn()} />,
    )
    expect(html).toContain('97%')
    expect(html).toContain('即将完成')
  })
  it('renders a completed image at its intrinsic ratio with a usable download link', () => {
    const html = renderToStaticMarkup(
      <MediaTaskCard
        message={{ ...message, status: 'SUCCEEDED', resultUrl: '/uploads/result.png' }}
        onCancel={vi.fn()}
      />,
    )
    expect(html).toContain('图像已创建')
    expect(html).toContain('src="/uploads/result.png"')
    expect(html).toContain('download=')
    expect(html).not.toContain('toolbox-media-canvas')
    expect(html).not.toContain('停止任务')
  })
  it.each(['FAILED', 'CANCELED'] as const)(
    'makes a terminal %s state explicit without simulated progress',
    (status) => {
      const html = renderToStaticMarkup(
        <MediaTaskCard
          message={{ ...message, status, errorMessage: '媒体暂未开放' }}
          onCancel={vi.fn()}
        />,
      )
      expect(html).toContain(status === 'FAILED' ? '创建失败' : '已取消')
      expect(html).not.toContain('%')
      expect(html).not.toContain('停止任务')
    },
  )
})
