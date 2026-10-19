import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toolboxApi } from './api'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }))
vi.mock('@/shared/api/client', () => ({ default: http }))
describe('server-owned toolbox API', () => {
  beforeEach(() => vi.clearAllMocks())
  it('loads authoritative messages from the durable chat endpoint', async () => {
    http.get.mockResolvedValue({ session: { id: 4 }, messages: [] })
    await toolboxApi.getSession(4)
    expect(http.get).toHaveBeenCalledWith('/toolbox/chat/sessions/4')
  })
  it('submits a stable request ID without browser-supplied conversation history', async () => {
    const command = {
      clientRequestId: 'stable-id',
      type: 'TEXT' as const,
      model: 'catalog-code',
      content: 'hello',
    }
    await toolboxApi.sendMessage(4, command)
    expect(http.post).toHaveBeenCalledWith('/toolbox/chat/sessions/4/messages', command)
  })
  it('only cancels through an explicit assistant message action', async () => {
    await toolboxApi.cancelMessage(8)
    expect(http.post).toHaveBeenCalledWith('/toolbox/chat/messages/8/cancel')
  })
})
