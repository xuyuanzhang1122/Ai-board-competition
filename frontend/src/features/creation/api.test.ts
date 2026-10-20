import { describe, expect, it, vi } from 'vitest'

import api from '@/shared/api/client'

import { creationApi } from './api'

vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))

describe('creation API contract', () => {
  it('downloads Excel through the authenticated Axios client in blob mode', async () => {
    const workbook = new Blob(['xlsx'])
    vi.mocked(api.get).mockResolvedValueOnce(workbook)
    expect(await creationApi.export(12)).toBe(workbook)
    expect(api.get).toHaveBeenCalledWith('/creation/drafts/12/export', { responseType: 'blob' })
  })
  it('sends the original request snapshot unchanged to the generation endpoint', async () => {
    const payload = {
      requestId: 'kept-uuid',
      revision: 3,
      stage: 'SCRIPT' as const,
      model: 'live-catalog-model',
    }
    vi.mocked(api.post).mockResolvedValueOnce({ id: 7 })
    await creationApi.generate(12, payload)
    expect(api.post).toHaveBeenCalledWith('/creation/drafts/12/runs', payload, undefined)
  })
  it('uses revision checks for saving, adopting, and confirming', async () => {
    const payload = { revision: 3, brief: {} as never, script: '稿', storyboard: null }
    await creationApi.save(12, payload)
    await creationApi.adopt(12, 9, 3)
    await creationApi.confirm(12, 4, 'SCRIPT')
    expect(api.put).toHaveBeenCalledWith('/creation/drafts/12', payload, undefined)
    expect(api.post).toHaveBeenCalledWith(
      '/creation/drafts/12/runs/9/adopt',
      { revision: 3 },
      undefined,
    )
    expect(api.post).toHaveBeenCalledWith(
      '/creation/drafts/12/confirm',
      {
        revision: 4,
        stage: 'SCRIPT',
      },
      undefined,
    )
  })
})
