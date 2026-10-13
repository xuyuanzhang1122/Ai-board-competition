import { describe, expect, it, vi } from 'vitest'

import { modelApi } from './model-api'

vi.mock('@/shared/api/client', () => ({
  default: {
    defaults: { baseURL: '/api' },
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

describe('model api', () => {
  it('fetches models by type', async () => {
    const client = (await import('@/shared/api/client')).default
    const models = [
      { code: 'gpt-4', enabled: 1, id: 1, name: 'GPT-4', provider: 'openai', type: 'LANGUAGE' },
    ]
    vi.mocked(client.get).mockResolvedValueOnce(models)

    const result = await modelApi.getModels('LANGUAGE')

    expect(client.get).toHaveBeenCalledWith('/ai-models', { params: { type: 'LANGUAGE' } })
    expect(result).toEqual(models)
  })
})
