import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toolboxApi } from './api'

const clientMocks = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({
  default: {
    delete: vi.fn(),
    get: clientMocks.get,
    post: vi.fn(),
    put: vi.fn(),
  },
}))

describe('toolbox API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('unwraps history records and maps deployed backend field aliases', async () => {
    clientMocks.get.mockResolvedValue({
      records: [
        {
          id: 1,
          sessionId: 9,
          type: 'TEXT',
          model: 'gemini-3.5-flash',
          inputPrompt: '后端提示词',
          prompt: '旧提示词',
          resultContent: '后端结果',
          text: '旧结果',
          status: 'SUCCEEDED',
          costPoints: 1,
          createdAt: '2026-06-27T10:00:00',
          expireAt: '2026-07-04T10:00:00',
        },
      ],
    })

    await expect(toolboxApi.getHistory()).resolves.toEqual([
      expect.objectContaining({
        id: 1,
        prompt: '后端提示词',
        text: '后端结果',
        resultUrl: null,
      }),
    ])
    expect(clientMocks.get).toHaveBeenCalledWith('/toolbox/history', {
      params: { page: 1, size: 100 },
    })
  })
})
