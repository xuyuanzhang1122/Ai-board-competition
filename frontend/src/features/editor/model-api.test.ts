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
      {
        code: 'deepseek-flash',
        enabled: 1,
        id: 1,
        name: 'DeepSeek Flash',
        provider: 'DeepSeek',
        type: 'LANGUAGE',
      },
    ]
    vi.mocked(client.get).mockResolvedValueOnce(models)

    const result = await modelApi.getModels('LANGUAGE')

    expect(client.get).toHaveBeenCalledWith('/ai-models', {
      params: { type: 'LANGUAGE' },
    })
    expect(result).toEqual(models)
  })

  it('filters stale text catalog rows without inventing an available fallback', async () => {
    const client = (await import('@/shared/api/client')).default
    vi.mocked(client.get).mockResolvedValueOnce([
      {
        code: 'gemini-3.5-flash',
        provider: 'Geeknow',
        enabled: 1,
        type: 'LANGUAGE',
      },
      {
        code: 'deepseek-flash',
        provider: 'DeepSeek',
        enabled: 0,
        type: 'LANGUAGE',
      },
      {
        code: 'deepseek-v4-pro',
        provider: 'Geeknow',
        enabled: 1,
        type: 'LANGUAGE',
      },
    ])
    expect(await modelApi.getModels('LANGUAGE')).toEqual([])
  })
})
