import { describe, expect, it, vi } from 'vitest'

import api from '@/shared/api/client'

import { forSession } from './api'

vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))

describe('brainstorm API', () => {
  it('binds every call to the captured account session and original request', async () => {
    const session = { token: 'captured', userId: 3 }
    const client = forSession(session)
    const payload = { requestId: 'fixed', revision: 4, model: 'official-model' }
    await client.run(7, payload)
    await client.confirm(7, 4)
    await client.handoff(7, { revision: 4, requestId: 'link-id' })
    await client.export(7)
    expect(api.post).toHaveBeenCalledWith('/brainstorms/7/runs', payload, { accountSession: session })
    expect(api.post).toHaveBeenCalledWith('/brainstorms/7/confirm', { revision: 4 }, { accountSession: session })
    expect(api.post).toHaveBeenCalledWith('/brainstorms/7/creation', { revision: 4, requestId: 'link-id' }, { accountSession: session })
    expect(api.get).toHaveBeenCalledWith('/brainstorms/7/export', { accountSession: session })
  })
  it('sends revision and run identity when adopting or editing', async () => {
    const client = forSession({ token: 't', userId: 2 })
    await client.adopt(7, 8, 9)
    await client.save(7, { revision: 9, brief: {} as never, outline: null })
    expect(api.post).toHaveBeenCalledWith('/brainstorms/7/runs/8/adopt', { revision: 9 }, expect.any(Object))
    expect(api.put).toHaveBeenCalledWith('/brainstorms/7', { revision: 9, brief: {}, outline: null }, expect.any(Object))
  })
})
